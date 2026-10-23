//正反關聯與主體身分檢查之真後端 API 測試(perm-run02 範圍一; 使用者 2026-10-23 裁示「正反關聯與主體身份檢查, 應該是前後端都要做」; 規則帳本草案 R-SUBJECT-ID-01 規則 4〔伺服端強制〕、R-REF-IDENTITY-01、R-LOCK-CORE-01; R-PRINCIPLE-00 原則 3、4、6)。
//
//與 unit-procCore-identity 之分工: 該檔以替身資料表驗伺服端邏輯與鎖(含四表隨機併發)；本檔專驗**經真實資料通道/RPC**(updateUsers／updateGrups／updatePemis／updateTargets 第 3 參帶 subject／refs)之端到端行為:
//  [A1] 反向主體 subject（updateUsers 之主體為群組、updateGrups 之主體為權限）: 相符成功; 主體被刪除後以同名重建（id 不同, saved:true）→ saveSubjectChanged、庫內零變更、srLog identity-error（reason gone, n 1, 不含名稱／id）;
//  [A2] 正向 refs（users.cgrups→grups、grups.cpemis→pemis、pemis.crules→targets）: 宣告相符成功; 被引用實體已刪除 → saveRefChanged; 〔users／grups〕刪後同名重建（id 不同）→ saveRefChanged;
//       〔pemis〕targets 之 id 即名稱, 刪後同 id 重建依定義是同一實體 → 成功（設計事實, R-REF-IDENTITY-01 規則 5）; 宣告不完整 → saveRefChanged／refIncomplete;
//  [A3] 相容: 不帶宣告（或 subject／refs 為 null）時行為與修正前相同——被引用實體已被替換者亦照舊成功寫入（外部應用相容, 名稱引用語意）;
//  [A4] 格式不合 → saveIdentityFormat/format（含 targets 帶 refs／subject）, 庫內零變更;
//  [A5] 真後端並發（V14）: 一邊存檔（帶宣告）、一邊「刪除被引用實體並以同名重建（pemis 為單純刪除）」各 6 輪（A 先／B 先 × 啟動間隔 0／4／12 ms）, 每輪終態只有兩種合法結果之一:
//       ①存檔成功（A 先持鎖）, 其後被引用實體才被替換, 且替換之引用連帶清理已把剛寫入之引用移除; ②被引用實體先被替換, 存檔被拒、零寫入;
//       不得出現「存檔成功但寫入之授權指向替換後之新實體」（終態為存檔成功且引用仍在）。
//輸入空間: 引用端 H {users, grups, pemis} × 宣告 {subject〔users, grups〕, refs} × 被引用實體狀態 {未變, 刪除, 刪後同名重建} ＋ 相容 {無第 3 參, subject:null＋refs:null} ＋ 格式不合 ＋ 並發 5 組（users-subject／users-refs／grups-subject／grups-refs／pemis-refs）× 6 輪。
//夾具: 每案前於 base seed 之上加三個未被任何人引用之實體（群組 idn-g、權限 idn-p、標的 專案IDN/頁1/區塊X）; 各案之引用端為 john（cgrups）、權限群組M3（cpemis）、權限P4（crules）之列; 每案後以「被引用者先、引用端後」(targets → pemis → grups → users)還原為 base seed（同 api-baseline／api-refCascade 之次序: 反序則引用端先指向尚無實體之名稱而使改名類寫入被拒）。
//測試 token: 'sys'(id-for-admin, 後台 RPC 操作者); DB 讀取一律經資料通道 select(selectAllRows), 寫入一律走後端 RPC。
//跑法(需測試鎖): node C:/opensrcOper/tools/quiet-run.mjs --name tidn --lock --timeout 1800 -- npx mocha test/api-identity.test.mjs --timeout 300000
//案數: 47（AI-1 6、AI-2 15、AI-3 6、AI-4 14、AI-5 5〔各 6 輪〕、AI-6 1）。實跑紀錄: 撰寫時以「行程內真 procCore＋替身資料表」乾跑 47 案全綠(驗證夾具、還原次序與斷言邏輯); 2026-10-23 perm-run02 主代理對真後端實跑(測試鎖內)47／47 通過(44 秒), 之後與 unit-*／其餘 api-* 同一行程 4021 過／0 敗(chain unitapi)。
//註(外審 sol#3, 2026-10-23): AI-5 並發案為「終態不變式」斷言(每輪終態只能是兩種合法結果之一, 不得出現存檔成功但授權指向替換後之新實體), 經 RPC 無法強制兩請求在伺服端交錯, 故不單獨證明「檢查與寫入同鎖」; 該證明由 unit-procCore-identity IDN-510／520 以人為延遲(替身表 select 加延遲, 事件序不交錯且終態等價依序執行)與取鎖軌跡(IDN-501)承擔, 本檔補真後端之格式、拒收、零寫入、相容與兩種次序皆能發生(各 3 輪)之實證。

