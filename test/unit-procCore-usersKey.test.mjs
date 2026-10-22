//後台整表寫入 users 之 email／對應鍵檢查: 只擋「本次造成或觸及」者(R-PRINCIPLE-00 適用表 h; 規則帳本 R-MAPKEY-03; run05)
//
//述語(規格句, 源自使用者裁示「遭遇衝突就收嚴＋提示」與「歷史資料不得使所有存檔失敗」; 期望由規格推導, 不照實作現況):
//  P1 全表 email(任何 mappingBy, 含停用列): 「新增列」與「email 值異於庫內同 id 列」之列須為非空字串, 否則 saveRowFieldInvalid;
//     歷史既有之空／非字串 email 原樣送回不拒;
//  P2 全表 email 不得與他列重複(精確 ===): 本次造成或觸及者 → saveRowFieldDuplicate; 歷史既有重複原樣送回、重複中一列改成唯一值(修復)、
//     刪除或停用其一皆不拒; 新增第三個同值、他列改成該值、重複中一列改成第三者已用值皆拒;
//  P3 mappingBy='name': 另對 isActive==='y' 之列檢查 name: 非空字串(trim 後長度 > 0)且 active 列間唯一, 同樣只擋本次造成或觸及者;
//     inactive 列不參與(空／重複皆可); 一列由 inactive 改 active 而為空或撞名亦屬本次造成;
//  P4 mappingBy='email': active 列之 email 另須 trim 後非空(與外部同步 F-14 同口徑), 且「停用改啟用」之列視為本次觸及(歷史空值／重複之停用列被啟用時擋);
//  P5 mappingBy='id'(預設)或不合法值: 不檢查 name(users 允許 name 空／重複), 只有 P1／P2;
//  P6 pickKeysOnly(modeEditUsers='for:grups'): 歷史重複／空值的庫, 群組指派照常成功(檢查跑在「庫內列＋cgrups」合併後之列上, 無任何列被觸及),
//     且送入列的 email／name／isActive 變更不被採納;
//  P7 被拒 → 四張表零變更(逐位元比對、零寫入); 檢查位於 kmx(tabWriteKey('users')) 內、任何破壞性寫入之前;
//  P8 被拒時 srLog 記 event=updateTabItems-ckKey-error、msg(錯誤鍵)、key(欄位)、reason、row(列索引), 不記 email／name 之值(個資; 修正前重複時記 value).
//
//受測: server/procCore.mjs 之 updateUsers(kpFunExt 之實際入口, 內走 updateTabItems; 注入 mappingBy 同 WWebPerm 之 procCore(...) 呼叫)與 server/keyCheck.mjs 之 checkUsersWrite;
//替身: test/tools/unitOrm.mjs 之 mkTable(cnt 計 insert／save／del／delAll 次數, 供斷言「被拒時零寫入」), procOrm 為真(getMapOrm → getProc).
//輸入空間(報告用): mappingBy(id／email／name) × 情境(見 CASES, 共 N 格, 每格逐 mappingBy 列期望) ＋ checkUsersWrite 窮舉(見檔尾 describe).
//跑法: npx mocha test/unit-procCore-usersKey.test.mjs --reporter list --timeout 300000
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import cloneDeep from 'lodash-es/cloneDeep.js'
import pmKeyMutex from 'wsemi/src/pmKeyMutex.mjs'
import cacheSt from 'wsemi/src/cacheSt.mjs'
import ds from '../src/schema/index.mjs'
import proc from '../server/procCore.mjs'
import createLockSave from '../server/lockSave.mjs'
import { checkUsersWrite, tabWriteKey } from '../server/keyCheck.mjs'
import { mkTable, mkProcOrm, mkSrLog } from './tools/unitOrm.mjs'
import { stripLineComment } from './tools/srcScan.mjs'


const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const PH = '{新增}' //前端新列之稽核欄位佔位字
const T0 = '2026-01-01T00:00:00.000+08:00'
const AUDIT = { userId: 'id-seed', timeCreate: T0, userIdUpdate: 'id-seed', timeUpdate: T0 }
const OMIT = Symbol('omit') //createEnv 的 mappingBy 給此值 → 不傳 mappingBy 鍵(驗預設 'id')
const MODES = ['id', 'email', 'name']

//期望代碼: OK 可存; I saveRowFieldInvalid; D saveRowFieldDuplicate; N saveNewRowExists; '-' 該 mappingBy 刻意不測
const OK = 'ok'
const I = 'I'
const D = 'D'
const N = 'N'
const SKIP = '-'
const EXP = {
    [OK]: { ok: true, v: 'saveTabItemsSuccess' },
    [I]: { ok: false, v: 'saveRowFieldInvalid' },
    [D]: { ok: false, v: 'saveRowFieldDuplicate' },
    [N]: { ok: false, v: 'saveNewRowExists' },
}
const all = (x) => [x, x, x]


//mkUser: 庫內使用者(稽核欄位為真值)
let mkUser = (id, o = {}) => ({ ...ds.users.funNew(), ...AUDIT, id, name: id, email: `${id}@x.test`, cgrups: '{}', isAdmin: 'n', isActive: 'y', from: '', description: '', ...o })

