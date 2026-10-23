//多人同時編輯共用核心之真後端 API 測試(perm-run01; 規則帳本 R-BASELINE-01、R-CONTRACT-01、R-SAVED-ROWS-01、R-LOCK-CORE-01; ADR-037 Update(perm-run01); 共用規格 dspec/多人同時編輯之寫入契約.md V2/V5/V10/V13/V14)。
//
//與 api-externalRows 之分工: 該檔涵蓋外部列守門與基準拒收之細部(格式不合 19 種、名次 EX-005d、order 重編號);本檔專驗 perm-run01 新增的**經真實資料通道/RPC**之行為:
//  [B1] V10 同構: 經資料通道 select 讀回之列, 以前端同一組函數(makeBaseline)算出之基準, 被伺服端(鎖內新鮮讀取重算)接受; 竄改任一列摘要即 saveStale(對照, 證明比對真的執行).
//  [B2] 存檔回傳寫入後之列(規格第 8 節; 修已知缺口 a 之伺服端): 帶 returnRows:true 成功回 { msg, rows, others }, rows 等於寫入後庫內該表(依 order),
//       引用連帶有改寫引用端時 others 帶其全部列; 不帶 returnRows 仍回字串 'saveTabItemsSuccess'; 以回傳列建立之基準可立即再存(不等推播), 舊基準則被拒(對照).
//  [B3] 空值等價(修已知缺口 d): 庫內為 '' 之欄位, 基準由 null／缺欄之列建立 → 不誤擋(同表他人清空已空欄位不算變更).
//  [B4] 客戶端 opt 只採 baseline／returnRows: 帶 mustExist:false、keepUserId:true、pickKeysOnly 等其餘鍵, 行為與不帶相同(不被採納、不轉給 ORM).
//  [B5] 同鎖(V14, 真後端): 同表之並行 updateGrups 與外部同步端點交錯發出多輪, 全數結束(無死結), 終態: 外部列在、後台寫入之列在、無重複主鍵.
//輸入空間: 表 {users, grups, pemis, targets}(B1、B2 四表逐表)× 基準 {正確, 竄改, 回傳列建立之新基準, 舊基準} × 回傳形狀 {returnRows 有／無} × 引用連帶 {無, 群組改名〔others.users〕};B3 取 users;B4 取 grups;B5 取 grups。
//跑法(需測試鎖): npx mocha test/api-baseline.test.mjs --timeout 300000
import assert from 'assert'
import { makeBaseline } from '../src/js/rowDigest.mjs'
import { assertPristineSeed } from './tools/baseSeed.mjs'
import { startApi, TOKEN_ADMIN, TOKEN_APP, callRpc, urlSync, readTables, purgeExternalRows, selectAllRows } from './tools/api-setup.mjs'
import { restartBackend } from './tools/e2e-setup.mjs'

const A = assert.strict
const KTS = ['users', 'grups', 'pemis', 'targets']
const FN = { users: 'updateUsers', grups: 'updateGrups', pemis: 'updatePemis', targets: 'updateTargets' }
const NAME_KEY = { users: 'name', grups: 'name', pemis: 'name', targets: 'id' }
const F_SYNC = 'appAbSync'

let clone = (o) => JSON.parse(JSON.stringify(o))
let byOrder = (a, b) => ((a.order || 0) - (b.order || 0)) || (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0))
let rowsOf = async (kt) => (await selectAllRows(kt)).slice().sort(byOrder).map(clone) //經資料通道(實際傳輸路徑)
let write = (kt, rows, opt) => callRpc(FN[kt], opt === undefined ? [rows] : [rows, opt], TOKEN_ADMIN)
let postSync = async (kt, body) => {
    let url = urlSync.replace('{keyTable}', kt).replace('{token}', TOKEN_APP)
    return await (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) })).json()
}
let patch = (rows, id, o) => rows.map((r) => (r.id === id ? { ...r, ...o } : r))
let firstId = (rows) => rows[0].id