import assert from 'assert'
import JSON5 from 'json5'
import procLang from '../server/procLang.mjs'
import { assertPristineSeed } from './tools/baseSeed.mjs'
import { startApi, TOKEN_ADMIN, callRpc, readTables, selectAllRows, markSrLog, readSrLogSince } from './tools/api-setup.mjs'
import { restartBackend } from './tools/e2e-setup.mjs'


const A = assert.strict
const KTS = ['users', 'grups', 'pemis', 'targets']
const FN = { users: 'updateUsers', grups: 'updateGrups', pemis: 'updatePemis', targets: 'updateTargets' }
const EVT = 'updateTabItems-identity-error'
const OKS = 'saveTabItemsSuccess'

//夾具實體（base seed 之外新增, 未被任何人引用）
const FX = { gId: 'id-idn-g', gName: 'idn-g', pId: 'id-idn-p', pName: 'idn-p', tId: '專案IDN/頁1/區塊X' }

//HOLD: 引用端表 → 被引用表、授權欄、引用端之編輯對象列（依名稱）、被引用夾具實體之名稱與 id
const HOLD = {
    users: { ref: 'grups', field: 'cgrups', holderName: 'john', name: FX.gName, id: FX.gId },
    grups: { ref: 'pemis', field: 'cpemis', holderName: '權限群組M3', name: FX.pName, id: FX.pId },
    pemis: { ref: 'targets', field: 'crules', holderName: '權限P4', name: FX.tId, id: FX.tId },
}
const H3 = ['users', 'grups', 'pemis']
const H2 = ['users', 'grups']