//SEEDS: 各情境之 users 種子(其餘三表固定, 見 createEnv)
//  clean : 乾淨庫 —— u1 peter／peter@x.test(active)、u2 mary(active)、u3 john(inactive)
//  lde   : 歷史重複 email(僅外部同步可造成) —— u1、u2(from appX)同 email、皆 active; u3 唯一
//  ldei  : 歷史重複 email, 其一為停用 —— u1 active、u2 inactive 同 email
//  lee   : 歷史空 email —— u1(active)、u3(inactive)email 皆為空字串
//  nmi   : 歷史同名但其一為停用 —— u1 active／u3 inactive 同名 peter
//  ldn   : 歷史重複 name(皆 active) —— u1、u2(from appX)同名 same
//  len   : 歷史空 name —— u1(active)、u3(inactive)name 皆為空字串
//  ldeB／ldeiB／ldnB: 同 lde／ldei／ldn, 但歷史重複之 u2 亦為後台列(from ''; F-14 之前後台亦可能造成重複)
//run07 U1 修正(外部列保護 F-23 / R-EXT-OWN-01、過期快照 F-26 / R-BASELINE-01): u2(from appX)為外部列, 其身分／結構欄(name／email／description／isAdmin／isActive)後台不得改(saveExternalRowChanged),
//指派欄 cgrups 無載入基準不得改(saveBaselineRequired). UK-027／030／031／102／105 之述語(歷史重複 email／name 之修復、啟用、編修、群組指派不受歷史資料影響)與外部列無關,
//改用 B 版種子(u2 為後台列), 期望值與斷言不變; 外部列版本之拒收／基準放行見 unit-procCore-external. 其餘 lde／ldei／ldn 案例(只改 u1／u3、原樣送回 u2)維持外部列 u2.
const SEEDS = {
    clean: () => [
        mkUser('u1', { name: 'peter', email: 'peter@x.test' }),
        mkUser('u2', { name: 'mary', email: 'mary@x.test' }),
        mkUser('u3', { name: 'john', email: 'john@x.test', isActive: 'n' }),
    ],
    lde: () => [
        mkUser('u1', { name: 'peter', email: 'dup@x.test' }),
        mkUser('u2', { name: 'mary', email: 'dup@x.test', from: 'appX' }),
        mkUser('u3', { name: 'john', email: 'john@x.test' }),
    ],
    ldei: () => [
        mkUser('u1', { name: 'peter', email: 'dup@x.test' }),
        mkUser('u2', { name: 'mary', email: 'dup@x.test', from: 'appX', isActive: 'n' }),
        mkUser('u3', { name: 'john', email: 'john@x.test' }),
    ],
    lee: () => [
        mkUser('u1', { name: 'peter', email: '' }),
        mkUser('u2', { name: 'mary', email: 'mary@x.test' }),
        mkUser('u3', { name: 'john', email: '', isActive: 'n' }),
    ],
    nmi: () => [
        mkUser('u1', { name: 'peter', email: 'peter@x.test' }),
        mkUser('u2', { name: 'mary', email: 'mary@x.test' }),
        mkUser('u3', { name: 'peter', email: 'p3@x.test', isActive: 'n' }),
    ],
    ldn: () => [
        mkUser('u1', { name: 'same', email: 'peter@x.test' }),
        mkUser('u2', { name: 'same', email: 'mary@x.test', from: 'appX' }),
        mkUser('u3', { name: 'john', email: 'john@x.test' }),
    ],
    len: () => [
        mkUser('u1', { name: '', email: 'peter@x.test' }),
        mkUser('u2', { name: 'mary', email: 'mary@x.test' }),
        mkUser('u3', { name: '', email: 'john@x.test', isActive: 'n' }),
    ],
}
for (let [b, a] of [['ldeB', 'lde'], ['ldeiB', 'ldei'], ['ldnB', 'ldn']]) {
    SEEDS[b] = () => SEEDS[a]().map((r) => ({ ...r, from: '' }))
}

//nu: 模擬清單頁 addItem 之新列(前端 funNew 產 id、稽核欄位為佔位字、transient _isNew); 預設 name／email 逐列互異(同一批多個新列時不互相撞)
let seqNew = 0
let nu = (o = {}) => {
    let r = ds.users.funNew()
    seqNew++
    r.userId = PH
    r.timeCreate = PH
    r.userIdUpdate = PH
    r.timeUpdate = PH
    r.name = `newbie${seqNew}`
    r.email = `newbie${seqNew}@x.test`
    r.cgrups = '{}'
    r._isNew = true
    return { ...r, ...o }
}
let del = (r, ...keys) => {
    keys.forEach((k) => delete r[k])
    return r
}
let by = (rows, id) => rows.find((r) => r.id === id)
let CG = '{"G1":{"mode":"OR","isActive":"y"}}' //pickKeysOnly 案例用之群組指派