describe('api-baseline (多人同時編輯共用核心, 真後端, perm-run01)', function() {
    this.timeout(300000)

    let BASE = null
    //restoreBase: 四表還原為 base seed, 次序「被引用者先、引用端後」(targets → pemis → grups → users; 同 api-refCascade 之 restoreAll)。
    //  共用 restoreTables 之次序為 users → grups → pemis: 在 AB-3(群組改名連帶改寫 users.cgrups)之後, 先把引用端 users 指回尚無實體之舊名, 隨後 grups 改回原名即被
    //  renameCascadeNameInUse 拒絕(2026-10-23 首跑 AB-3 之 afterEach 失敗); 故本檔自行依階層還原。外部列夾具先以 purgeExternalRows 直接移除(後台整表寫入不得刪外部列)。
    let restoreBase = async () => {
        await purgeExternalRows(KTS, { keepIds: Object.fromEntries(KTS.map((kt) => [kt, BASE[kt].map((r) => r.id)])) })
        for (let kt of ['targets', 'pemis', 'grups', 'users']) {
            let r = await callRpc(FN[kt], [clone(BASE[kt])], TOKEN_ADMIN)
            if (!r.ok) {
                throw new Error(`restoreBase ${FN[kt]} 失敗: ${JSON.stringify(r).slice(0, 200)}`)
            }
        }
    }

    before(async function() {
        this.timeout(300000)
        await startApi()
        for (let kt of KTS) {
            assertPristineSeed(kt, await selectAllRows(kt))
        }
        BASE = await readTables()
        BASE.targets = await rowsOf('targets')
    })

    afterEach(async function() {
        this.timeout(120000)
        await purgeExternalRows(['users', 'grups', 'pemis', 'targets'], { froms: [F_SYNC], keepIds: { targets: BASE.targets.map((r) => r.id) } })
        await restoreBase()
    })

    after(async function() {
        this.timeout(300000)
        await restartBackend('./settings.json')
        await restoreBase()
    })

    for (let kt of KTS) {

        it(`AB-1 ${kt}: V10 同構——經資料通道讀回之列, 前端函數算出之基準被伺服端接受; 竄改任一列摘要即 saveStale(零寫入)  [B1]`, async function() {
            let rows = await rowsOf(kt)
            let bl = makeBaseline(rows, kt)
            A.ok(bl.length === rows.length && bl.every((e) => /^h1:[0-9a-f]{14}$/.test(e[1])))
            let ok = await write(kt, rows, { baseline: bl })
            A.ok(ok.ok, `正確基準應被接受: ${ok.msg}`)
            let s1 = JSON.stringify(await rowsOf(kt))
            let bad = clone(bl)
            bad[0][1] = bad[0][1].slice(0, -1) + (bad[0][1].endsWith('0') ? '1' : '0')
            let r = await write(kt, rows, { baseline: bad })
            A.equal(r.ok, false)
            A.equal(r.msg, 'saveStale', '摘要不符 → saveStale')
            A.equal(JSON.stringify(await rowsOf(kt)), s1, '被拒: 零寫入')
        })

        it(`AB-2 ${kt}: 帶 returnRows 回 { msg, rows, others }, rows＝寫入後庫內該表; 不帶回字串; 回傳列建之新基準可立即再存、舊基準被拒  [B2]`, async function() {
            let rows = await rowsOf(kt)
            let id = firstId(rows)
            let bl0 = makeBaseline(rows, kt)
            //不帶 returnRows: 字串
            let r0 = await write(kt, patch(rows, id, { description: 'ab2-plain' }), { baseline: bl0 })
            A.ok(r0.ok)
            A.equal(r0.output, 'saveTabItemsSuccess', '不帶 returnRows 仍回成功 msg key 字串')
            //帶 returnRows
            let rows1 = await rowsOf(kt)
            let bl1 = makeBaseline(rows1, kt)
            let r1 = await write(kt, patch(rows1, id, { description: 'ab2-rows' }), { baseline: bl1, returnRows: true })
            A.ok(r1.ok, `應成功: ${r1.msg}`)
            A.ok(r1.output && typeof r1.output === 'object' && r1.output.msg === 'saveTabItemsSuccess', '回 { msg, rows, others }')
            A.deepEqual(r1.output.rows.map((r) => r.id), (await rowsOf(kt)).map((r) => r.id), 'rows 之列與庫內該表相同(依 order 序)')
            A.deepEqual(r1.output.rows, await rowsOf(kt), 'rows 即寫入後庫內該表(逐欄相等, 含伺服器填寫之欄位)')
            A.deepEqual(r1.output.others, {}, '無引用連帶改寫 → others 為空物件')
            A.equal(r1.output.rows.find((r) => r.id === id).description, 'ab2-rows')
            //以回傳列建新基準 → 立即再存成功(不等推播; 規格第 8 節); 以舊基準 bl1 → 被拒(對照)
            let bl2 = makeBaseline(r1.output.rows, kt)
            let r2 = await write(kt, patch(r1.output.rows, id, { description: 'ab2-again' }), { baseline: bl2, returnRows: true })
            A.ok(r2.ok, `回傳列建之新基準應可立即再存: ${r2.msg}`)
            let r3 = await write(kt, patch(r2.output.rows, id, { description: 'ab2-old-baseline' }), { baseline: bl1 })
            A.equal(r3.ok, false)
            A.equal(r3.msg, 'saveStale', '舊基準被拒')
            A.equal((await rowsOf(kt)).find((r) => r.id === id).description, 'ab2-again', '被拒者零寫入')
        })
    }

    it('AB-3 引用連帶: 群組改名連帶改寫使用者 cgrups → others.users 帶引用端全部列, 與庫內相同  [B2]', async function() {
        let grups = await rowsOf('grups')
        let g = grups.find((r) => r.name === '權限群組M1')
        let bl = makeBaseline(grups, 'grups')
        let r = await write('grups', patch(grups, g.id, { name: '權限群組M1-改名' }), { baseline: bl, returnRows: true })
        A.ok(r.ok, `改名應成功: ${r.msg}`)
        A.deepEqual(Object.keys(r.output.others), ['users'], '引用端表 users 被改寫 → others 帶 users')
        A.deepEqual(r.output.others.users, await rowsOf('users'), 'others.users 即寫入後庫內 users')
        A.ok(r.output.others.users.some((u) => String(u.cgrups).includes('權限群組M1-改名')), '引用已連帶改為新名稱')
        A.deepEqual(r.output.rows, await rowsOf('grups'))
    })

    it("AB-4 空值等價(修 d): 庫內欄位為 ''、基準由 null／缺欄之列建立 → 不誤擋  [B3]", async function() {
        let rows = await rowsOf('users')
        let id = firstId(rows)
        //先把某列 description 清為 ''(後台寫入, 不帶基準)
        A.ok((await write('users', patch(rows, id, { description: '' }))).ok)
        let rows1 = await rowsOf('users')
        A.equal(rows1.find((r) => r.id === id).description, '', '前提: 庫內為空字串')
        for (let v of [null, undefined]) {
            let asNull = rows1.map((r) => (r.id === id ? { ...r, description: v } : r))
            let bl = makeBaseline(asNull, 'users')
            let r = await write('users', rows1, { baseline: bl })
            A.ok(r.ok, `description=${String(v)} 建立之基準應與庫內 '' 等價: ${r.msg}`)
        }
        let miss = rows1.map((r) => { let o = { ...r }; if (r.id === id) { delete o.description } return o })
        A.ok((await write('users', rows1, { baseline: makeBaseline(miss, 'users') })).ok, '缺欄亦等價')
        //對照: 真的不同值仍被偵測
        let diff = rows1.map((r) => (r.id === id ? { ...r, description: 'x' } : r))
        let r = await write('users', rows1, { baseline: makeBaseline(diff, 'users') })
        A.equal(r.ok, false)
        A.equal(r.msg, 'saveStale')
    })

    it('AB-5 客戶端 opt 只採 baseline／returnRows: 帶 mustExist:false、keepUserId:true、pickKeysOnly、skipDup、foo 等其餘鍵 → 行為同不帶(整表 diff 照常、不被採納)  [B4]', async function() {
        let rows = await rowsOf('grups')
        let id = firstId(rows)
        let bl = makeBaseline(rows, 'grups')
        let r = await write('grups', patch(rows, id, { description: 'ab5' }), { baseline: bl, returnRows: true, mustExist: false, keepUserId: true, pickKeysOnly: ['cpemis'], skipDup: true, foo: 1 })
        A.ok(r.ok, `應成功: ${r.msg}`)
        let row = (await rowsOf('grups')).find((x) => x.id === id)
        A.equal(row.description, 'ab5', 'pickKeysOnly 未被採納: description 照常寫入')
        A.equal(row.userId, rows.find((x) => x.id === id).userId, 'keepUserId 未被採納: 擁有者(userId)不變')
        //非物件之 opt 當成沒有基準(沿用既有政策, 與 api-externalRows 一致); 本案不改變引用故不需身分宣告, 並以 noDecl 保持第 2 參原樣為字串(callRpc 預設會把非物件之第 2 參換成帶宣告之物件)
        let r2 = await callRpc(FN.grups, [patch(await rowsOf('grups'), id, { description: 'ab5b' }), 'x'], TOKEN_ADMIN, { noDecl: true })
        A.ok(r2.ok)
    })

    it('AB-6 同鎖(V14, 真後端): 同表並行 updateGrups 與外部同步端點多輪交錯 → 全數結束(無死結)、後台寫入只有「成功」或「外部列已被同步改動而拒收」、同步恆成功、每輪終態與勝負一致  [B5]', async function() {
        //外審 sol#5(2026-10-23): 原斷言接受 saveWriteFail 等廣泛錯誤與同步 error, 後台寫入全失敗也會通過. 改為: 逐輪限定可預期之結果並驗實際欄位終態.
        //  後台寫入(不帶基準)與同步在同一把表鎖上交錯, 結果只有兩種(每輪起點的快照含上輪外部列內容):
        //    ①寫入先: 寫入成功(外部列內容與庫內相同), 其後同步把外部列改為本輪內容 → 後台列說明＝本輪值、外部列說明＝本輪值
        //    ②同步先: 庫內外部列已是本輪內容, 寫入帶的是上輪內容 → 外部列鎖定欄異動 → saveExternalRowChanged 整次拒收、零寫入 → 後台列說明＝上輪終態、外部列說明＝本輪值
        //  任何其他結果(saveWriteFail、saveStale、同步 error、逾時＝死結)皆為缺陷.
        let withTimeout = (p, ms, label) => Promise.race([p, new Promise((resolve, reject) => setTimeout(() => reject(new Error(`${label} 逾時(疑似死結)`)), ms))])
        //perm-run03(R-IMPORT-01): 同步端點不收 id、每列帶 srcKey(來源鍵; 內部主鍵由伺服端產生); 每輪重送同 srcKey 之列＝修改既有外部列(id 不變), 故終態依 srcKey 找列
        let fx = [{ srcKey: 'sk-ab-x1', order: 100, name: 'ab-x1', description: '外部一', cpemis: '{}' }, { srcKey: 'sk-ab-x2', order: 101, name: 'ab-x2', description: '外部二', cpemis: '{}' }]
        A.equal((await postSync('grups', { from: F_SYNC, rows: fx })).state, 'success')
        let id = BASE.grups[0].id
        let want = BASE.grups[0].description
        let wins = 0
        //對照(增量外審 sol#3): 外部列存在且內容未變時, 單獨修改後台列必須成功——排除「只要表內有外部列就一律拒收後台寫入」的錯誤實作也能通過下列交錯斷言(落敗輪恆為 saveExternalRowChanged)
        let pre = await write('grups', patch(await rowsOf('grups'), id, { description: 'ab6-pre' }))
        A.ok(pre.ok, `外部列存在且未變時, 單獨修改後台列應成功: ${pre.msg}`)
        want = 'ab6-pre'
        A.equal((await rowsOf('grups')).find((r) => r.id === id).description, 'ab6-pre', '對照: 後台列說明已寫入')
        for (let k = 0; k < 6; k++) {
            let rows = await rowsOf('grups')
            let [w, s] = await withTimeout(Promise.all([
                write('grups', patch(rows, id, { description: `ab6-${k}` })),
                postSync('grups', { from: F_SYNC, rows: fx.map((x) => ({ ...x, description: `外部-${k}` })) }),
            ]), 60000, `AB-6 第 ${k} 輪`)
            A.equal(s.state, 'success', `第 ${k} 輪外部同步應成功: ${JSON.stringify(s).slice(0, 200)}`)
            if (w.ok) {
                want = `ab6-${k}`
                wins++
            }
            else {
                A.equal(w.msg, 'saveExternalRowChanged', `第 ${k} 輪後台寫入落敗時只能是外部列已被同步改動: ${w.msg}`)
            }
            let gs = await rowsOf('grups')
            A.equal(gs.find((r) => r.id === id).description, want, `第 ${k} 輪終態: 後台列說明須等於最後一次成功寫入之值(寫入成功而未生效＝寫入失效; 落敗而被改＝非零寫入)`)
            A.equal(gs.filter((r) => r.from === F_SYNC).length, 2, `第 ${k} 輪終態: 外部分區恆為 2 列(同 srcKey 重送＝修改, 不重複新增)`)
            A.equal(gs.find((r) => r.srcKey === 'sk-ab-x1').description, `外部-${k}`, `第 ${k} 輪終態: 外部列 x1 說明須為本輪同步內容`)
            A.equal(gs.find((r) => r.srcKey === 'sk-ab-x2').description, `外部-${k}`, `第 ${k} 輪終態: 外部列 x2 說明須為本輪同步內容`)
            A.equal(new Set(gs.map((r) => r.id)).size, gs.length, `第 ${k} 輪: 無重複主鍵`)
        }
        console.log(`[api-baseline AB-6] 六輪中後台寫入先於同步而成功 ${wins} 輪, 落敗(saveExternalRowChanged) ${6 - wins} 輪`)
    })

})