let clone = (o) => JSON.parse(JSON.stringify(o))
let sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let byId = (a, b) => String(a.id).localeCompare(String(b.id))
let byOrder = (a, b) => ((a.order || 0) - (b.order || 0)) || byId(a, b)
let withTimeout = (p, ms, label) => {
    let timer = null
    let tout = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}: ${ms} ms 內未完成`)), ms)
    })
    return Promise.race([p, tout]).finally(() => clearTimeout(timer))
}

//DB 讀取（經資料通道, 實際傳輸路徑）
let rowsOf = async (kt) => (await selectAllRows(kt)).slice().sort(byOrder).map(clone)
let snapKt = async (kt) => JSON.stringify((await selectAllRows(kt)).slice().sort(byId))
let snap4 = async () => JSON.stringify([await snapKt('users'), await snapKt('grups'), await snapKt('pemis'), await snapKt('targets')])

//後台寫入 RPC（第 3 參 opt 為用戶端給之 { baseline, returnRows, subject, refs }）
let write = (kt, rows, opt) => callRpc(FN[kt], opt === undefined ? [rows] : [rows, opt], TOKEN_ADMIN)
let mustWrite = async (kt, rows, opt) => {
    let r = await write(kt, rows, opt)
    A.ok(r.ok, `預置 ${FN[kt]} 應成功, 實得: ${JSON.stringify(r).slice(0, 300)}`)
    return r
}

//新列構造（整表寫入; order 由伺服器依陣列位置重給）
let gRow = (id, name) => ({ id, order: 0, name, description: `${name}說明`, from: '', cpemis: '{}' })
let pRow = (id, name) => ({ id, order: 0, name, description: `${name}說明`, from: '', crules: '{}' })
let tRow = (id) => ({ id, order: 0, description: `${id}說明`, from: '' })
let entRow = (ref, id, name) => (ref === 'grups' ? gRow(id, name) : (ref === 'pemis' ? pRow(id, name) : tRow(id)))

//授權字串加一個啟用引用（users.cgrups／grups.cpemis 為 { 名稱: { mode, isActive } }, pemis.crules 為 { 標的: 'y' }）
let addRef = (h, str, name) => {
    let kp = JSON5.parse(str)
    kp[name] = (h === 'pemis') ? 'y' : { mode: 'OR', isActive: 'y' }
    return JSON.stringify(kp)
}
//sendAdd: 引用端表整表, 其編輯對象列加上對夾具實體（或指定名稱）之啟用引用
let sendAdd = (h, rows, names = [HOLD[h].name]) => rows.map((r) => (r.name === HOLD[h].holderName ? { ...r, [HOLD[h].field]: names.reduce((s, n) => addRef(h, s, n), r[HOLD[h].field]) } : r))
let holderOf = (h, rows) => rows.find((r) => r.name === HOLD[h].holderName)
let authKeys = (h, rows) => Object.keys(JSON5.parse(holderOf(h, rows)[HOLD[h].field]))
let declOf = (h) => [{ name: HOLD[h].name, ids: [HOLD[h].id] }]
let subjOf = (h) => ({ id: HOLD[h].id, name: HOLD[h].name, saved: true })

//被引用實體被改動（經後端 RPC, 與真實「他人」同路徑）
let delEnt = async (h) => {
    let ref = HOLD[h].ref
    await mustWrite(ref, (await rowsOf(ref)).filter((r) => r.id !== HOLD[h].id))
}
//replaceEnt: users／grups——一次寫入刪除後以同名重建（id 不同）; pemis（targets）——先刪、再以同 id 重建（兩次寫入）
let replaceEnt = async (h) => {
    let ref = HOLD[h].ref
    if (h === 'pemis') {
        await delEnt(h)
        await mustWrite(ref, [...(await rowsOf(ref)), entRow(ref, HOLD[h].id, HOLD[h].name)])
        return HOLD[h].id
    }
    let newId = `${HOLD[h].id}-NEW`
    await mustWrite(ref, [...(await rowsOf(ref)).filter((r) => r.id !== HOLD[h].id), entRow(ref, newId, HOLD[h].name)])
    return newId
}

//srLog（pino 非同步落檔）: 以標記（動作之前取）定位, 等出現符合 pred 之行後回傳標記之後新增之全部行（同 api-refCascade 之 waitLines, R-SRLOG-MARK-01）
let waitLines = async (mark, pred, label, ms = 30000) => {
    let tEnd = Date.now() + ms
    let lines = []
    while (Date.now() < tEnd) {
        lines = readSrLogSince(mark)
        if (lines.some(pred)) {
            await sleep(800)
            return readSrLogSince(mark)
        }
        await sleep(300)
    }
    throw new Error(`${label}: ${ms} ms 內 srLog 未見預期之行(讀到 ${lines.length} 行)`)
}
//checkNoSecrets: srLog 各行不得含夾具實體之 id／名稱（動態原因只記 key、原因與筆數）
let checkNoSecrets = (lines, label) => {
    for (let l of lines) {
        if (String(l.event).startsWith('api/getPerm')) {
            continue
        }
        for (let s of [FX.gId, FX.gName, FX.pId, FX.pName, FX.tId, `${FX.gId}-NEW`, `${FX.pId}-NEW`]) {
            A.ok(!l._raw.includes(s), `${label} srLog 不得含值「${s}」: ${l._raw}`)
        }
    }
}
//expectIdentityLog: srLog 恰有一筆 identity-error（keyTable／msg／reason／n 正確）且不含名稱／id
let expectIdentityLog = async (mark, { keyTable, msg, reason, n }, label) => {
    let lines = await waitLines(mark, (l) => l.event === EVT && l.keyTable === keyTable && l.msg === msg, label)
    let hit = lines.filter((l) => l.event === EVT)
    A.equal(hit.length, 1, `${label} identity-error 應恰一筆`)
    A.equal(hit[0].reason, reason, `${label} reason`)
    A.equal(hit[0].n, n, `${label} n`)
    checkNoSecrets(lines, label)
}
//expectReject: 被拒——回指定語系鍵、四表逐位元不變、srLog 正確
let expectReject = async (h, rows, opt, key, reason, n, label) => {
    let s0 = await snap4()
    let mark = await markSrLog()
    let r = await write(h, rows, opt)
    A.equal(r.ok, false, `${label} 應被拒, 實得: ${JSON.stringify(r).slice(0, 300)}`)
    A.equal(r.msg, key, `${label} 應回語系鍵 ${key}, 實得: ${r.msg}`)
    A.equal(await snap4(), s0, `${label} 被拒時四表須逐位元不變(零寫入)`)
    await expectIdentityLog(mark, { keyTable: h, msg: key, reason, n }, label)
    return r
}
let checkLangKey = (key) => {
    let lang = procLang({})
    A.ok(typeof lang.eng[key] === 'string' && lang.eng[key].length > 0, `procLang.eng 須有 ${key}`)
    A.ok(typeof lang.cht[key] === 'string' && lang.cht[key].length > 0, `procLang.cht 須有 ${key}`)
}


describe('api-identity (正反關聯與主體身分檢查, 真後端, perm-run02)', function() {
    this.timeout(300000)

    let BASE = null

    //restoreBase: 四表還原為 base seed, 次序「被引用者先、引用端後」(targets → pemis → grups → users; 同 api-baseline／api-refCascade);
    //  夾具實體與被替換之實體（含其引用）由寫入時之刪除連帶清理處理, 引用端最後一併還原為 base seed
    let restoreBase = async () => {
        for (let kt of ['targets', 'pemis', 'grups', 'users']) {
            let r = await callRpc(FN[kt], [clone(BASE[kt])], TOKEN_ADMIN)
            if (!r.ok) {
                throw new Error(`restoreBase ${FN[kt]} 失敗: ${JSON.stringify(r).slice(0, 300)}`)
            }
        }
    }
    //setupFx: 於 base seed 之上加三個未被引用之夾具實體（被引用者先）
    let setupFx = async () => {
        await mustWrite('targets', [...(await rowsOf('targets')), tRow(FX.tId)])
        await mustWrite('pemis', [...(await rowsOf('pemis')), pRow(FX.pId, FX.pName)])
        await mustWrite('grups', [...(await rowsOf('grups')), gRow(FX.gId, FX.gName)])
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

    beforeEach(async function() {
        this.timeout(120000)
        await setupFx()
    })

    afterEach(async function() {
        this.timeout(120000)
        await restoreBase()
    })

    after(async function() {
        this.timeout(300000)
        await restartBackend('./settings.json')
        await restoreBase()
    })


    // ===== A1 反向主體 subject =====
    for (let h of H2) {
        let ref = HOLD[h].ref
        let who = h === 'users' ? '群組' : '權限'

        it(`AI-1a [${h} subject=${ref}] 主體（${who} ${HOLD[h].name}）原封不動 → 成功; 引用端授權已寫入; 主體表不變  [A1]`, async function() {
            let rows = await rowsOf(h)
            let refSnap = await snapKt(ref)
            let r = await write(h, sendAdd(h, rows), { subject: subjOf(h) })
            A.ok(r.ok, `應成功, 實得: ${JSON.stringify(r).slice(0, 300)}`)
            A.equal(r.output, OKS)
            A.ok(authKeys(h, await rowsOf(h)).includes(HOLD[h].name), '授權已寫入')
            A.equal(await snapKt(ref), refSnap, '主體表只讀不寫')
        })

        it(`AI-1b [${h} subject=${ref}] 主體被刪除後以同名重建（id 不同, saved:true）→ saveSubjectChanged/gone, 四表零變更, srLog 不含名稱／id（授權不得被同名新${who}接管）  [A1]`, async function() {
            let rows = await rowsOf(h) //使用者開框時所見
            let newId = await replaceEnt(h) //他人於開框期間刪除該${who}並以同名重建
            A.notEqual(newId, HOLD[h].id)
            await expectReject(h, sendAdd(h, rows), { subject: subjOf(h) }, 'saveSubjectChanged', 'gone', 1, `AI-1b ${h}`)
            checkLangKey('saveSubjectChanged')
        })

        it(`AI-1c [${h} subject=${ref}] 主體被刪除（未重建）→ saveSubjectChanged/gone; 主體被改名（同 id 異名）→ saveSubjectChanged/renamed; 四表零變更  [A1]`, async function() {
            let rows = await rowsOf(h)
            await delEnt(h)
            await expectReject(h, sendAdd(h, rows), { subject: subjOf(h) }, 'saveSubjectChanged', 'gone', 1, `AI-1c-del ${h}`)
            await restoreBase()
            await setupFx()
            let rows2 = await rowsOf(h)
            await mustWrite(ref, (await rowsOf(ref)).map((r) => (r.id === HOLD[h].id ? { ...r, name: `${HOLD[h].name}-改` } : r)))
            await expectReject(h, sendAdd(h, rows2), { subject: subjOf(h) }, 'saveSubjectChanged', 'renamed', 1, `AI-1c-ren ${h}`)
        })
    }

    // ===== A2 正向 refs =====
    for (let h of H3) {
        let ref = HOLD[h].ref

        it(`AI-2a [${h}→${ref}] 新增啟用引用且宣告相符 → 成功; 授權已寫入; 被引用表不變  [A2]`, async function() {
            let rows = await rowsOf(h)
            let refSnap = await snapKt(ref)
            let r = await write(h, sendAdd(h, rows), { refs: declOf(h) })
            A.ok(r.ok, `應成功, 實得: ${JSON.stringify(r).slice(0, 300)}`)
            A.equal(r.output, OKS)
            A.ok(authKeys(h, await rowsOf(h)).includes(HOLD[h].name))
            A.equal(await snapKt(ref), refSnap)
        })

        it(`AI-2b [${h}→${ref}] 被引用實體已被刪除 → saveRefChanged/refChanged(n 1), 四表零變更  [A2]`, async function() {
            let rows = await rowsOf(h)
            await delEnt(h)
            await expectReject(h, sendAdd(h, rows), { refs: declOf(h) }, 'saveRefChanged', 'refChanged', 1, `AI-2b ${h}`)
            checkLangKey('saveRefChanged')
        })

        if (h !== 'pemis') {
            it(`AI-2c [${h}→${ref}] 被引用實體刪除後以同名重建（id 不同）→ saveRefChanged/refChanged(n 1), 四表零變更（授權不得被同名新實體接管）  [A2]`, async function() {
                let rows = await rowsOf(h)
                await replaceEnt(h)
                await expectReject(h, sendAdd(h, rows), { refs: declOf(h) }, 'saveRefChanged', 'refChanged', 1, `AI-2c ${h}`)
            })
        }
        else {
            it(`AI-2c [${h}→${ref}] 標的刪除後以同 id 重建 → 依定義是同一實體, 成功寫入（設計事實, R-REF-IDENTITY-01 規則 5）  [A2]`, async function() {
                let rows = await rowsOf(h)
                await replaceEnt(h)
                A.ok((await rowsOf(ref)).some((r) => r.id === FX.tId), '前提: 標的已以同 id 重建')
                let r = await write(h, sendAdd(h, rows), { refs: declOf(h) })
                A.ok(r.ok, `同 id 重建＝同一實體, 應成功, 實得: ${JSON.stringify(r).slice(0, 300)}`)
                A.ok(authKeys(h, await rowsOf(h)).includes(FX.tId))
            })
        }

        it(`AI-2d [${h}→${ref}] 宣告不完整（新增兩個啟用引用僅宣告其一／空宣告）→ saveRefChanged/refIncomplete(n 1／n 2), 四表零變更  [A2]`, async function() {
            let rows = await rowsOf(h)
            let other = (h === 'users') ? '權限群組M1' : (h === 'grups' ? '權限P1' : '專案A/頁A/區塊A') //base seed 中既有之另一被引用實體（holder 原未引用者）
            await expectReject(h, sendAdd(h, rows, [other, HOLD[h].name]), { refs: declOf(h) }, 'saveRefChanged', 'refIncomplete', 1, `AI-2d-partial ${h}`)
            await expectReject(h, sendAdd(h, rows, [other, HOLD[h].name]), { refs: [] }, 'saveRefChanged', 'refIncomplete', 2, `AI-2d-empty ${h}`)
        })

        it(`AI-2e [${h}→${ref}] 新增停用項（不授權）不須宣告: refs:[] 亦成功  [A2]`, async function() {
            let rows = await rowsOf(h)
            let off = rows.map((r) => {
                if (r.name !== HOLD[h].holderName) {
                    return r
                }
                let kp = JSON5.parse(r[HOLD[h].field])
                kp[HOLD[h].name] = (h === 'pemis') ? 'n' : { mode: 'OR', isActive: 'n' } //停用項不授權
                return { ...r, [HOLD[h].field]: JSON.stringify(kp) }
            })
            let r = await write(h, off, { refs: [] })
            A.ok(r.ok, `新增停用項不須宣告, 應成功, 實得: ${JSON.stringify(r).slice(0, 300)}`)
        })
    }

    // ===== A3 相容 =====
    for (let h of H3) {
        for (let [tag, opt] of [['無第 3 參', undefined], ['subject:null＋refs:null', { subject: null, refs: null }]]) {
            it(`AI-3 [${h}→${HOLD[h].ref}] 相容（${tag}）: 被引用實體已被替換${h === 'pemis' ? '（標的已刪）' : '（刪後同名重建）'}, 不帶宣告 → 照舊成功寫入（外部應用相容, 名稱引用語意; 不擴權）  [A3]`, async function() {
                let rows = await rowsOf(h)
                if (h === 'pemis') {
                    await delEnt(h)
                }
                else {
                    await replaceEnt(h)
                }
                let r = await write(h, sendAdd(h, rows), opt)
                A.ok(r.ok, `不帶宣告應與修正前相同（成功）, 實得: ${JSON.stringify(r).slice(0, 300)}`)
                A.equal(r.output, OKS)
                A.ok(authKeys(h, await rowsOf(h)).includes(HOLD[h].name), '授權已依名稱寫入')
            })
        }
    }

    // ===== A4 格式不合 =====
    const BAD = {
        users: [['subject 缺欄', { subject: { id: 'a' } }], ['subject saved 非布林', { subject: { id: 'a', name: 'b', saved: 'yes' } }], ['subject false', { subject: false }], ['refs 非陣列', { refs: 'x' }], ['refs 項格式錯', { refs: [{ name: 1, ids: [] }] }]],
        grups: [['subject 缺欄', { subject: { id: 'a' } }], ['subject saved 非布林', { subject: { id: 'a', name: 'b', saved: 'yes' } }], ['subject false', { subject: false }], ['refs 非陣列', { refs: 'x' }], ['refs 名稱重複', { refs: [{ name: 'a', ids: [] }, { name: 'a', ids: [] }] }]],
        pemis: [['refs 非陣列', { refs: 'x' }], ['refs ids 含非字串', { refs: [{ name: 'a', ids: [1] }] }], ['refs 名稱重複', { refs: [{ name: 'a', ids: [] }, { name: 'a', ids: [] }] }]],
    }
    for (let h of H3) {
        BAD[h].forEach(([title, opt]) => {
            it(`AI-4 [${h}] 格式不合「${title}」→ saveIdentityFormat/format(n 0), 四表零變更  [A4]`, async function() {
                let rows = await rowsOf(h)
                await expectReject(h, sendAdd(h, rows), opt, 'saveIdentityFormat', 'format', 0, `AI-4 ${h} ${title}`)
            })
        })
    }
    it('AI-4 [targets] 無授權引用欄: 帶 refs（即使為空陣列）或 subject → saveIdentityFormat/format, 四表零變更  [A4]', async function() {
        let rows = (await rowsOf('targets')).map((r, k) => (k === 0 ? { ...r, description: 'idn-edited' } : r))
        await expectReject('targets', rows, { refs: [] }, 'saveIdentityFormat', 'format', 0, 'AI-4 targets refs')
        await expectReject('targets', rows, { subject: { id: 'a', name: 'b', saved: true } }, 'saveIdentityFormat', 'format', 0, 'AI-4 targets subject')
        checkLangKey('saveIdentityFormat')
        let ok = await write('targets', rows) //對照: 不帶宣告可存
        A.ok(ok.ok, `對照: targets 不帶宣告應成功, 實得: ${JSON.stringify(ok).slice(0, 300)}`)
    })

    // ===== A5 真後端並發 =====
    //一邊存檔 A（帶宣告）、一邊 B（刪除被引用實體並以同名重建; pemis 之 targets 為單純刪除）, 各 6 輪; 啟動次序與間隔: k 偶數 A 先、奇數 B 先; 間隔 [0,0,4,4,12,12] ms.
    const RACES = [
        { id: 'AI-5a', h: 'users', kind: 'subject', key: 'saveSubjectChanged', mode: 'replace' },
        { id: 'AI-5b', h: 'users', kind: 'refs', key: 'saveRefChanged', mode: 'replace' },
        { id: 'AI-5c', h: 'grups', kind: 'subject', key: 'saveSubjectChanged', mode: 'replace' },
        { id: 'AI-5d', h: 'grups', kind: 'refs', key: 'saveRefChanged', mode: 'replace' },
        { id: 'AI-5e', h: 'pemis', kind: 'refs', key: 'saveRefChanged', mode: 'delete' },
    ]
    for (let rc of RACES) {
        it(`${rc.id} [${rc.h} ${rc.kind}] 並發 6 輪: 存檔（帶 ${rc.kind}）∥ ${rc.mode === 'replace' ? '刪除被引用實體並以同名重建' : '刪除被引用標的'} → 每輪終態僅二種合法結果之一, 不得「存檔成功但授權指向替換後之新實體」  [A5]`, async function() {
            this.timeout(600000)
            let h = rc.h
            let ref = HOLD[h].ref
            let name = HOLD[h].name
            let nOk = 0
            let nRej = 0
            for (let k = 0; k < 6; k++) {
                if (k > 0) {
                    await restoreBase()
                    await setupFx()
                }
                let label = `${rc.id} 第 ${k + 1} 輪`
                let rowsH = await rowsOf(h)
                let rowsRef = await rowsOf(ref)
                let rowsA = sendAdd(h, rowsH)
                let optA = (rc.kind === 'subject') ? { subject: subjOf(h) } : { refs: declOf(h) }
                let rowsB = rowsRef.filter((r) => r.id !== HOLD[h].id)
                if (rc.mode === 'replace') {
                    rowsB.push(entRow(ref, `${HOLD[h].id}-NEW`, name))
                }
                let sH0 = await snapKt(h)
                let mark = await markSrLog()
                let gap = [0, 0, 4, 4, 12, 12][k]
                let aFirst = (k % 2 === 0)
                let pA = null
                let pB = null
                if (aFirst) {
                    pA = write(h, rowsA, optA)
                    pB = sleep(gap).then(() => write(ref, rowsB))
                }
                else {
                    pB = write(ref, rowsB)
                    pA = sleep(gap).then(() => write(h, rowsA, optA))
                }
                let [rA, rB] = await withTimeout(Promise.all([pA, pB]), 120000, label)
                A.ok(rB.ok, `${label}: B（不帶宣告, 最後寫入者勝）應恆成功, 實得: ${JSON.stringify(rB).slice(0, 300)}`)
                let refAfter = await rowsOf(ref)
                A.ok(!refAfter.some((r) => r.id === HOLD[h].id), `${label}: 前提: 原實體已不在`)
                if (rc.mode === 'replace') {
                    A.ok(refAfter.some((r) => r.id === `${HOLD[h].id}-NEW` && (r.name === name)), `${label}: 前提: 已有同名新實體`)
                }
                let hAfter = await rowsOf(h)
                let linked = authKeys(h, hAfter).includes(name)
                if (rA.ok) {
                    //①A 先持鎖: 存檔成功, 其後 B 才替換; B 之引用連帶清理已移除剛寫入之引用
                    nOk++
                    A.equal(rA.output, OKS)
                    A.equal(linked, false, `${label}: 存檔成功者之授權在其後之刪除連帶清理後不得仍指向「${name}」——若仍在, 即寫入指向了替換後之新實體（先檢查後寫入非同鎖／檢查用過期資料）`)
                }
                else {
                    //②B 先持鎖: 存檔被拒、零寫入
                    nRej++
                    A.equal(rA.msg, rc.key, `${label}: 落敗時須為 ${rc.key}, 實得: ${rA.msg}`)
                    A.equal(await snapKt(h), sH0, `${label}: 被拒者零寫入（引用端表逐位元不變）`)
                    A.equal(linked, false, `${label}: 被拒者之授權不得指向替換後之新實體`)
                    let lines = await waitLines(mark, (l) => l.event === EVT && l.keyTable === h, `${label} identity-error`)
                    checkNoSecrets(lines, label)
                }
            }
            console.log(`[api-identity ${rc.id}] 六輪中存檔先持鎖而成功 ${nOk} 輪, 被引用實體先被替換而存檔被拒 ${nRej} 輪`)
            A.equal(nOk + nRej, 6)
        })
    }

    // ===== 語系鍵 =====
    it('AI-6 語系鍵 saveSubjectChanged／saveRefChanged／saveIdentityFormat 有 eng 與 cht 固定訊息（後端回 key 供前端 $t 換算）', function() {
        for (let k of ['saveSubjectChanged', 'saveRefChanged', 'saveIdentityFormat']) {
            checkLangKey(k)
        }
    })

})