//CASES: 逐格列出「應擋／應過」(期望順序: [mappingBy=id, email, name]); mut(rows) 回送入之整表(rows 為庫內列依 order 之複本)
//opt: updateUsers 的第三參; verify(e, sent, mode): 通過後之附加斷言
const CASES = [

    // ===== 乾淨庫: 本次新增／改動造成的空值與重複 =====
    { id: 'UK-001', seed: 'clean', title: '新增列 email 與既有 active 列相同', mut: (rows) => [...rows, nu({ email: 'peter@x.test' })], want: all(D) },
    { id: 'UK-002', seed: 'clean', title: '既有列 email 改成他 active 列之值', mut: (rows) => { by(rows, 'u2').email = 'peter@x.test'; return rows }, want: all(D) },
    { id: 'UK-003', seed: 'clean', title: '既有列 email 改成停用列之值(email 唯一含停用列)', mut: (rows) => { by(rows, 'u2').email = 'john@x.test'; return rows }, want: all(D) },
    { id: 'UK-004', seed: 'clean', title: '新增 active 列 email 為空字串', mut: (rows) => [...rows, nu({ email: '' })], want: all(I) },
    { id: 'UK-005', seed: 'clean', title: '新增 inactive 列 email 為空字串(全表任何列)', mut: (rows) => [...rows, nu({ email: '', isActive: 'n' })], want: all(I) },
    { id: 'UK-006a', seed: 'clean', title: '新增列缺 email 欄位(視為空)', mut: (rows) => [...rows, del(nu(), 'email')], want: all(I) },
    { id: 'UK-006b', seed: 'clean', title: '新增列 email 為數字 5', mut: (rows) => [...rows, nu({ email: 5 })], want: all(I) },
    { id: 'UK-006c', seed: 'clean', title: '新增列 email 為 null', mut: (rows) => [...rows, nu({ email: null })], want: all(I) },
    { id: 'UK-007', seed: 'clean', title: '既有 active 列 email 改為空字串', mut: (rows) => { by(rows, 'u1').email = ''; return rows }, want: all(I) },
    { id: 'UK-008', seed: 'clean', title: '既有停用列 email 改為空字串(停用列亦檢查)', mut: (rows) => { by(rows, 'u3').email = ''; return rows }, want: all(I) },
    {
        id: 'UK-009', seed: 'clean', title: '精確 ===: 僅大小寫或前後空白不同之 email 視為不同 → 可存',
        mut: (rows) => [...rows, nu({ email: 'PETER@x.test' }), nu({ email: 'peter@x.test ' }), nu({ email: ' peter@x.test' })],
        want: all(OK), verify: async (e) => assert.strict.equal(e.woItems.users.size(), 6),
    },
    { id: 'UK-010a', seed: 'clean', title: '新增 active 列 email 為全空白(對應鍵 email 時依 F-14 以 trim 判空)', mut: (rows) => [...rows, nu({ email: '   ' })], want: [OK, I, OK] },
    { id: 'UK-010b', seed: 'clean', title: '新增 inactive 列 email 為全空白(inactive 不參與對應鍵檢查)', mut: (rows) => [...rows, nu({ email: '   ', isActive: 'n' })], want: all(OK) },
    {
        id: 'UK-011', seed: 'clean', title: '基準: 新增唯一列＋編修 u1 描述＋刪除 u2 → 可存, 庫內即送入',
        mut: (rows) => { by(rows, 'u1').description = 'edited'; return [...rows.filter((r) => r.id !== 'u2'), nu({ email: 'solo@x.test', name: 'solo' })] },
        want: all(OK),
        verify: async (e, sent) => {
            assert.strict.deepEqual((await e.woItems.users.select()).map((r) => r.id).sort(), sent.map((r) => r.id).sort())
            assert.strict.equal(e.woItems.users.get('u1').description, 'edited')
        },
    },
    { id: 'UK-012', seed: 'clean', title: '帶 _isNew 之既有 id 列同時改 email 為他列之值 → 重複先於 saveNewRowExists 被回報', mut: (rows) => { by(rows, 'u1')._isNew = true; by(rows, 'u1').email = 'mary@x.test'; return rows }, want: all(D) },
    { id: 'UK-013', seed: 'clean', title: '帶 _isNew 之既有 id 列 email 不變 → 本檢查不誤擋, 仍由 saveNewRowExists 拒', mut: (rows) => { by(rows, 'u1')._isNew = true; return rows }, want: all(N) },

    // ===== 歷史重複 email(lde): 原樣送回與修復可存, 造成或觸及者仍擋 =====
    {
        id: 'UK-020', seed: 'lde', title: '歷史重複 email 原樣送回並編修無關列 → 可存, 重複兩列皆仍在',
        mut: (rows) => { by(rows, 'u3').description = 'edited'; return rows }, want: all(OK),
        verify: async (e) => {
            assert.strict.equal(e.woItems.users.get('u1').email, 'dup@x.test')
            assert.strict.equal(e.woItems.users.get('u2').email, 'dup@x.test')
            assert.strict.equal(e.woItems.users.get('u2').from, 'appX')
            assert.strict.equal(e.woItems.users.get('u3').description, 'edited')
        },
    },
    {
        id: 'UK-021', seed: 'lde', title: '歷史重複中一列改名(email 不變) → 可存且改名落地, 兩列皆仍在',
        mut: (rows) => { by(rows, 'u1').name = 'peter2'; return rows }, want: all(OK),
        verify: async (e) => {
            assert.strict.equal(e.woItems.users.get('u1').name, 'peter2')
            assert.strict.equal(e.woItems.users.size(), 3)
        },
    },
    { id: 'UK-022', seed: 'lde', title: '歷史重複中一列 email 改成第三者已用之值', mut: (rows) => { by(rows, 'u1').email = 'john@x.test'; return rows }, want: all(D) },
    {
        id: 'UK-023', seed: 'lde', title: '歷史重複中一列 email 改成唯一新值(修復) → 可存',
        mut: (rows) => { by(rows, 'u1').email = 'fixed@x.test'; return rows }, want: all(OK),
        verify: async (e) => {
            assert.strict.equal(e.woItems.users.get('u1').email, 'fixed@x.test')
            assert.strict.equal(e.woItems.users.get('u2').email, 'dup@x.test')
        },
    },
    { id: 'UK-024', seed: 'lde', title: '歷史重複存在, 再新增第三列使用該值', mut: (rows) => [...rows, nu({ email: 'dup@x.test' })], want: all(D) },
    { id: 'UK-025', seed: 'lde', title: '歷史重複存在, 無關列改成該值(併入重複組)', mut: (rows) => { by(rows, 'u3').email = 'dup@x.test'; return rows }, want: all(D) },
    { id: 'UK-026', seed: 'lde', title: '刪除重複中之一列 → 可存', mut: (rows) => rows.filter((r) => r.id !== 'u1'), want: all(OK), verify: async (e) => assert.strict.equal(e.woItems.users.has('u1'), false) },
    {
        id: 'UK-027', seed: 'ldeB', title: '重複兩列皆改為互異之唯一值 → 可存',
        mut: (rows) => { by(rows, 'u1').email = 'a1@x.test'; by(rows, 'u2').email = 'a2@x.test'; return rows }, want: all(OK),
        verify: async (e) => assert.strict.deepEqual([e.woItems.users.get('u1').email, e.woItems.users.get('u2').email], ['a1@x.test', 'a2@x.test']),
    },
    { id: 'UK-028', seed: 'lde', title: '重複列反序送入(列序變更, 值不變) → 可存', mut: (rows) => rows.reverse(), want: all(OK) },
    { id: 'UK-029', seed: 'lde', title: '歷史重複中一列 email 改為空字串', mut: (rows) => { by(rows, 'u1').email = ''; return rows }, want: all(I) },

    // ===== 歷史重複 email, 其一為停用(ldei): 啟用造成 active 重複(對應鍵 email) =====
    { id: 'UK-030', seed: 'ldeiB', title: '啟用歷史重複中之停用列(email 不變)', mut: (rows) => { by(rows, 'u2').isActive = 'y'; return rows }, want: [OK, D, OK] },
    { id: 'UK-031', seed: 'ldeiB', title: '編修停用列描述(維持停用) → 可存', mut: (rows) => { by(rows, 'u2').description = 'edited'; return rows }, want: all(OK) },
    { id: 'UK-032', seed: 'ldei', title: '停用歷史重複中之 active 列 → 可存', mut: (rows) => { by(rows, 'u1').isActive = 'n'; return rows }, want: all(OK) },

    // ===== 歷史空 email(lee): 歷史容忍, 本次新增或改成空者擋 =====
    {
        id: 'UK-040', seed: 'lee', title: '歷史空 email 原樣送回並編修無關列 → 可存(含 mappingBy=email 之 active 空列: 歷史容忍)',
        mut: (rows) => { by(rows, 'u2').description = 'edited'; return rows }, want: all(OK),
        verify: async (e) => {
            assert.strict.equal(e.woItems.users.get('u1').email, '')
            assert.strict.equal(e.woItems.users.get('u3').email, '')
        },
    },
    { id: 'UK-041', seed: 'lee', title: '編修空 email 列之描述(email 仍為空) → 可存', mut: (rows) => { by(rows, 'u1').description = 'edited'; return rows }, want: all(OK) },
    { id: 'UK-042', seed: 'lee', title: '空 email 列自行改成有效 email(修復) → 可存', mut: (rows) => { by(rows, 'u1').email = 'ok@x.test'; return rows }, want: all(OK), verify: async (e) => assert.strict.equal(e.woItems.users.get('u1').email, 'ok@x.test') },
    { id: 'UK-043', seed: 'lee', title: '歷史空 email 存在, 再新增另一個空 email 列', mut: (rows) => [...rows, nu({ email: '' })], want: all(I) },
    { id: 'UK-044', seed: 'lee', title: '啟用歷史空 email 之停用列', mut: (rows) => { by(rows, 'u3').isActive = 'y'; return rows }, want: [OK, I, OK] },
    { id: 'UK-045', seed: 'lee', title: '空 email 列改成全空白(對應鍵 email 時依 F-14 以 trim 判空)', mut: (rows) => { by(rows, 'u1').email = '   '; return rows }, want: [OK, I, OK] },
    { id: 'UK-046', seed: 'lee', title: '另一有效列 email 改為空字串', mut: (rows) => { by(rows, 'u2').email = ''; return rows }, want: all(I) },

    // ===== name 作為對應鍵: 僅 active 列、本次造成或觸及 =====
    { id: 'UK-050', seed: 'nmi', title: '啟用與 active 列同名之停用列', mut: (rows) => { by(rows, 'u3').isActive = 'y'; return rows }, want: [OK, OK, D] },
    { id: 'UK-051', seed: 'nmi', title: '編修停用列描述(同名但 inactive 不參與) → 可存', mut: (rows) => { by(rows, 'u3').description = 'edited'; return rows }, want: all(OK) },
    { id: 'UK-052', seed: 'nmi', title: '新增 inactive 列, name 與 active 列相同 → 可存', mut: (rows) => [...rows, nu({ name: 'peter', isActive: 'n' })], want: all(OK) },
    { id: 'UK-053', seed: 'nmi', title: '停用列改名為 active 列之名(仍停用) → 可存', mut: (rows) => { by(rows, 'u3').name = 'mary'; return rows }, want: all(OK) },
    { id: 'UK-054', seed: 'nmi', title: 'active 列改名為他 active 列之名', mut: (rows) => { by(rows, 'u1').name = 'mary'; return rows }, want: [OK, OK, D] },
    { id: 'UK-056', seed: 'clean', title: '新增 active 列, name 與 active 列相同(users 於 mappingBy≠name 時允許同名)', mut: (rows) => [...rows, nu({ name: 'peter' })], want: [OK, OK, D] },
    { id: 'UK-057', seed: 'clean', title: 'active 列改名為他 active 列之名', mut: (rows) => { by(rows, 'u2').name = 'peter'; return rows }, want: [OK, OK, D] },
    { id: 'UK-058', seed: 'clean', title: 'active 列改名為停用列之名(停用列不參與) → 可存', mut: (rows) => { by(rows, 'u2').name = 'john'; return rows }, want: all(OK) },
    { id: 'UK-059', seed: 'clean', title: '新增 active 列 name 為空字串', mut: (rows) => [...rows, nu({ name: '' })], want: [OK, OK, I] },
    { id: 'UK-060', seed: 'clean', title: '新增 active 列 name 為全空白', mut: (rows) => [...rows, nu({ name: '   ' })], want: [OK, OK, I] },
    { id: 'UK-061', seed: 'clean', title: '新增 active 列缺 name 欄位(視為空)', mut: (rows) => [...rows, del(nu(), 'name')], want: [OK, OK, I] },
    { id: 'UK-062a', seed: 'clean', title: '新增 active 列 name 為數字 7(僅對應鍵為 name 時測: 其他 mappingBy 刻意不測以免把數字寫進 STRING 欄)', mut: (rows) => [...rows, nu({ name: 7 })], want: [SKIP, SKIP, I] },
    { id: 'UK-062b', seed: 'clean', title: '新增 active 列 name 為 null(同上)', mut: (rows) => [...rows, nu({ name: null })], want: [SKIP, SKIP, I] },
    { id: 'UK-063', seed: 'clean', title: '新增 inactive 列 name 為空字串(inactive 不參與) → 可存', mut: (rows) => [...rows, nu({ name: '', isActive: 'n' })], want: all(OK) },
    { id: 'UK-064', seed: 'clean', title: '既有 active 列 name 改為空字串', mut: (rows) => { by(rows, 'u1').name = ''; return rows }, want: [OK, OK, I] },
    { id: 'UK-065', seed: 'clean', title: '精確 ===: 僅大小寫或前後空白不同之 name 視為不同 → 可存', mut: (rows) => [...rows, nu({ name: 'PETER' }), nu({ name: 'peter ' })], want: all(OK) },
    { id: 'UK-066', seed: 'clean', title: 'active 列停用後同名不再參與: 停用 u1 並新增同名 active 列 → 可存', mut: (rows) => { by(rows, 'u1').isActive = 'n'; return [...rows, nu({ name: 'peter' })] }, want: all(OK) },

    // ===== 歷史空 name(len) =====
    { id: 'UK-070', seed: 'len', title: '歷史空 name 原樣送回並編修無關列 → 可存', mut: (rows) => { by(rows, 'u2').description = 'edited'; return rows }, want: all(OK) },
    { id: 'UK-071', seed: 'len', title: '編修空 name 列之描述(name 仍空) → 可存', mut: (rows) => { by(rows, 'u1').description = 'edited'; return rows }, want: all(OK) },
    { id: 'UK-072', seed: 'len', title: '空 name 列自行改成有效 name(修復) → 可存', mut: (rows) => { by(rows, 'u1').name = 'fixed'; return rows }, want: all(OK) },
    { id: 'UK-073', seed: 'len', title: '啟用歷史空 name 之停用列', mut: (rows) => { by(rows, 'u3').isActive = 'y'; return rows }, want: [OK, OK, I] },
    { id: 'UK-074', seed: 'len', title: '歷史空 name 存在, 再新增另一個 active 空 name 列', mut: (rows) => [...rows, nu({ name: '' })], want: [OK, OK, I] },
    { id: 'UK-075', seed: 'len', title: '另一有效列 name 改為空字串', mut: (rows) => { by(rows, 'u2').name = ''; return rows }, want: [OK, OK, I] },

    // ===== 歷史重複 name(ldn) =====
    { id: 'UK-080', seed: 'ldn', title: '歷史重複 name 原樣送回並編修無關列 → 可存', mut: (rows) => { by(rows, 'u3').description = 'edited'; return rows }, want: all(OK) },
    { id: 'UK-081', seed: 'ldn', title: '歷史重複 name 存在, 再新增第三個 active 同名列', mut: (rows) => [...rows, nu({ name: 'same' })], want: [OK, OK, D] },
    { id: 'UK-082', seed: 'ldn', title: '歷史重複 name 存在, 無關列改成該名', mut: (rows) => { by(rows, 'u3').name = 'same'; return rows }, want: [OK, OK, D] },
    { id: 'UK-083', seed: 'ldn', title: '歷史重複中一列改成唯一名稱(修復) → 可存', mut: (rows) => { by(rows, 'u1').name = 'single'; return rows }, want: all(OK) },
    { id: 'UK-084', seed: 'ldn', title: '歷史重複中一列改成已被第三者使用之名稱', mut: (rows) => { by(rows, 'u1').name = 'john'; return rows }, want: [OK, OK, D] },
    { id: 'UK-085', seed: 'ldn', title: '刪除重複中之一列 → 可存', mut: (rows) => rows.filter((r) => r.id !== 'u1'), want: all(OK) },
    { id: 'UK-086', seed: 'ldn', title: '停用重複中之一列 → 可存', mut: (rows) => { by(rows, 'u1').isActive = 'n'; return rows }, want: all(OK) },
    { id: 'UK-087', seed: 'ldn', title: '新增 inactive 同名列(inactive 不參與) → 可存', mut: (rows) => [...rows, nu({ name: 'same', isActive: 'n' })], want: all(OK) },

    // ===== 次序 =====
    { id: 'UK-090', seed: 'clean', title: '重複(第 4 列)先於空值(第 5 列)被掃到 → 回重複(與修正前 ckKey 逐列掃描同序)', mut: (rows) => [...rows, nu({ email: 'peter@x.test' }), nu({ email: '' })], want: all(D) },
    { id: 'UK-091', seed: 'clean', title: '空值(第 4 列)先於重複(第 5 列)被掃到 → 回空值', mut: (rows) => [...rows, nu({ email: '' }), nu({ email: 'peter@x.test' })], want: all(I) },
    { id: 'UK-092', seed: 'clean', title: '同一新列 email 重複且 name 為空 → 一般 email 檢查先於對應鍵檢查, 回重複', mut: (rows) => [...rows, nu({ email: 'peter@x.test', name: '' })], want: all(D) },

    // ===== pickKeysOnly(modeEditUsers='for:grups'): 歷史資料不使群組指派失敗, 且只採納 cgrups =====
    {
        id: 'UK-100', seed: 'lde', title: 'pickKeysOnly: 歷史重複 email 的庫, 群組指派成功, email 不變',
        mut: (rows) => { by(rows, 'u1').cgrups = CG; return rows }, opt: { pickKeysOnly: ['cgrups'] }, want: all(OK),
        verify: async (e) => {
            assert.strict.equal(e.woItems.users.get('u1').cgrups, CG)
            assert.strict.deepEqual([e.woItems.users.get('u1').email, e.woItems.users.get('u2').email], ['dup@x.test', 'dup@x.test'])
        },
    },
    {
        id: 'UK-101', seed: 'lee', title: 'pickKeysOnly: 歷史空 email 的庫(含 mappingBy=email 之 active 空列), 群組指派成功',
        mut: (rows) => { by(rows, 'u1').cgrups = CG; return rows }, opt: { pickKeysOnly: ['cgrups'] }, want: all(OK),
        verify: async (e) => assert.strict.equal(e.woItems.users.get('u1').cgrups, CG),
    },
    {
        id: 'UK-102', seed: 'ldnB', title: 'pickKeysOnly: 歷史重複 name 的庫(mappingBy=name), 群組指派成功',
        mut: (rows) => { by(rows, 'u2').cgrups = CG; return rows }, opt: { pickKeysOnly: ['cgrups'] }, want: all(OK),
        verify: async (e) => assert.strict.equal(e.woItems.users.get('u2').cgrups, CG),
    },
    {
        id: 'UK-103', seed: 'len', title: 'pickKeysOnly: 歷史空 name 的庫(mappingBy=name), 群組指派成功',
        mut: (rows) => { by(rows, 'u1').cgrups = CG; return rows }, opt: { pickKeysOnly: ['cgrups'] }, want: all(OK),
        verify: async (e) => assert.strict.equal(e.woItems.users.get('u1').cgrups, CG),
    },
    {
        id: 'UK-104', seed: 'clean', title: 'pickKeysOnly: 送入列把 email 改成他列之值、name 改空、停用改啟用並新增重複列 → 皆不採納, 成功, 庫內不變',
        mut: (rows) => {
            by(rows, 'u1').email = 'mary@x.test'
            by(rows, 'u2').name = ''
            by(rows, 'u3').isActive = 'y'
            by(rows, 'u1').cgrups = CG
            return [...rows, nu({ email: 'mary@x.test', name: '' })]
        },
        opt: { pickKeysOnly: ['cgrups'] }, want: all(OK),
        verify: async (e) => {
            assert.strict.equal(e.woItems.users.size(), 3, '新增列不採納')
            assert.strict.equal(e.woItems.users.get('u1').email, 'peter@x.test')
            assert.strict.equal(e.woItems.users.get('u2').name, 'mary')
            assert.strict.equal(e.woItems.users.get('u3').isActive, 'n')
            assert.strict.equal(e.woItems.users.get('u1').cgrups, CG)
        },
    },
    {
        id: 'UK-105', seed: 'ldeiB', title: 'pickKeysOnly: 歷史重複(其一停用)送入啟用 → 不採納(只採 cgrups), 成功, 仍為停用',
        mut: (rows) => { by(rows, 'u2').isActive = 'y'; by(rows, 'u2').cgrups = CG; return rows }, opt: { pickKeysOnly: ['cgrups'] }, want: all(OK),
        verify: async (e) => {
            assert.strict.equal(e.woItems.users.get('u2').isActive, 'n')
            assert.strict.equal(e.woItems.users.get('u2').cgrups, CG)
        },
    },
]


describe('unit-procCore-usersKey (後台整表寫入 users 之 email／對應鍵檢查, 只擋本次造成或觸及者, R-PRINCIPLE-00 適用表 h)', function() {

    let envs = []

    //createEnv: 四表替身(users 為受測種子, 其餘三表各一列供零寫入比對)＋真 procOrm＋真 kmx／lockSave; mappingBy 同 WWebPerm 之 procCore(...) 注入
    function createEnv(seedName, mappingBy) {
        let seed = SEEDS[seedName]().map((r, k) => ({ ...r, order: k + 1 }))
        let mk = (table, o) => ({ ...ds[table].funNew(), ...AUDIT, ...o })
        let woItems = {
            users: mkTable(seed),
            grups: mkTable([mk('grups', { id: 'id-g1', order: 1, name: 'G1', cpemis: '{}', from: '' })]),
            pemis: mkTable([mk('pemis', { id: 'id-p1', order: 1, name: 'P1', crules: '{}', from: '' })]),
            targets: mkTable([mk('targets', { id: 'T1', order: 1, description: 'd1' })]),
        }
        let { srLog, logs } = mkSrLog()
        let cst = cacheSt()
        let kmx = pmKeyMutex()
        let opt = { srLog, kmx, lockSave: createLockSave(cst) }
        if (mappingBy !== OMIT) {
            opt.mappingBy = mappingBy
        }
        let pc = proc(woItems, mkProcOrm(ds, woItems), opt)
        let env = { seed, woItems, logs, cst, kmx, pc }
        envs.push(env)
        return env
    }

    afterEach(function() {
        envs.forEach((e) => e.cst.clear()) //停止 cacheSt 之 TTL 偵測 timer, 避免 mocha 不結束
        envs = []
    })

    let run = async (pc, rows, opt) => {
        try {
            return { ok: true, v: await pc.updateUsers('id-admin', rows, opt) }
        }
        catch (err) {
            return { ok: false, v: err }
        }
    }
    let rowsOf = async (woItems) => (await woItems.users.select()).sort((a, b) => a.order - b.order).map((v) => cloneDeep(v))
    let snapAll = (woItems) => Object.fromEntries(['users', 'grups', 'pemis', 'targets'].map((t) => [t, woItems[t].snapshot()]))
    let writes = (woItems) => ['users', 'grups', 'pemis', 'targets'].reduce((a, t) => a + woItems[t].cnt.insert + woItems[t].cnt.save + woItems[t].cnt.del + woItems[t].cnt.delAll, 0)


    // ===== 逐格: mappingBy × 情境 =====

    describe('情境 × mappingBy', function() {
        for (let c of CASES) {
            MODES.forEach((mode, iMode) => {
                let want = c.want[iMode]
                if (want === SKIP) {
                    return
                }
                it(`${c.id} [mappingBy=${mode}] ${c.title} → ${want === OK ? '可存' : EXP[want].v}`, async function() {
                    let e = createEnv(c.seed, mode)
                    let sent = c.mut(await rowsOf(e.woItems))
                    let before = snapAll(e.woItems)
                    let r = await run(e.pc, cloneDeep(sent), c.opt)
                    assert.strict.deepEqual(r, EXP[want])
                    if (want === OK) {
                        if (c.opt === undefined) {
                            assert.strict.deepEqual((await e.woItems.users.select()).map((v) => v.id).sort(), sent.map((v) => v.id).sort(), '整表語意: 庫內即送入')
                        }
                        if (c.verify) {
                            await c.verify(e, sent, mode)
                        }
                    }
                    else {
                        assert.strict.deepEqual(snapAll(e.woItems), before, '被拒須四表零變更') //P7
                        assert.strict.equal(writes(e.woItems), 0, '被拒時不得有任何 insert／save／del／delAll') //P7
                    }
                })
            })
        }

        it('UK-110 mappingBy 不合法值(空字串、大小寫不符、null、數字、省略)視同 id: 不檢查 name、不以 trim 判 email; 重複 email 仍擋', async function() {
            for (let bad of ['', 'ID', 'EMAIL', 'Name', null, 5, undefined, OMIT]) {
                let e1 = createEnv('clean', bad)
                let rows1 = [...(await rowsOf(e1.woItems)), nu({ name: '', email: '   ' })]
                assert.strict.deepEqual(await run(e1.pc, rows1), EXP[OK], `mappingBy=${String(bad)}`)
                let e2 = createEnv('clean', bad)
                let rows2 = [...(await rowsOf(e2.woItems)), nu({ email: 'peter@x.test' })]
                assert.strict.deepEqual(await run(e2.pc, rows2), EXP[D], `mappingBy=${String(bad)}`)
            }
        })
    })


    // ===== P8: srLog 記錯誤鍵與位置, 不記 email／name 之值 =====

    describe('srLog(P8)', function() {
        //[seed, mappingBy, mut, 預期 log 欄位]
        let LOGS = [
            ['UK-120a 重複 email', 'clean', 'id', (rows) => [...rows, nu({ email: 'peter@x.test' })], { key: 'email', msg: 'saveRowFieldDuplicate', reason: 'emailDuplicate', row: 3 }],
            ['UK-120b 空 email', 'clean', 'id', (rows) => [...rows, nu({ email: '' })], { key: 'email', msg: 'saveRowFieldInvalid', reason: 'emailInvalid', row: 3 }],
            ['UK-120c 對應鍵 name 重複', 'clean', 'name', (rows) => [...rows, nu({ name: 'peter' })], { key: 'name', msg: 'saveRowFieldDuplicate', reason: 'mapKeyDuplicate', row: 3 }],
            ['UK-120d 對應鍵 name 為空', 'clean', 'name', (rows) => [...rows, nu({ name: '' })], { key: 'name', msg: 'saveRowFieldInvalid', reason: 'mapKeyInvalid', row: 3 }],
            ['UK-120e 對應鍵 email 全空白', 'clean', 'email', (rows) => [...rows, nu({ email: '   ' })], { key: 'email', msg: 'saveRowFieldInvalid', reason: 'mapKeyInvalid', row: 3 }],
            ['UK-120f 對應鍵 name 啟用造成重複(列索引為被啟用之列)', 'nmi', 'name', (rows) => { by(rows, 'u3').isActive = 'y'; return rows }, { key: 'name', msg: 'saveRowFieldDuplicate', reason: 'mapKeyDuplicate', row: 2 }],
        ]
        for (let [title, seed, mode, mut, want] of LOGS) {
            it(`${title}: event=updateTabItems-ckKey-error 帶 keyTable／key／msg／reason／row, 不含 email／name 之值(個資); 另有 updateUsers-error 記錯誤鍵`, async function() {
                let e = createEnv(seed, mode)
                let r = await run(e.pc, mut(await rowsOf(e.woItems)))
                assert.strict.equal(r.ok, false)
                let lg = e.logs.find((l) => l.event === 'updateTabItems-ckKey-error')
                assert.strict.ok(lg, `應有 updateTabItems-ckKey-error, 實得 ${JSON.stringify(e.logs)}`)
                assert.strict.equal(lg.level, 'error')
                assert.strict.equal(lg.keyTable, 'users')
                for (let [k, v] of Object.entries(want)) {
                    assert.strict.equal(lg[k], v, `log.${k}`)
                }
                assert.strict.equal('value' in lg, false, 'log 不得帶 value 欄位')
                let txt = JSON.stringify(e.logs)
                for (let pii of ['peter', 'mary', 'john', 'newbie', 'x.test']) {
                    assert.strict.equal(txt.includes(pii), false, `srLog 不得出現使用者之 email／name 值(${pii}): ${txt}`)
                }
                assert.strict.ok(e.logs.some((l) => l.level === 'error' && l.event === 'updateUsers-error' && l.msg === want.msg && l.userId === 'id-admin'), 'errLog 應記錯誤鍵')
            })
        }
    })


    // ===== P7: 檢查在 kmx(tabWriteKey('users')) 內 =====

    describe('鎖(P7)', function() {
        it('UK-130 他方持有 tabWriteKey("users") 期間, 會被拒之更新既不回應也不記 log; 釋放後才以 saveRowFieldDuplicate 拒絕且零寫入(檢查與寫入在同一把鎖內, R-WRITE-LOCK-01)', async function() {
            let e = createEnv('clean', 'id')
            let before = snapAll(e.woItems)
            let release = null
            let gate = new Promise((resolve) => {
                release = resolve
            })
            let held = e.kmx(tabWriteKey('users'), async () => {
                await gate
            })
            let settled = null
            let p = run(e.pc, [...(await rowsOf(e.woItems)), nu({ email: 'peter@x.test' })]).then((v) => {
                settled = v
                return v
            })
            for (let i = 0; i < 20; i++) {
                await new Promise((resolve) => setImmediate(resolve))
            }
            assert.strict.equal(settled, null, '持鎖期間不得完成(檢查不在鎖外)')
            assert.strict.equal(e.logs.filter((l) => l.event === 'updateTabItems-ckKey-error').length, 0, '持鎖期間不得已判定')
            assert.strict.equal(writes(e.woItems), 0)
            release()
            await held
            assert.strict.deepEqual(await p, EXP[D])
            assert.strict.deepEqual(snapAll(e.woItems), before)
            assert.strict.equal(writes(e.woItems), 0)
        })
    })


    // ===== checkUsersWrite 純函數: 形狀與索引對應 =====

    describe('checkUsersWrite(形狀)', function() {
        let row = (id, o = {}) => ({ id, name: `n-${id}`, email: `${id}@x.test`, isActive: 'y', ...o })

        it('UK-140 非陣列 rowsNew → null; rowsOld 非陣列視為庫內無列(全部為新增列)', function() {
            for (let bad of [null, undefined, {}, 'abc', 5]) {
                assert.strict.equal(checkUsersWrite(bad, [], 'name'), null)
            }
            assert.strict.equal(checkUsersWrite([row('a')], null, 'email'), null)
            assert.strict.deepEqual(checkUsersWrite([row('a', { email: '' })], undefined, 'id'), { key: 'saveRowFieldInvalid', reason: 'emailInvalid', field: 'email', k: 0 })
        })

        it('UK-141 回傳形狀 { key, reason, field, k }: 一般 email 與對應鍵之 reason／field', function() {
            assert.strict.deepEqual(checkUsersWrite([row('a'), row('b', { email: 'a@x.test' })], [], 'id'), { key: 'saveRowFieldDuplicate', reason: 'emailDuplicate', field: 'email', k: 0 }, '兩列皆新增: 回「第一個造成者」')
            assert.strict.deepEqual(checkUsersWrite([row('a', { email: 5 })], [], 'id'), { key: 'saveRowFieldInvalid', reason: 'emailInvalid', field: 'email', k: 0 })
            assert.strict.deepEqual(checkUsersWrite([row('a', { name: '' })], [], 'name'), { key: 'saveRowFieldInvalid', reason: 'mapKeyInvalid', field: 'name', k: 0 })
            assert.strict.deepEqual(checkUsersWrite([row('a', { email: ' ' })], [], 'email'), { key: 'saveRowFieldInvalid', reason: 'mapKeyInvalid', field: 'email', k: 0 })
        })

        it('UK-142 對應鍵檢查之索引對回送入整表(過濾掉 inactive 後的索引不外露)', function() {
            let rowsNew = [row('a', { isActive: 'n', name: 'x' }), row('b', { isActive: 'n', name: 'x' }), row('c', { name: 'dup' }), row('d', { name: 'dup' })]
            assert.strict.deepEqual(checkUsersWrite(rowsNew, [], 'name'), { key: 'saveRowFieldDuplicate', reason: 'mapKeyDuplicate', field: 'name', k: 2 })
            let rowsNew2 = [row('a', { isActive: 'n', name: '' }), row('b', { isActive: 'n', name: '' }), row('c', { name: ' ' })]
            assert.strict.deepEqual(checkUsersWrite(rowsNew2, [], 'name'), { key: 'saveRowFieldInvalid', reason: 'mapKeyInvalid', field: 'name', k: 2 })
            assert.strict.equal(checkUsersWrite(rowsNew, [], 'id'), null, 'mappingBy=id 不檢查 name')
        })

        it('UK-143 同一列既空又被當重複(新增第二個空字串 email)→ 以空值為主(Invalid), 與修正前 ckKey 先判空一致', function() {
            let old = [row('a', { email: '' })]
            assert.strict.deepEqual(checkUsersWrite([row('a', { email: '' }), row('b', { email: '' })], old, 'id'), { key: 'saveRowFieldInvalid', reason: 'emailInvalid', field: 'email', k: 1 })
        })

        it('UK-144 異形輸入不拋錯: 列為 null／數字／字串／空物件、庫內列含 null', function() {
            let r = checkUsersWrite([null, 5, 'x', {}], [null, {}, { id: 'z', email: 'z@x.test' }], 'email')
            assert.strict.equal(r.key, 'saveRowFieldInvalid')
            assert.strict.equal(r.k, 0)
        })
    })


    // ===== 站點不變式 =====

    describe('站點不變式', function() {
        let readCode = (rel) => fs.readFileSync(path.join(projRoot, rel), 'utf8').split(/\r?\n/).map((ln) => stripLineComment(ln)).join('\n')

        it('SITE-UK-001 procCore.updateTabItems: users 之檢查只經 keyCheck.checkUsersWrite, 位於 kmx(tabWriteKey) 內、ltdtOld 之 select 之後、第一個 procOrm 破壞步驟之前, 帶 mappingBy; 不得復活全表 ckKey(rows, \'email\')', function() {
            let code = readCode('server/procCore.mjs')
            assert.strict.ok(!/ckKey\(rows,\s*'email'/.test(code), '全表 email 檢查不得復活(歷史空值／重複會使所有存檔失敗)')
            assert.strict.equal((code.match(/checkUsersWrite\(/g) || []).length, 1, 'checkUsersWrite 呼叫點恰一處')
            let iLock = code.indexOf('withTabLocks(kmx, [keyTable]')
            let iOld = code.indexOf('let ltdtOld = await woItems[keyTable].select()')
            let iCk = code.indexOf('checkUsersWrite(rows, ltdtOld, mappingBy)')
            let iOrm = code.indexOf('procOrm(userId, keyTable')
            assert.strict.ok(iLock > 0 && iOld > iLock && iCk > iOld && iOrm > iCk, `次序須為 kmx 鎖 < select ltdtOld < checkUsersWrite < procOrm, 實得 ${[iLock, iOld, iCk, iOrm]}`)
            assert.strict.ok(/function proc\(woItems, procOrm, \{[^}]*\bmappingBy\b[^}]*\}\)/.test(code), 'proc 須收 mappingBy 注入')
        })

        it('SITE-UK-002 procCore 對 users 檢查失敗之 srLog 不帶 value(email／name 為個資)', function() {
            let code = readCode('server/procCore.mjs')
            let m = /srLog\.error\(\{[^}]*key: ck\.field[^}]*\}\)/.exec(code)
            assert.strict.ok(m, '應有 users 檢查失敗之 srLog.error')
            assert.strict.ok(!/\bvalue\b/.test(m[0]), `不得記值: ${m[0]}`)
            assert.strict.ok(/msg: ck\.key/.test(m[0]) && /row: ck\.k/.test(m[0]), '應記錯誤鍵與列索引')
        })

        it('SITE-UK-003 WWebPerm 建構 procCore 時傳入已正規化之 mappingBy', function() {
            let code = readCode('server/WWebPerm.mjs')
            assert.strict.ok(/procCore\(woItems,\s*procOrm,\s*\{[^}]*\bmappingBy\b[^}]*\}\)/.test(code), 'procCore 之選項須含 mappingBy')
            assert.strict.equal((code.match(/procCore\(woItems/g) || []).length, 1, 'procCore 建構點恰一處')
        })

        it('SITE-UK-004 checkUsersWrite 的重複判準只經 findTouchedDup(單一擁有者, 兩階段各一次), 不另寫重複掃描', function() {
            let code = readCode('server/keyCheck.mjs')
            let i0 = code.indexOf('function checkUsersWrite(')
            let i1 = code.indexOf('function pickUniqueUser(')
            assert.strict.ok(i0 > 0 && i1 > i0)
            let body = code.slice(i0, i1)
            assert.strict.equal((body.match(/findTouchedDup\(/g) || []).length, 1, 'judge 內呼叫 findTouchedDup 一處(兩階段共用)')
            assert.strict.ok(!/findDupIndex\(|hasDupKey\(/.test(body), '不得改用「全表重複」判準')
        })
    })

})


// ===== checkUsersWrite 窮舉: 對照獨立撰寫之規格參考實作 =====
//輸入空間(每個 mappingBy): 庫內表(ids a,b,c; 每個 id 為「無此列」或〔值 ∈ {p,q,空字串} × isActive ∈ {y,n}〕共 7 態 → 343 種) ×
//送入表(ids a,b,c,d; 同 7 態 → 2401 種) = 823,543 格; 三種 mappingBy 共 2,470,629 格. 每格比對: 通過／拒絕與拒絕種類(空值 I／重複 D)、被指列索引是否確為造成者.
//參考實作 oracle 以集合語意直述規格(不借用 findTouchedDup 之掃描寫法): 「造成或觸及」＝新增列、或該欄位值異於庫內同 id 列; 「歷史既有重複」＝庫內同值 ≥2 列、
//送入同值之每一列皆為庫內同 id 同值列、互異 id、筆數不多於庫內.
describe('unit-procCore-usersKey: checkUsersWrite 窮舉對照規格參考實作', function() {
    this.timeout(600000)

    const VALS = ['p', 'q', '']
    const ACTS = ['y', 'n']
    let tables = (ids) => {
        let opts = [null]
        for (let v of VALS) {
            for (let a of ACTS) {
                opts.push({ v, a })
            }
        }
        let out = [[]]
        for (let id of ids) {
            let next = []
            for (let t of out) {
                for (let o of opts) {
                    next.push(o === null ? t : [...t, { id, v: o.v, a: o.a }])
                }
            }
            out = next
        }
        return out
    }

    //mk: 狀態 → users 列; mode='name' 時變動欄位為 name(email 恆為互異非空), 其餘 mode 變動欄位為 email(name 恆為互異非空)
    let mk = (s, mode) => ({ id: s.id, isActive: s.a, email: mode === 'name' ? `${s.id}@x.test` : s.v, name: mode === 'name' ? s.v : `n-${s.id}` })

    //oracle: 規格參考實作. 回 { want: 'ok'|'I'|'D'|'ID', bad: Set(索引, 空值造成者), dupVals: Set(值) , field }
    let oracle = (oldRows, newRows, mode) => {
        let phase = (key, part, isOk) => {
            let o = oldRows.filter(part)
            let nIdx = newRows.map((r, k) => k).filter((k) => part(newRows[k]))
            let oldVal = new Map(o.map((r) => [r.id, r[key]]))
            let bad = new Set(nIdx.filter((k) => {
                let r = newRows[k]
                let untouched = oldVal.has(r.id) && oldVal.get(r.id) === r[key]
                return !untouched && !isOk(r[key])
            }))
            let dupVals = new Set()
            for (let v of new Set(nIdx.map((k) => newRows[k][key]))) {
                let g = nIdx.filter((k) => newRows[k][key] === v).map((k) => newRows[k])
                if (g.length < 2) {
                    continue
                }
                let nOld = o.filter((r) => r[key] === v).length
                let historical = nOld >= 2 && g.length <= nOld && g.every((r) => oldVal.get(r.id) === v) && new Set(g.map((r) => r.id)).size === g.length
                if (!historical) {
                    dupVals.add(v)
                }
            }
            return { bad, dupVals, field: key }
        }
        let classify = (p) => (p.bad.size > 0 && p.dupVals.size > 0 ? 'ID' : (p.bad.size > 0 ? 'I' : (p.dupVals.size > 0 ? 'D' : 'ok')))
        let p1 = phase('email', () => true, (v) => typeof v === 'string' && v.length > 0)
        if (classify(p1) !== 'ok') {
            return { want: classify(p1), ...p1, phase: 1 }
        }
        if (mode === 'id') {
            return { want: 'ok', phase: 0 }
        }
        let p2 = phase(mode, (r) => r.isActive === 'y', (v) => typeof v === 'string' && v.trim().length > 0)
        return { want: classify(p2), ...p2, phase: 2 }
    }

    for (let mode of MODES) {
        it(`UK-150 [mappingBy=${mode}] 窮舉 823,543 格: checkUsersWrite 與規格參考實作逐格一致(通過／拒絕種類／指列), 通過與否與送入列序無關(抽樣)`, function() {
            let olds = tables(['a', 'b', 'c']).map((t) => t.map((s) => mk(s, mode)))
            let news = tables(['a', 'b', 'c', 'd']).map((t) => t.map((s) => mk(s, mode)))
            let tally = { ok: 0, I: 0, D: 0, ID: 0 }
            let n = 0
            for (let o of olds) {
                for (let j = 0; j < news.length; j++) {
                    let nw = news[j]
                    let exp = oracle(o, nw, mode)
                    let act = checkUsersWrite(nw, o, mode)
                    n++
                    tally[exp.want]++
                    let desc = () => `old=${JSON.stringify(o)} new=${JSON.stringify(nw)} exp=${exp.want} act=${JSON.stringify(act)}`
                    if (exp.want === 'ok') {
                        assert.strict.equal(act, null, desc())
                    }
                    else {
                        assert.strict.ok(act !== null, desc())
                        let kind = act.key === 'saveRowFieldInvalid' ? 'I' : 'D'
                        assert.strict.ok(exp.want === 'ID' || exp.want === kind, desc())
                        assert.strict.ok(Number.isInteger(act.k) && act.k >= 0 && act.k < nw.length, desc())
                        assert.strict.equal(act.field, exp.field, desc())
                        assert.strict.equal(act.reason, `${exp.phase === 1 ? 'email' : 'mapKey'}${kind === 'I' ? 'Invalid' : 'Duplicate'}`, desc())
                        if (exp.phase === 2) {
                            assert.strict.equal(nw[act.k].isActive, 'y', '對應鍵階段指到之列須為 active: ' + desc())
                        }
                        if (kind === 'I') {
                            assert.strict.ok(exp.bad.has(act.k), '指到之空值列須為造成者: ' + desc())
                        }
                        else {
                            assert.strict.ok(exp.dupVals.has(nw[act.k][exp.field]), '指到之重複列其值須為被判重複之值: ' + desc())
                        }
                    }
                    if (j % 97 === 0) { //抽樣: 反序送入, 通過與否不變
                        let rev = checkUsersWrite([...nw].reverse(), o, mode)
                        assert.strict.equal(rev === null, act === null, '列序不影響通過與否: ' + desc())
                    }
                }
            }
            assert.strict.equal(n, 343 * 2401)
            assert.strict.ok(tally.ok > 0 && tally.I > 0 && tally.D > 0 && tally.ID > 0, `各類皆須出現(參考實作非空洞): ${JSON.stringify(tally)}`)
            console.log(`        [mappingBy=${mode}] 格數 ${n}: ${JSON.stringify(tally)}`)
        })
    }
})
