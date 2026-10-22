//引用連帶(改名級聯＋刪除連帶清理)之真後端 API 測試(run06; 規則帳本 R-REF-CASCADE-01、R-WRITE-LOCK-02; R-PRINCIPLE-00 適用表 m／n; ADR-036)。
//
//規格句(來源: CLAUDE_rulebook.md「引用連帶」R-REF-CASCADE-01 規則 1～8、R-WRITE-LOCK-02、spec/evidence/run06-design-digest.md「不變式」):
//  S1 群組／權限改名(同 id 異名)時, 引用字串(users.cgrups、grups.cpemis)於同一次寫入內連帶改名; 互換 A↔B、鏈式 A→B 且 B→C 同時套用; 物件／陣列形式不互轉; 其他欄位原樣;
//  S2 級聯後各使用者之最終授權與改名前逐使用者相等(以真 getPermUserInfor 驗, 外部應用實際查到之結果);
//  S3 群組／權限／標的被刪除(舊 id 不在新表)時, 同一次寫入內清理所有引用(cgrups／cpemis／crules), 不論 isActive; 效果等同「找不到即忽略」; 刪後以同名新增(新 id)者不繼承;
//     歷史同名只刪其一(仍有同 id 同名之存續列)不清理; targets 之 id 即名稱, 同 id 不算刪除;
//  S4 拒絕(整次拒存、四表逐位元不變、固定語系鍵、動態原因只入 srLog 且不含引用端 id／email／name): renameCascadeNameInUse(新名為仍被啟用中引用之懸空名)、
//     renameCascadeConflict(容器內新名與另一未被改走之既有項目相撞, 含停用項)、renameCascadeDupGroup(被改名者屬歷史同名組且名稱仍被引用); 外部同步只收 invalidRows;
//  S5 外部同步(同一 from 內): 帶 id 之列依 id(同 id 異名＝改名級聯、舊 id 不在本批＝刪除並清理); 未帶 id 之列依名稱對應(名稱不變之重推不清理引用, 改名視為刪舊增新＝已知限制②);
//  S6 opt.cascadeRename=false: 不連帶改名(引用成為懸空, 授權依 ADR-035 c 收嚴)、不產生三種改名相關拒絕; 刪除連帶清理不受影響;
//  S7 無改名／刪除之寫入不對引用端表寫入(引用端全列含 userIdUpdate／timeUpdate 逐位元不變);
//  S8 取鎖階層一致(targets < pemis < grups < users), 並行寫入不死結、無遺失更新、引用端與主體無懸空;
//  S9 被級聯改寫之引用端列以操作者記為更新者(userIdUpdate／timeUpdate), 其他欄位不變(規則 6、已知限制⑤).
//
//輸入空間(軸 × 格; 每格對應之案例見各 it 之編號, 全表於回報):
//  被寫入表(grups／pemis／targets) × 事件(改名／刪除／刪後同名新增／互換／鏈式／歷史同名) × 入口(後台整表寫入／外部同步同 from) × 引用端形狀(物件／陣列／停用項) × 引用端來源(from ''／appRC 外部; run07 起基準種子已無外部 teamA 列) × cascadeRename(預設／false) × 拒絕(三鍵) × 操作者(admin／application) × 並行(五寫入者).
//
//真後端; DB 斷言一律 getWoItems() 唯讀 select, 寫入一律走後端 RPC／同步 API(例外: 歷史同名列無任何現行寫入入口可造〔ADR-034〕, 以 restartBackend 之 seedExtra 於後端停止期間旁路寫庫, 同 e2e-array-form).
//設定切換以 restartBackend(genTempSettings({ cascadeRename:false })); 收尾還原 './settings.json' 並 reseed, 以管理者寫入 RPC 還原四表為 base seed(同 api-mapKey 之做法).
//測試 token: 'sys'(id-for-admin, 後台 RPC 操作者)、'{token-for-application}'(id-for-application, 外部同步操作者與 getPermUserInfor 之 app 身分).
//跑法: node C:/opensrcOper/tools/quiet-run.mjs --name tapi --lock --timeout 1800 -- npx mocha test/api-refCascade.test.mjs --timeout 300000

import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import JSON5 from 'json5'
import { startApi, TOKEN_ADMIN, TOKEN_APP, getWoItems, callRpc, urlSync, urlGetPermUserInfor, readSrLogSince, purgeExternalRows } from './tools/api-setup.mjs'
import { restartBackend, genTempSettings } from './tools/e2e-setup.mjs'
import { BASE_SEED_COUNT, assertPristineSeed } from './tools/baseSeed.mjs'
import getPermUserInfor from '../src/getPermUserInfor.mjs'
import procLang from '../server/procLang.mjs'


const A = assert.strict
const dirTmp = path.join(path.dirname(fileURLToPath(import.meta.url)), '_tmp', 'api-refCascade') //測試中介資料(seed-extra.json), 收尾刪除

//base seed 之名稱
const G = { m1: '權限群組M1', m2: '權限群組M2', m3: '權限群組M3', m4: '權限群組M4' }
const P = { p1: '權限P1', p2: '權限P2', p3: '權限P3', p4: '權限P4' }
const FN = { users: 'updateUsers', grups: 'updateGrups', pemis: 'updatePemis', targets: 'updateTargets' }
const AUDIT = ['userIdUpdate', 'timeUpdate'] //寫入時由伺服器改寫之更新者欄位
const ID_ADMIN = 'id-for-admin'
const ID_APP = 'id-for-application'


// ===== 小工具 =====

let sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let clone = (o) => JSON.parse(JSON.stringify(o))
let omit = (o, ks) => Object.fromEntries(Object.entries(o).filter(([k]) => !ks.includes(k)))
let byId = (a, b) => String(a.id).localeCompare(String(b.id))
let toStr = (v) => (typeof v === 'string' ? v : JSON.stringify(v))
let ON = (mode = 'OR') => ({ mode, isActive: 'y' })
let OFF = (mode = 'OR') => ({ mode, isActive: 'n' })

//withTimeout: 單一呼叫逾時(後端卡死時不讓 hook 永遠等待)
let withTimeout = async (p, ms, label) => {
    let timer = null
    let tout = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}: ${ms} ms 內未完成`)), ms)
    })
    try {
        return await Promise.race([p, tout])
    }
    finally {
        clearTimeout(timer)
    }
}

//列構造(整列, 供整表寫入; order 由伺服器依陣列位置重給)
let uRow = (id, name, cgrups, o = {}) => ({ id, order: 0, name, email: `${id}@rc.example.com`, description: '', from: '', cgrups: toStr(cgrups), isAdmin: 'n', isActive: 'y', ...o })
let gRow = (id, name, cpemis, o = {}) => ({ id, order: 0, name, description: `${name}說明`, from: '', cpemis: toStr(cpemis), ...o })
let pRow = (id, name, crules, o = {}) => ({ id, order: 0, name, description: `${name}說明`, from: '', crules: toStr(crules), ...o })
let tRow = (id, o = {}) => ({ id, order: 0, description: `${id}說明`, from: '', ...o })

//DB 唯讀(經 getWoItems; 跨進程唯讀 select)
let selectAll = async (kt) => (await getWoItems())[kt].select()
let rowsOf = async (kt) => (await selectAll(kt)).sort((a, b) => (a.order || 0) - (b.order || 0))
let snapKt = async (kt) => JSON.stringify((await selectAll(kt)).sort(byId)) //整表快照(逐位元比對用)
let snap4 = async () => ({ users: await snapKt('users'), grups: await snapKt('grups'), pemis: await snapKt('pemis'), targets: await snapKt('targets') })

//後台寫入 RPC(操作者 id-for-admin)
let write = (kt, rows) => callRpc(FN[kt], [rows], TOKEN_ADMIN)
let edit = async (kt, fn) => {
    let cur = (await rowsOf(kt)).map(clone)
    let out = fn(cur)
    return write(kt, out || cur)
}
let mustEdit = async (kt, fn) => {
    let r = await edit(kt, fn)
    A.ok(r.ok, `預置 ${FN[kt]} 應成功，實得: ${JSON.stringify(r)}`)
    return r
}

//外部同步(操作者 id-for-application)
let postSync = async (keyTable, body, token = TOKEN_APP) => {
    let url = urlSync.replace('{keyTable}', keyTable).replace('{token}', token)
    let res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) })
    return await res.json()
}
let mustSync = async (keyTable, body) => {
    let r = await postSync(keyTable, body)
    A.equal(r.state, 'success', `預置同步 ${keyTable} 應成功，實得: ${JSON.stringify(r)}`)
    return r
}

//授權(外部應用實際查到之結果): rules 依名稱排序後 JSON 化
let permOf = async (userId) => {
    let ur = await getPermUserInfor(urlGetPermUserInfor, TOKEN_APP, userId)
    let rules = (ur.rules || []).map((x) => ({ name: x.name, isActive: x.isActive })).sort((a, b) => (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0)))
    return { rules, json: JSON.stringify(rules), nY: rules.filter((x) => x.isActive === 'y').length, grupsNames: String((ur.user && ur.user.grupsNames) || '') }
}
let permAll = async () => {
    let out = {}
    for (let u of await selectAll('users')) {
        out[u.id] = await permOf(u.id)
    }
    return out
}
//expectPermSame: 改名前後各使用者授權逐位相等(S2); ren 為改名對映(群組名), 用於換算 grupsNames; dropRule 為已被刪除之標的(其不再列於 rules)
let expectPermSame = (b, a, { ren = new Map(), dropRule = null, label = '' } = {}) => {
    for (let id of Object.keys(b)) {
        A.ok(a[id], `${label} 使用者 ${id} 授權查詢應有結果`)
        let rb = b[id].rules.filter((x) => x.name !== dropRule)
        A.deepEqual(a[id].rules, rb, `${label} 使用者 ${id} 之授權須與改名前相同`)
        let nb = b[id].grupsNames === '' ? [] : b[id].grupsNames.split(';')
        A.equal(a[id].grupsNames, nb.map((n) => (ren.has(n) ? ren.get(n) : n)).join(';'), `${label} 使用者 ${id} 之 grupsNames 須為改名後之名稱`)
    }
}

//oracle: 規格(S1／S3)之獨立實作——對授權字串 str 套用改名 ren(Map)與刪除 del(Set), 回傳預期之 parse 結果; 無命中回 null(表示須逐字不動)
let nameOfEl = (el, i) => ((el !== null && typeof el === 'object' && Object.prototype.hasOwnProperty.call(el, 'name')) ? el.name : i)
let oracle = (str, ren, del) => {
    let kp = null
    try {
        kp = JSON5.parse(str)
    }
    catch (e) {
        return null
    }
    if (kp === null || typeof kp !== 'object') {
        return null
    }
    let isArr = Array.isArray(kp)
    let ents = isArr ? kp.map((el, i) => ({ key: nameOfEl(el, i), el })) : Object.keys(kp).map((k) => ({ key: k, el: kp[k] }))
    let hit = ents.some((e) => typeof e.key === 'string' && (del.has(e.key) || ren.has(e.key)))
    if (!hit) {
        return null
    }
    if (isArr) {
        return ents.filter((e) => !(typeof e.key === 'string' && del.has(e.key))).map((e) => ((typeof e.key === 'string' && ren.has(e.key) && e.el !== null && typeof e.el === 'object') ? { ...e.el, name: ren.get(e.key) } : e.el))
    }
    let out = {}
    ents.forEach((e) => {
        if (del.has(e.key)) {
            return
        }
        out[ren.has(e.key) ? ren.get(e.key) : e.key] = e.el
    })
    return out
}

//checkHolders: 引用端表逐列依 oracle 驗(命中者改寫後等於預期、形式不變、他欄位不變; 未命中者整列逐位元不變含 userIdUpdate／timeUpdate), 回傳被改寫之 id 陣列(排序)
let checkHolders = ({ label, before, after, field, ren = new Map(), del = new Set() }) => {
    A.equal(after.length, before.length, `${label} 引用端表筆數須不變`)
    let aById = new Map(after.map((r) => [r.id, r]))
    let rewritten = []
    for (let b of before) {
        let a = aById.get(b.id)
        A.ok(a, `${label} 引用端列 ${b.id} 不得消失`)
        let exp = oracle(b[field], ren, del)
        if (exp === null) {
            A.deepEqual(a, b, `${label} 未命中之引用端列 ${b.id} 須逐位元不變(含 ${field}、userIdUpdate、timeUpdate)`)
            continue
        }
        rewritten.push(b.id)
        let parsedA = JSON.parse(a[field])
        A.deepEqual(parsedA, exp, `${label} 引用端列 ${b.id} 之 ${field} 須依改名／刪除改寫(實得 ${a[field]})`)
        A.equal(Array.isArray(parsedA), Array.isArray(JSON5.parse(b[field])), `${label} 引用端列 ${b.id} 之物件／陣列形式須不變`)
        A.deepEqual(omit(a, [field, ...AUDIT]), omit(b, [field, ...AUDIT]), `${label} 引用端列 ${b.id} 除 ${field} 與更新者欄位外須不變`)
    }
    return rewritten.sort()
}

//等待 srLog(pino 非同步落檔)出現符合 pred 之行, 回傳 time ≥ t0 之全部行
let waitLines = async (t0, pred, label, ms = 30000) => {
    let tEnd = Date.now() + ms
    let lines = []
    while (Date.now() < tEnd) {
        lines = readSrLogSince(t0)
        if (lines.some(pred)) {
            await sleep(800) //同批其他行落檔
            return readSrLogSince(t0)
        }
        await sleep(300)
    }
    throw new Error(`${label}: ${ms} ms 內 srLog 未見預期之行(讀到 ${lines.length} 行)`)
}
//checkNoSecrets: srLog 各行不得含引用端之 id／email／name 值(動態原因只記 key 與計數, 規則 8)
let checkNoSecrets = (lines, secrets, label) => {
    for (let l of lines) {
        if (String(l.event).startsWith('api/getPerm')) {
            continue //本檔自己查詢授權(permAll)之查詢紀錄: 其 userId 為「被查詢者」, 非引用連帶流程之紀錄
        }
        for (let s of secrets) {
            A.ok(!l._raw.includes(s), `${label} srLog 不得含引用端值「${s}」: ${l._raw}`)
        }
    }
}

//語系鍵須有 eng 與 cht 文字(後端回 key 供前端 $t 換算)
let checkLangKey = (key) => {
    let lang = procLang({})
    A.ok(typeof lang.eng[key] === 'string' && lang.eng[key].length > 0, `procLang.eng 須有 ${key}`)
    A.ok(typeof lang.cht[key] === 'string' && lang.cht[key].length > 0, `procLang.cht 須有 ${key}`)
}

//danglingOf: 四表現況下之懸空引用(cgrups 鍵不在 grups 名稱、cpemis 鍵不在 pemis 名稱、crules 鍵不在 targets id), 回傳 ['holder:id→name'] 排序陣列
let danglingOf = async () => {
    let [us, gs, ps, ts] = [await selectAll('users'), await selectAll('grups'), await selectAll('pemis'), await selectAll('targets')]
    let out = []
    let scan = (rows, field, names, tag) => {
        for (let r of rows) {
            let kp = null
            try {
                kp = JSON5.parse(r[field])
            }
            catch (e) {
                continue
            }
            if (kp === null || typeof kp !== 'object') {
                continue
            }
            let ents = Array.isArray(kp) ? kp.map((el, i) => nameOfEl(el, i)) : Object.keys(kp)
            for (let n of ents) {
                if (!names.has(n)) {
                    out.push(`${tag}:${r.id}→${n}`)
                }
            }
        }
    }
    scan(us, 'cgrups', new Set(gs.map((g) => g.name)), 'users')
    scan(gs, 'cpemis', new Set(ps.map((p) => p.name)), 'grups')
    scan(ps, 'crules', new Set(ts.map((t) => t.id)), 'pemis')
    return out.sort()
}


describe('api-refCascade (引用連帶: 改名級聯＋刪除連帶清理, 真後端)', function() {
    this.timeout(300000)

    let BASE = null //base seed 快照(依 order 排序之整列)
    let backendMode = 'default' //'default'｜'off'(cascadeRename:false)

    //useBackend: 切換後端設定(DB 保留); opts 同 restartBackend
    let useBackend = async (mode, opts = {}) => {
        await restartBackend(mode === 'off' ? genTempSettings({ cascadeRename: false }) : './settings.json', opts)
        backendMode = mode
    }

    //restoreAll: 以管理者寫入 RPC 把四表還原為 base seed. 次序「被引用者先、引用端後」(targets → pemis → grups → users):
    //  被引用表之改名會連帶改寫引用端(此時引用端仍指向舊名, 隨即被改回), 引用端最後一併還原; 反序則引用端先指向 base 名稱(尚無實體)而使 grups／pemis 改回原名被 renameCascadeNameInUse 拒絕
    //  run07(F-23): 後台整表寫入不得刪除外部列(from 非空, 本檔以同步灌入之 appRC* 夾具與 seedExtra 之 appRC-d 列), 故先以 purgeExternalRows(測試框架之重置, 不經 RPC)移除外部列再以 RPC 還原後台列;
    //  直接刪除不經引用連帶, 之後由「被引用者先、引用端後」之 RPC 還原把後台引用端改回 base seed
    let restoreAll = async () => {
        await purgeExternalRows()
        for (let kt of ['targets', 'pemis', 'grups', 'users']) {
            let r = await withTimeout(callRpc(FN[kt], [clone(BASE[kt])], TOKEN_ADMIN), 60000, `restoreAll ${FN[kt]}`)
            if (!r.ok) {
                throw new Error(`restoreAll ${FN[kt]} 失敗: ${JSON.stringify(r)}`)
            }
        }
    }
    //restoreAllSafe: restoreAll 失敗(殘留狀態使改名被拒, 或後端卡死)時, 改以 cascadeRename:false 之後端還原(該設定下改名不拒), 再切回原設定
    let restoreAllSafe = async () => {
        try {
            await restoreAll()
        }
        catch (e) {
            console.log(`[api-refCascade] restoreAll 失敗, 改以 cascadeRename:false 後端還原: ${e.message}`)
            let back = backendMode
            await useBackend('off')
            await restoreAll()
            await useBackend(back)
        }
    }

    //setupFx: 標準夾具(於 base seed 之上加): 物件／陣列／停用項引用、陣列形式 cpemis 之群組、供「等於找不到即忽略」比對之對照使用者
    let setupFx = async () => {
        await mustEdit('grups', (rows) => [...rows,
            gRow('id-rc-ga', 'rc-ga', [{ name: P.p2, mode: 'OR', isActive: 'y' }, { name: P.p3, mode: 'AND', isActive: 'y' }]), //陣列形式 cpemis
            gRow('id-rc-gctl', 'rc-gctl', { [P.p2]: ON('OR') }), //對照群組: 等同 M3 刪除 P3(AND)之後
        ])
        await mustEdit('users', (rows) => [...rows,
            uRow('id-rc-uo', 'rcUo', { [G.m1]: ON('OR'), [G.m2]: ON('AND') }), //物件形式: OR M1 ＋ AND M2
            uRow('id-rc-ua', 'rcUa', [{ name: G.m1, mode: 'OR', isActive: 'y' }, { name: G.m3, mode: 'AND', isActive: 'y' }]), //陣列形式
            uRow('id-rc-ui', 'rcUi', { [G.m2]: OFF('OR'), [G.m1]: ON('OR') }), //含停用項
            uRow('id-rc-ug', 'rcUg', { 'rc-ga': ON('OR'), [G.m4]: ON('OR') }), //引用陣列形式 cpemis 之群組
            uRow('id-rc-uctl1', 'rcUctl1', { [G.m1]: ON('OR') }), //對照: 僅 OR M1(= uo 刪除 M2 之後)
            uRow('id-rc-uctl2', 'rcUctl2', { 'rc-gctl': ON('OR') }), //對照: 僅 OR rc-gctl
        ])
    }

    //writeSeedExtra: 歷史同名之旁路列(後端停止期間寫庫): rc-dup-g(dg1 屬外部 from appRC-d、dg2 屬後台, 被 id-rc-du 引用)、rc-dup-h(兩列, 無人引用)
    let writeSeedExtra = () => {
        let g0 = BASE.grups.find((g) => g.name === G.m1)
        let u0 = BASE.users.find((u) => u.name === 'peter')
        let extra = {
            grups: [
                { ...g0, id: 'id-rc-dg1', order: 10, name: 'rc-dup-g', description: 'rc-dup-g 1', from: 'appRC-d', cpemis: JSON.stringify({ [P.p1]: ON('OR') }) },
                { ...g0, id: 'id-rc-dg2', order: 11, name: 'rc-dup-g', description: 'rc-dup-g 2', from: '', cpemis: JSON.stringify({ [P.p2]: ON('OR') }) },
                { ...g0, id: 'id-rc-dh1', order: 12, name: 'rc-dup-h', description: 'rc-dup-h 1', from: '', cpemis: JSON.stringify({ [P.p1]: ON('OR') }) },
                { ...g0, id: 'id-rc-dh2', order: 13, name: 'rc-dup-h', description: 'rc-dup-h 2', from: '', cpemis: JSON.stringify({ [P.p2]: ON('OR') }) },
                //run07(F-23): dk1／dk2 為兩列皆後台之歷史同名組(rc-dup-k, 被 id-rc-dkh 引用), 供「改名任一筆」(RC-032)與「兩筆皆刪」(RC-035)之後台案例;
                //  rc-dup-g 之 dg1 屬外部(appRC-d, 後台不得改名／刪除, 見 api-externalRows), 仍供 RC-033 之外部同步案例
                { ...g0, id: 'id-rc-dk1', order: 14, name: 'rc-dup-k', description: 'rc-dup-k 1', from: '', cpemis: JSON.stringify({ [P.p1]: ON('OR') }) },
                { ...g0, id: 'id-rc-dk2', order: 15, name: 'rc-dup-k', description: 'rc-dup-k 2', from: '', cpemis: JSON.stringify({ [P.p2]: ON('OR') }) },
            ],
            users: [
                { ...u0, id: 'id-rc-du', order: 10, name: 'rcDupHolder', email: 'rc-dup-holder@example.com', description: '', from: '', cgrups: JSON.stringify({ 'rc-dup-g': ON('OR') }) },
                { ...u0, id: 'id-rc-dkh', order: 11, name: 'rcDupHolderK', email: 'rc-dup-holder-k@example.com', description: '', from: '', cgrups: JSON.stringify({ 'rc-dup-k': ON('OR') }) },
            ],
        }
        fs.mkdirSync(dirTmp, { recursive: true })
        let fp = path.join(dirTmp, 'seed-extra.json')
        fs.writeFileSync(fp, JSON.stringify(extra), 'utf8')
        console.log('seed-extra:', path.resolve(fp))
        return fp
    }

    before(async function() {
        this.timeout(300000)
        await startApi() //預設 settings.json(cascadeRename 預設 true)
        //base seed 須為 pristine(主鍵集合守門, 同 e2e 檔); 本檔唯一之後端使用者為本行程(--lock), 殘留即為上一檔遺留, 大聲失敗
        BASE = {}
        for (let kt of ['users', 'grups', 'pemis', 'targets']) {
            let rows = await rowsOf(kt)
            assertPristineSeed(kt, rows)
            BASE[kt] = rows.map(clone)
        }
        let dg = await danglingOf()
        A.deepEqual(dg, [], `前提: base seed 無懸空引用，實得 ${JSON.stringify(dg)}`)
    })

    after(async function() {
        this.timeout(300000)
        try {
            if (backendMode !== 'default') {
                await useBackend('default')
            }
            await restoreAllSafe()
        }
        finally {
            fs.rmSync(dirTmp, { recursive: true, force: true }) //測試中介資料(seed-extra.json)
        }
        //還原預設設定並 reseed 收尾(同 api-mapKey; mocha 行程持有 lmdb 映射時退化為 upsert, 不移除多餘列, 故上方已先以 RPC 還原)
        await restartBackend('./settings.json', { reseed: true })
        backendMode = 'default'
        for (let kt of ['users', 'grups', 'pemis', 'targets']) {
            let rows = await rowsOf(kt)
            A.equal(rows.length, BASE_SEED_COUNT[kt], `收尾後 ${kt} 筆數須為 base seed`)
            assertPristineSeed(kt, rows)
            //業務欄位逐欄等於 base seed(不比 order 與更新者欄位: 寫入 RPC 重給 order、記更新者)
            //  reseed(upsert)重產種子列, timeCreate 為重產時刻而與初次種子不同, 亦不比
            let bMap = new Map(BASE[kt].map((r) => [r.id, r]))
            for (let r of rows) {
                A.deepEqual(omit(r, ['order', 'timeCreate', ...AUDIT]), omit(bMap.get(r.id), ['order', 'timeCreate', ...AUDIT]), `收尾後 ${kt} 列 ${r.id} 須等於 base seed`)
            }
        }
        A.equal(fs.existsSync(dirTmp), false, 'test/_tmp/api-refCascade 須已清除')
    })


    // ===== A. 預設設定(cascadeRename 預設 true): 每案前後以 base seed 還原 =====

    describe('A. 預設設定', function() {

        beforeEach(async function() {
            this.timeout(300000)
            await restoreAllSafe()
        })
        afterEach(async function() {
            this.timeout(300000)
            await restoreAllSafe()
        })


        // ---------- 案例 1: 後台改名級聯 ----------

        it('API-RC-001 後台群組改名: users.cgrups(物件／陣列形式、外部 appRC1 列)連帶改寫、授權與改名前相同、未命中列逐位元不變、pemis／targets 不動(S1、S2、S7; srLog 計數不含引用端值)', async function() {
            await setupFx()
            //run07(F-23): 基準種子之 peter／mary／john 由外部 teamA 改後台列(from ''), 原「外部 teamA 列被改名級聯改寫」之外部列涵蓋改以同步灌入一位外部使用者(from=appRC1)補上, 斷言之意不變(外部列之 cgrups 被連帶改寫、from 不變、nExternal 計為 1)
            await mustSync('users', { from: 'appRC1', rows: [{ id: 'id-rc-001x', order: 0, name: 'rc001x', email: 'rc-001x@rc.example.com', cgrups: JSON.stringify({ [G.m1]: ON('OR') }), isAdmin: 'n', isActive: 'y' }] })
            const OLD = G.m1
            const NEW = '權限群組M1改名'
            let usersB = await rowsOf('users')
            let grupsB = await rowsOf('grups')
            let pemisS = await snapKt('pemis')
            let targetsS = await snapKt('targets')
            let permB = await permAll()
            let t0 = Date.now()

            let r = await edit('grups', (rows) => rows.map((g) => (g.name === OLD ? { ...g, name: NEW } : g)))
            A.ok(r.ok, `updateGrups 改名應成功，實得: ${JSON.stringify(r)}`)

            //S1 主體: 同 id 改名, 他欄位與他列不變
            let grupsA = await rowsOf('grups')
            let gB = grupsB.find((g) => g.name === OLD)
            let gA = grupsA.find((g) => g.id === gB.id)
            A.equal(gA.name, NEW, '被改名之群組新名稱')
            A.deepEqual(omit(gA, AUDIT), { ...omit(gB, AUDIT), name: NEW }, '被改名之群組除名稱外不變')
            for (let b of grupsB.filter((g) => g.id !== gB.id)) {
                A.deepEqual(omit(grupsA.find((g) => g.id === b.id), AUDIT), omit(b, AUDIT), `他群組 ${b.id} 不變`)
            }

            //S1 引用端: 物件形式、陣列形式、外部列(appRC1)皆改寫; 未命中者逐字不動
            let usersA = await rowsOf('users')
            let hit = checkHolders({ label: 'cgrups', before: usersB, after: usersA, field: 'cgrups', ren: new Map([[OLD, NEW]]) })
            A.deepEqual(hit, ['id-for-peter', 'id-rc-ua', 'id-rc-ui', 'id-rc-uctl1', 'id-rc-uo', 'id-rc-001x'].sort(), '被改寫者恰為引用舊名之 6 位使用者(含後台列 peter、外部列 001x 與停用項之 ui)')
            let peter = usersA.find((u) => u.id === 'id-for-peter')
            A.equal(peter.from, '', 'peter 為後台列(run07 起基準種子 from 為 \'\'), 來源不變')
            let ext = usersA.find((u) => u.id === 'id-rc-001x')
            A.equal(ext.from, 'appRC1', '外部列 001x 之來源仍為 appRC1(Q8: 後台寫入改寫外部列之 cgrups, from 不變)')
            A.deepEqual(Object.keys(JSON.parse(ext.cgrups)), [NEW], '外部列 001x 之 cgrups 已改為新名')
            A.deepEqual(Object.keys(JSON.parse(peter.cgrups)), [NEW], 'peter 之 cgrups 已改為新名')
            let ua = JSON.parse(usersA.find((u) => u.id === 'id-rc-ua').cgrups)
            A.ok(Array.isArray(ua), '陣列形式引用仍為陣列')
            A.deepEqual(ua.map((x) => x.name), [NEW, G.m3], '陣列形式引用之元素名稱依序為新名、M3')
            for (let id of ['id-for-mary', 'id-for-john', 'id-for-admin']) {
                A.equal(usersA.find((u) => u.id === id).cgrups, usersB.find((u) => u.id === id).cgrups, `${id} 未引用被改名者, cgrups 須逐字不動(保留原 JSON5 排版)`)
            }

            //S2 授權不變(外部應用實際查到之結果)
            expectPermSame(permB, await permAll(), { ren: new Map([[OLD, NEW]]), label: '群組改名' })

            //S7 他表不動
            A.equal(await snapKt('pemis'), pemisS, 'pemis 須逐位元不變')
            A.equal(await snapKt('targets'), targetsS, 'targets 須逐位元不變')

            //規則 8 log: refCascade-done 帶計數、不帶引用端 id／email／name
            let lines = await waitLines(t0, (l) => l.event === 'refCascade-done' && l.keyTable === 'grups', 'refCascade-done')
            let done = lines.find((l) => l.event === 'refCascade-done' && l.keyTable === 'grups')
            A.deepEqual({ holder: done.holder, nRename: done.nRename, nDelName: done.nDelName, nHolders: done.nHolders, nRenameHolders: done.nRenameHolders, nDelHolders: done.nDelHolders, nExternal: done.nExternal }, { holder: 'users', nRename: 1, nDelName: 0, nHolders: 6, nRenameHolders: 6, nDelHolders: 0, nExternal: 1 }, `refCascade-done 計數(實得 ${done._raw})`)
            checkNoSecrets(lines, ['id-for-peter', 'id-rc-uo', 'id-rc-ua', 'id-rc-ui', 'id-rc-uctl1', 'id-rc-001x', 'peter@example.com', '@rc.example.com'], '001')
        })

        it('API-RC-002 後台權限改名: grups.cpemis(物件／陣列形式)連帶改寫、全部使用者授權不變、users／targets 不動(S1、S2、S7)', async function() {
            await setupFx()
            const OLD = P.p2
            const NEW = '權限P2改名'
            let grupsB = await rowsOf('grups')
            let usersS = await snapKt('users')
            let targetsS = await snapKt('targets')
            let permB = await permAll()

            let r = await edit('pemis', (rows) => rows.map((p) => (p.name === OLD ? { ...p, name: NEW } : p)))
            A.ok(r.ok, `updatePemis 改名應成功，實得: ${JSON.stringify(r)}`)

            let hit = checkHolders({ label: 'cpemis', before: grupsB, after: await rowsOf('grups'), field: 'cpemis', ren: new Map([[OLD, NEW]]) })
            A.deepEqual(hit, [`id-for-${G.m1}`, `id-for-${G.m2}`, `id-for-${G.m3}`, 'id-rc-ga', 'id-rc-gctl'].sort(), '被改寫者恰為引用 P2 之 5 個群組(M4 引用 P3／P4, 逐字不動)')
            let ga = JSON.parse((await rowsOf('grups')).find((g) => g.id === 'id-rc-ga').cpemis)
            A.ok(Array.isArray(ga) && ga[0].name === NEW && ga[1].name === P.p3, '陣列形式 cpemis 仍為陣列且元素名稱已改')
            let pA = (await rowsOf('pemis')).find((p) => p.id === `id-for-${OLD}`)
            A.equal(pA.name, NEW, '被改名之權限新名稱')
            expectPermSame(permB, await permAll(), { label: '權限改名' })
            A.equal(await snapKt('users'), usersS, 'users 須逐位元不變(群組名稱未動)')
            A.equal(await snapKt('targets'), targetsS, 'targets 須逐位元不變')
        })

        it('API-RC-003 群組互換改名 M1↔M2: 同時套用(非逐一套用)、物件形式 OR M1＋AND M2 者兩鍵互換、全部使用者授權不變(S1、S2)', async function() {
            await setupFx()
            let usersB = await rowsOf('users')
            let permB = await permAll()
            let r = await edit('grups', (rows) => rows.map((g) => (g.name === G.m1 ? { ...g, name: G.m2 } : (g.name === G.m2 ? { ...g, name: G.m1 } : g))))
            A.ok(r.ok, `互換應成功，實得: ${JSON.stringify(r)}`)

            let grupsA = await rowsOf('grups')
            A.equal(grupsA.find((g) => g.id === `id-for-${G.m1}`).name, G.m2, 'id-M1 之群組改名為 M2')
            A.equal(grupsA.find((g) => g.id === `id-for-${G.m2}`).name, G.m1, 'id-M2 之群組改名為 M1')
            let usersA = await rowsOf('users')
            let ren = new Map([[G.m1, G.m2], [G.m2, G.m1]])
            checkHolders({ label: '互換', before: usersB, after: usersA, field: 'cgrups', ren })
            let by = (id) => JSON.parse(usersA.find((u) => u.id === id).cgrups)
            A.deepEqual(Object.keys(by('id-for-peter')), [G.m2], 'peter(原 M1)改指 M2')
            A.deepEqual(Object.keys(by('id-for-mary')), [G.m1], 'mary(原 M2)改指 M1')
            A.deepEqual(by('id-rc-uo'), { [G.m2]: ON('OR'), [G.m1]: ON('AND') }, 'uo(OR M1＋AND M2)兩鍵互換, 模式隨項目走(非逐一套用而塌成同一項)')
            expectPermSame(permB, await permAll(), { ren, label: '互換' })
        })

        it('API-RC-004 群組鏈式改名 M1→M2、M2→M5: 同時套用(引用 M2 者不被連續改成 M5 以外之名、引用 M1 者不被改成 M5)、授權不變(S1、S2)', async function() {
            await setupFx()
            const M5 = '權限群組M5'
            let usersB = await rowsOf('users')
            let permB = await permAll()
            let r = await edit('grups', (rows) => rows.map((g) => (g.name === G.m1 ? { ...g, name: G.m2 } : (g.name === G.m2 ? { ...g, name: M5 } : g))))
            A.ok(r.ok, `鏈式改名應成功，實得: ${JSON.stringify(r)}`)

            let usersA = await rowsOf('users')
            let ren = new Map([[G.m1, G.m2], [G.m2, M5]])
            checkHolders({ label: '鏈式', before: usersB, after: usersA, field: 'cgrups', ren })
            let by = (id) => JSON.parse(usersA.find((u) => u.id === id).cgrups)
            A.deepEqual(Object.keys(by('id-for-peter')), [G.m2], 'peter(原 M1)→M2(非 M5)')
            A.deepEqual(Object.keys(by('id-for-mary')), [M5], 'mary(原 M2)→M5')
            A.deepEqual(by('id-rc-uo'), { [G.m2]: ON('OR'), [M5]: ON('AND') }, 'uo: OR M1→M2、AND M2→M5')
            expectPermSame(permB, await permAll(), { ren, label: '鏈式' })
        })

        it('API-RC-005 後台改名改寫外部同步來源之 users 列(from=appRC): 只改 cgrups、from 與他欄位不變(Q8、規則 6)', async function() {
            await mustSync('users', { from: 'appRC', rows: [
                { id: 'id-rc-xa', order: 0, name: 'rcXa', email: 'rc-xa@rc.example.com', cgrups: JSON.stringify({ [G.m1]: ON('OR') }), isAdmin: 'n', isActive: 'y' },
                { id: 'id-rc-xb', order: 1, name: 'rcXb', email: 'rc-xb@rc.example.com', cgrups: JSON.stringify([{ name: G.m1, mode: 'OR', isActive: 'y' }, { name: G.m4, mode: 'OR', isActive: 'y' }]), isAdmin: 'n', isActive: 'y' },
            ] })
            const NEW = '權限群組M1外部改名'
            let usersB = await rowsOf('users')
            let permB = await permAll()
            let r = await edit('grups', (rows) => rows.map((g) => (g.name === G.m1 ? { ...g, name: NEW } : g)))
            A.ok(r.ok, `updateGrups 改名應成功，實得: ${JSON.stringify(r)}`)
            let usersA = await rowsOf('users')
            let hit = checkHolders({ label: '外部列', before: usersB, after: usersA, field: 'cgrups', ren: new Map([[G.m1, NEW]]) })
            A.ok(hit.includes('id-rc-xa') && hit.includes('id-rc-xb'), `外部 appRC 之兩列皆被改寫，實得 ${JSON.stringify(hit)}`)
            for (let id of ['id-rc-xa', 'id-rc-xb']) {
                A.equal(usersA.find((u) => u.id === id).from, 'appRC', `${id} 之 from 不變`)
            }
            A.ok(Array.isArray(JSON.parse(usersA.find((u) => u.id === 'id-rc-xb').cgrups)), '外部列之陣列形式仍為陣列')
            expectPermSame(permB, await permAll(), { ren: new Map([[G.m1, NEW]]), label: '外部列' })
        })


        it('API-RC-006 引用端字串為壞 JSON／空字串／純量／空陣列: 改名與刪除皆視為空容器不動(逐位元不變)、不使寫入失敗; 同批其餘命中之列照常改寫(規則 2)', async function() {
            await mustEdit('users', (rows) => [...rows,
                uRow('id-rc-bad1', 'rcBad1', '{bad json'),
                uRow('id-rc-bad2', 'rcBad2', ''),
                uRow('id-rc-bad3', 'rcBad3', '123'),
                uRow('id-rc-bad4', 'rcBad4', '[]'),
            ])
            let usersB = await rowsOf('users')
            let r1 = await edit('grups', (rows) => rows.map((g) => (g.name === G.m1 ? { ...g, name: '權限群組M1壞形' } : g)))
            A.ok(r1.ok, `改名應成功(壞形引用端不使寫入失敗)，實得: ${JSON.stringify(r1)}`)
            let hit1 = checkHolders({ label: '壞形改名', before: usersB, after: await rowsOf('users'), field: 'cgrups', ren: new Map([[G.m1, '權限群組M1壞形']]) })
            A.deepEqual(hit1, ['id-for-peter'], '僅 peter 命中改寫; 壞形四列逐位元不變')
            let usersB2 = await rowsOf('users')
            let r2 = await edit('grups', (rows) => rows.filter((g) => g.name !== G.m2))
            A.ok(r2.ok, `刪除應成功，實得: ${JSON.stringify(r2)}`)
            let hit2 = checkHolders({ label: '壞形刪除', before: usersB2, after: await rowsOf('users'), field: 'cgrups', del: new Set([G.m2]) })
            A.deepEqual(hit2, ['id-for-mary'], '僅 mary 命中清理; 壞形四列逐位元不變')
        })


        // ---------- 案例 2: 後台刪除連帶清理 ----------

        it('API-RC-020 後台刪除群組: users.cgrups 該名稱被移除(含停用項); AND 引用者授權變寬且等於「找不到即忽略」(對照使用者)、僅引用者清為全 n(S3)', async function() {
            await setupFx()
            //run07(F-23): mary 由外部 teamA 改後台列(from ''), 原「引用端含外部列被清理」之涵蓋改以同步灌入一位外部使用者(from=appRC20, 僅引用 M2)補上
            await mustSync('users', { from: 'appRC20', rows: [{ id: 'id-rc-020x', order: 0, name: 'rc020x', email: 'rc-020x@rc.example.com', cgrups: JSON.stringify({ [G.m2]: ON('OR') }), isAdmin: 'n', isActive: 'y' }] })
            let usersB = await rowsOf('users')
            let permB = await permAll()
            let pemisS = await snapKt('pemis')
            let t0 = Date.now()
            let r = await edit('grups', (rows) => rows.filter((g) => g.name !== G.m2))
            A.ok(r.ok, `刪除群組應成功，實得: ${JSON.stringify(r)}`)
            A.ok(!(await rowsOf('grups')).some((g) => g.name === G.m2), 'M2 已刪除')

            let hit = checkHolders({ label: '刪群組', before: usersB, after: await rowsOf('users'), field: 'cgrups', del: new Set([G.m2]) })
            A.deepEqual(hit, ['id-for-mary', 'id-rc-ui', 'id-rc-uo', 'id-rc-020x'].sort(), '被清理者恰為 mary、uo(AND 引用)、ui(停用項引用: 刪除不論 isActive 皆移除)與外部列 020x')
            A.equal((await rowsOf('users')).find((u) => u.id === 'id-rc-020x').from, 'appRC20', '外部列 020x 被清理後 from 不變')
            let permA = await permAll()
            //S3: uo 原為 OR M1 ＋ AND M2; 清理後等於僅 OR M1 之對照使用者(舊版「找不到即忽略」之結果)
            A.deepEqual(permA['id-rc-uo'].rules, permA['id-rc-uctl1'].rules, 'uo 清理後之授權須等於僅引用 M1 之對照使用者')
            A.ok(permA['id-rc-uo'].nY > permB['id-rc-uo'].nY, `AND 引用移除後限制解除、授權變寬(前 ${permB['id-rc-uo'].nY}／後 ${permA['id-rc-uo'].nY})`)
            A.equal(permA['id-for-mary'].nY, 0, 'mary 之唯一群組被刪, 授權清為全 n')
            A.deepEqual(permA['id-rc-ui'].rules, permA['id-rc-uctl1'].rules, 'ui(停用 M2＋OR M1)清理後等同對照使用者')
            for (let id of ['id-for-peter', 'id-for-john', 'id-for-admin', 'id-rc-ua', 'id-rc-ug', 'id-rc-uctl1', 'id-rc-uctl2']) {
                A.deepEqual(permA[id].rules, permB[id].rules, `${id} 未引用 M2, 授權不變`)
            }
            A.equal(await snapKt('pemis'), pemisS, 'pemis 不動')
            //規則 8 log: refCascade-done 之刪除計數(020x 來源 appRC20 為外部列, 其餘為後台列; run07 前為 mary 來源 teamA)
            let lines = await waitLines(t0, (l) => l.event === 'refCascade-done' && l.keyTable === 'grups', 'refCascade-done')
            let done = lines.find((l) => l.event === 'refCascade-done' && l.keyTable === 'grups')
            A.deepEqual({ holder: done.holder, nRename: done.nRename, nDelName: done.nDelName, nHolders: done.nHolders, nRenameHolders: done.nRenameHolders, nDelHolders: done.nDelHolders, nExternal: done.nExternal }, { holder: 'users', nRename: 0, nDelName: 1, nHolders: 4, nRenameHolders: 0, nDelHolders: 4, nExternal: 1 }, `refCascade-done 計數(實得 ${done._raw})`)
            checkNoSecrets(lines, ['id-for-mary', 'id-rc-uo', 'id-rc-ui', 'id-rc-020x', 'mary@example.com', '@rc.example.com'], '020')
        })

        it('API-RC-021 後台刪除權限: grups.cpemis 該名稱被移除(物件／陣列形式皆清); AND 引用者之授權等於對照群組之使用者(S3)', async function() {
            await setupFx()
            let grupsB = await rowsOf('grups')
            let usersS = await snapKt('users')
            let r = await edit('pemis', (rows) => rows.filter((p) => p.name !== P.p3))
            A.ok(r.ok, `刪除權限應成功，實得: ${JSON.stringify(r)}`)
            let grupsA = await rowsOf('grups')
            let hit = checkHolders({ label: '刪權限', before: grupsB, after: grupsA, field: 'cpemis', del: new Set([P.p3]) })
            A.deepEqual(hit, [`id-for-${G.m2}`, `id-for-${G.m3}`, `id-for-${G.m4}`, 'id-rc-ga'].sort(), '被清理者恰為引用 P3 之 4 個群組(M1、rc-gctl 不引用, 逐字不動)')
            let ga = JSON.parse(grupsA.find((g) => g.id === 'id-rc-ga').cpemis)
            A.ok(Array.isArray(ga) && ga.length === 1 && ga[0].name === P.p2, '陣列形式 cpemis 仍為陣列且僅剩 P2')
            let permA = await permAll()
            A.deepEqual(permA['id-for-john'].rules, permA['id-rc-uctl2'].rules, 'john(M3: OR P2＋AND P3)清理後等於僅 OR P2 之對照使用者(AND 限制解除, 等於找不到即忽略)')
            A.equal(await snapKt('users'), usersS, 'users 不動')
        })

        it('API-RC-022 後台刪除標的: pemis.crules 該標的被移除、其餘規則不動、各使用者授權除該標的外不變(S3)', async function() {
            await setupFx()
            const TID = '專案A/頁A/區塊A'
            let pemisB = await rowsOf('pemis')
            let usersS = await snapKt('users')
            let grupsS = await snapKt('grups')
            let permB = await permAll()
            let r = await edit('targets', (rows) => rows.filter((t) => t.id !== TID))
            A.ok(r.ok, `刪除標的應成功，實得: ${JSON.stringify(r)}`)
            A.ok(!(await rowsOf('targets')).some((t) => t.id === TID), '標的已刪除')
            let hit = checkHolders({ label: '刪標的', before: pemisB, after: await rowsOf('pemis'), field: 'crules', del: new Set([TID]) })
            A.deepEqual(hit, [`id-for-${P.p1}`], '被清理者僅 P1(唯一引用該標的之權限)')
            expectPermSame(permB, await permAll(), { dropRule: TID, label: '刪標的' })
            A.equal(await snapKt('users'), usersS, 'users 不動')
            A.equal(await snapKt('grups'), grupsS, 'grups 不動')
        })

        it('API-RC-023 後台刪除群組 M1 並於同一次寫入以同名新增(新 id): 舊引用被清理、新列不繼承(S3 原則 6)', async function() {
            await setupFx()
            let usersB = await rowsOf('users')
            let r = await edit('grups', (rows) => [...rows.filter((g) => g.name !== G.m1), gRow('id-rc-m1-new', G.m1, { [P.p1]: ON('OR') })])
            A.ok(r.ok, `刪後同名新增應成功，實得: ${JSON.stringify(r)}`)
            let grupsA = await rowsOf('grups')
            A.ok(!grupsA.some((g) => g.id === `id-for-${G.m1}`), '舊列(舊 id)已刪')
            A.ok(grupsA.some((g) => g.id === 'id-rc-m1-new' && g.name === G.m1), '同名新列(新 id)存在')
            let usersA = await rowsOf('users')
            let hit = checkHolders({ label: '刪後同名新增', before: usersB, after: usersA, field: 'cgrups', del: new Set([G.m1]) })
            A.ok(hit.includes('id-for-peter'), 'peter 之 M1 引用被清理')
            for (let id of hit) {
                A.ok(!usersA.find((u) => u.id === id).cgrups.includes(G.m1), `${id} 不得再引用 M1(新同名列不接管)`)
            }
            A.deepEqual(JSON.parse(usersA.find((u) => u.id === 'id-for-peter').cgrups), {}, 'peter 之 cgrups 清為空(不被同名新群組接管)')
            A.equal((await permOf('id-for-peter')).nY, 0, 'peter 授權為全 n(新同名群組不繼承原引用)')
        })

        it('API-RC-024 後台刪除權限 P1 並同次以同名新增(新 id): 舊引用被清理、新列不繼承(S3 原則 6)', async function() {
            await setupFx()
            let grupsB = await rowsOf('grups')
            let r = await edit('pemis', (rows) => [...rows.filter((p) => p.name !== P.p1), pRow('id-rc-p1-new', P.p1, { '專案A/頁C': 'y' })])
            A.ok(r.ok, `刪後同名新增應成功，實得: ${JSON.stringify(r)}`)
            let grupsA = await rowsOf('grups')
            let hit = checkHolders({ label: '刪權限後同名新增', before: grupsB, after: grupsA, field: 'cpemis', del: new Set([P.p1]) })
            A.deepEqual(hit, [`id-for-${G.m1}`], '僅 M1 引用 P1')
            A.ok(!(P.p1 in JSON.parse(grupsA.find((g) => g.id === `id-for-${G.m1}`).cpemis)), 'M1 不得被新 P1 接管')
        })

        it('API-RC-025 後台標的刪除再同 id 新增(同一次寫入): 同 id 不算刪除, pemis.crules 逐位元不變(S3: 身分以主鍵, targets 之 id 即名稱)', async function() {
            const TID = '專案A/頁A/區塊A'
            let pemisS = await snapKt('pemis')
            let r = await edit('targets', (rows) => [...rows.filter((t) => t.id !== TID), tRow(TID)])
            A.ok(r.ok, `應成功，實得: ${JSON.stringify(r)}`)
            A.equal(await snapKt('pemis'), pemisS, 'pemis 須逐位元不變(含 userIdUpdate／timeUpdate: 未寫入引用端)')
        })


        // ---------- 案例 3: 三種拒絕(後台入口; DupGroup 見 B 區) ----------

        it('API-RC-030 renameCascadeNameInUse(後台): 新名為仍被啟用中引用之懸空名 → 回語系鍵、四表逐位元不變、srLog 有 reason 且不含引用端 id／email／name; 停用之懸空引用與「新增同名」不擋(S4)', async function() {
            const SEC = { id: 'id-rc-secret-ghost', name: 'rcSecretGhostName', email: 'rc-secret-ghost@rc.example.com' }
            await mustEdit('users', (rows) => [...rows, uRow(SEC.id, SEC.name, { '幽靈群組': ON('OR') }, { email: SEC.email })])
            let s0 = await snap4()
            let t0 = Date.now()
            let r = await edit('grups', (rows) => rows.map((g) => (g.name === G.m3 ? { ...g, name: '幽靈群組' } : g)))
            A.equal(r.ok, false, `應被拒，實得: ${JSON.stringify(r)}`)
            A.equal(r.msg, 'renameCascadeNameInUse', `應回語系鍵 renameCascadeNameInUse，實得: ${r.msg}`)
            checkLangKey('renameCascadeNameInUse')
            A.deepEqual(await snap4(), s0, '被拒時四表須逐位元不變')
            let lines = await waitLines(t0, (l) => l.event === 'updateTabItems-refCascade-error' && l.msg === 'renameCascadeNameInUse', 'refCascade-error')
            checkNoSecrets(lines, [SEC.id, SEC.name, SEC.email], '030')

            //對照 1: 停用之懸空引用不擋(規則 3: 停用之懸空引用不擋)
            await restoreAllSafe()
            await mustEdit('users', (rows) => [...rows, uRow('id-rc-ghost-off', 'rcGhostOff', { '停用幽靈': OFF('OR') })])
            let r2 = await edit('grups', (rows) => rows.map((g) => (g.name === G.m3 ? { ...g, name: '停用幽靈' } : g)))
            A.ok(r2.ok, `停用之懸空引用不擋改名，實得: ${JSON.stringify(r2)}`)
            let john = JSON.parse((await rowsOf('users')).find((u) => u.id === 'id-for-john').cgrups)
            A.deepEqual(Object.keys(john), ['停用幽靈'], 'john 之 M3 引用已連帶改名')

            //對照 2: 新增同名撞懸空名不拒(規則 3: 外部先指派、後於後台定義同名群組為合法流程)
            await restoreAllSafe()
            await mustEdit('users', (rows) => [...rows, uRow('id-rc-ghost-new', 'rcGhostNew', { '幽靈群組': ON('OR') })])
            let usersS = await snapKt('users')
            let r3 = await edit('grups', (rows) => [...rows, gRow('id-rc-gnew', '幽靈群組', {})])
            A.ok(r3.ok, `新增同名群組不拒，實得: ${JSON.stringify(r3)}`)
            A.equal(await snapKt('users'), usersS, '新增(非改名／刪除)不改引用端')
        })

        it('API-RC-031 renameCascadeConflict(後台): 同一字串含舊名與一個停用之同名懸空項 → 回語系鍵、四表逐位元不變、srLog 有 reason 且不含引用端值(S4)', async function() {
            const SEC = { id: 'id-rc-secret-conf', name: 'rcSecretConfName', email: 'rc-secret-conf@rc.example.com' }
            await mustEdit('users', (rows) => [...rows, uRow(SEC.id, SEC.name, { [G.m1]: ON('OR'), '停用懸空': OFF('OR') }, { email: SEC.email })])
            let s0 = await snap4()
            let t0 = Date.now()
            let r = await edit('grups', (rows) => rows.map((g) => (g.name === G.m1 ? { ...g, name: '停用懸空' } : g)))
            A.equal(r.ok, false, `應被拒，實得: ${JSON.stringify(r)}`)
            A.equal(r.msg, 'renameCascadeConflict', `應回語系鍵 renameCascadeConflict，實得: ${r.msg}`)
            checkLangKey('renameCascadeConflict')
            A.deepEqual(await snap4(), s0, '被拒時四表須逐位元不變')
            let lines = await waitLines(t0, (l) => l.event === 'updateTabItems-refCascade-error' && l.msg === 'renameCascadeConflict', 'refCascade-error')
            checkNoSecrets(lines, [SEC.id, SEC.name, SEC.email], '031')
        })


        it('API-RC-036 權限同形(updatePemis): renameCascadeNameInUse／renameCascadeConflict 對 grups.cpemis 亦拒、四表逐位元不變、srLog 有 reason 且不含引用端 id／name; saveCascadePartial 語系鍵有 eng／cht(S4)', async function() {
            checkLangKey('saveCascadePartial')
            const SEC1 = { id: 'id-rc-secret-g1', name: 'rcSecretGrupName1' }
            const SEC2 = { id: 'id-rc-secret-g2', name: 'rcSecretGrupName2' }
            await mustEdit('grups', (rows) => [...rows,
                gRow(SEC1.id, SEC1.name, { '幽靈權限': ON('OR') }), //啟用中之懸空引用
                gRow(SEC2.id, SEC2.name, { [P.p1]: ON('OR'), '停用懸空權限': OFF('OR') }), //含舊名與停用之懸空同名項
            ])
            let cases = [
                { label: 'NameInUse', mut: (rows) => rows.map((p) => (p.name === P.p3 ? { ...p, name: '幽靈權限' } : p)), key: 'renameCascadeNameInUse' },
                { label: 'Conflict', mut: (rows) => rows.map((p) => (p.name === P.p1 ? { ...p, name: '停用懸空權限' } : p)), key: 'renameCascadeConflict' },
            ]
            for (let c of cases) {
                let s0 = await snap4()
                let t0 = Date.now()
                let r = await edit('pemis', c.mut)
                A.equal(r.ok, false, `${c.label} 應被拒，實得: ${JSON.stringify(r)}`)
                A.equal(r.msg, c.key, `${c.label} 應回語系鍵 ${c.key}，實得: ${r.msg}`)
                A.deepEqual(await snap4(), s0, `${c.label} 被拒時四表須逐位元不變`)
                let lines = await waitLines(t0, (l) => l.event === 'updateTabItems-refCascade-error' && l.keyTable === 'pemis' && l.msg === c.key, `${c.label} reason`)
                checkNoSecrets(lines, [SEC1.id, SEC1.name, SEC2.id, SEC2.name], `036 ${c.label}`)
            }
        })


        // ---------- 案例 4: 外部同步(同一 from 內) ----------

        //setupSync: appRC 群組 x1～x3(帶 id)、appRC 使用者 xu1(物件: OR x1＋AND x2)與 xu2(陣列: OR x1＋AND x3)、後台使用者 bu(OR x1)
        let setupSync = async () => {
            await mustSync('grups', { from: 'appRC', rows: [
                { id: 'id-rc-x1', order: 0, name: 'rcX1', description: 'x1', cpemis: JSON.stringify({ [P.p1]: ON('OR') }) },
                { id: 'id-rc-x2', order: 1, name: 'rcX2', description: 'x2', cpemis: JSON.stringify({ [P.p2]: ON('OR') }) },
                { id: 'id-rc-x3', order: 2, name: 'rcX3', description: 'x3', cpemis: JSON.stringify({ [P.p3]: ON('OR') }) },
            ] })
            await mustSync('users', { from: 'appRC', rows: [
                { id: 'id-rc-xu1', order: 0, name: 'rcXu1', email: 'rc-xu1@rc.example.com', cgrups: JSON.stringify({ rcX1: ON('OR'), rcX2: ON('AND') }), isAdmin: 'n', isActive: 'y' },
                { id: 'id-rc-xu2', order: 1, name: 'rcXu2', email: 'rc-xu2@rc.example.com', cgrups: JSON.stringify([{ name: 'rcX1', mode: 'OR', isActive: 'y' }, { name: 'rcX3', mode: 'AND', isActive: 'y' }]), isAdmin: 'n', isActive: 'y' },
            ] })
            await mustEdit('users', (rows) => [...rows, uRow('id-rc-bu', 'rcBu', { rcX1: ON('OR') })])
        }
        let xGrup = (n, name, o = {}) => ({ id: `id-rc-x${n}`, order: n - 1, name: name || `rcX${n}`, description: `x${n}`, cpemis: JSON.stringify({ [P[`p${n}`]]: ON('OR') }), ...o })

        it('API-RC-040 外部同步同 id 改名: 引用端(他 from 外部列、同 from 外部列、後台列)之 cgrups 連帶改寫、授權不變、後台 from 之群組列不動(S5a、S1、S2)', async function() {
            await setupSync()
            let usersB = await rowsOf('users')
            let grupsBase = (await rowsOf('grups')).filter((g) => g.from !== 'appRC')
            let permB = await permAll()
            let t0 = Date.now()
            let res = await postSync('grups', { from: 'appRC', rows: [xGrup(1, 'rcX1new'), xGrup(2), xGrup(3)] })
            A.equal(res.state, 'success', `同步應成功，實得: ${JSON.stringify(res)}`)
            let lines = await waitLines(t0, (l) => l.event === 'refCascade-done' && l.keyTable === 'grups', 'refCascade-done')
            let done = lines.find((l) => l.event === 'refCascade-done' && l.keyTable === 'grups')
            A.deepEqual({ holder: done.holder, nRename: done.nRename, nDelName: done.nDelName, nHolders: done.nHolders, nRenameHolders: done.nRenameHolders, nDelHolders: done.nDelHolders, nExternal: done.nExternal, userId: done.userId }, { holder: 'users', nRename: 1, nDelName: 0, nHolders: 3, nRenameHolders: 3, nDelHolders: 0, nExternal: 2, userId: ID_APP }, `同步路徑 refCascade-done 計數與操作者(實得 ${done._raw})`)
            let usersA = await rowsOf('users')
            let hit = checkHolders({ label: '同步改名', before: usersB, after: usersA, field: 'cgrups', ren: new Map([['rcX1', 'rcX1new']]) })
            A.deepEqual(hit, ['id-rc-bu', 'id-rc-xu1', 'id-rc-xu2'], '被改寫者恰為引用 rcX1 之 xu1、xu2(同 from 外部列)與 bu(後台列)')
            A.ok(Array.isArray(JSON.parse(usersA.find((u) => u.id === 'id-rc-xu2').cgrups)), 'xu2 之陣列形式仍為陣列')
            A.deepEqual((await rowsOf('grups')).filter((g) => g.from !== 'appRC').map((g) => omit(g, AUDIT)), grupsBase.map((g) => omit(g, AUDIT)), '非 appRC 分區之群組列不動')
            expectPermSame(permB, await permAll(), { ren: new Map([['rcX1', 'rcX1new']]), label: '同步改名' })
        })

        it('API-RC-041 外部同步某 id 不再推送: 該群組之引用被清理(含陣列形式 AND 項), 清理後授權等於「找不到即忽略」(S5b、S3)', async function() {
            await setupSync()
            await mustEdit('users', (rows) => [...rows, uRow('id-rc-xctl', 'rcXctl', { rcX1: ON('OR') })]) //對照: 僅 OR rcX1
            let usersB = await rowsOf('users')
            let permB = await permAll()
            let res = await postSync('grups', { from: 'appRC', rows: [xGrup(1), xGrup(2)] }) //x3 不再推送
            A.equal(res.state, 'success', `同步應成功，實得: ${JSON.stringify(res)}`)
            A.ok(!(await rowsOf('grups')).some((g) => g.name === 'rcX3'), 'x3 已隨 delAll 移除')
            let hit = checkHolders({ label: '同步刪除', before: usersB, after: await rowsOf('users'), field: 'cgrups', del: new Set(['rcX3']) })
            A.deepEqual(hit, ['id-rc-xu2'], '被清理者恰為引用 rcX3 之 xu2')
            let permA = await permAll()
            A.deepEqual(permA['id-rc-xu2'].rules, permA['id-rc-xctl'].rules, 'xu2(OR x1＋AND x3)清理後等於僅 OR x1 之對照使用者')
            A.ok(permA['id-rc-xu2'].nY >= permB['id-rc-xu2'].nY, 'AND 引用移除後授權不收窄')
        })

        it('API-RC-042 外部同步未帶 id 之列、名稱不變重推(連推 3 次): 引用不被清理、引用端全列逐位元不變(含更新者)、授權不變; 每次 ORM 補之隨機主鍵雖變(S5c)', async function() {
            const F = 'appRC-n'
            let rowsN = () => [{ order: 0, name: 'rcN1', description: 'n1', cpemis: JSON.stringify({ [P.p1]: ON('OR') }) }, { order: 1, name: 'rcN2', description: 'n2', cpemis: JSON.stringify({ [P.p2]: ON('OR') }) }]
            await mustSync('grups', { from: F, rows: rowsN() })
            await mustEdit('users', (rows) => [...rows, uRow('id-rc-nu', 'rcNu', { rcN1: ON('OR'), rcN2: ON('AND') })])
            let usersS = await snapKt('users')
            let permB = await permAll()
            let idsPrev = (await rowsOf('grups')).filter((g) => g.from === F).map((g) => g.id)
            A.equal(idsPrev.length, 2, '前置: 兩個未帶 id 之群組已寫入')
            for (let i = 0; i < 3; i++) {
                let res = await postSync('grups', { from: F, rows: rowsN() })
                A.equal(res.state, 'success', `第 ${i + 1} 次重推應成功，實得: ${JSON.stringify(res)}`)
                let now = (await rowsOf('grups')).filter((g) => g.from === F)
                A.deepEqual(now.map((g) => g.name).sort(), ['rcN1', 'rcN2'], '名稱不變')
                A.ok(now.every((g) => !idsPrev.includes(g.id)), `第 ${i + 1} 次重推後群組之主鍵雖變(未帶 id 由 ORM 補隨機主鍵)，前次 ${JSON.stringify(idsPrev)}，本次 ${JSON.stringify(now.map((g) => g.id))}`)
                idsPrev = now.map((g) => g.id)
                A.equal(await snapKt('users'), usersS, `第 ${i + 1} 次重推後 users 須逐位元不變(引用不被清理、不被改寫)`)
            }
            expectPermSame(permB, await permAll(), { label: '未帶 id 重推' })
        })

        it('API-RC-043 外部同步未帶 id 且改名(已知限制②): 視為刪舊增新, 舊名引用被清理、新名之列不繼承(斷言之)', async function() {
            const F = 'appRC-n'
            await mustSync('grups', { from: F, rows: [{ order: 0, name: 'rcN1', cpemis: JSON.stringify({ [P.p1]: ON('OR') }) }, { order: 1, name: 'rcN2', cpemis: JSON.stringify({ [P.p2]: ON('OR') }) }] })
            await mustEdit('users', (rows) => [...rows, uRow('id-rc-nu', 'rcNu', { rcN1: ON('OR'), rcN2: ON('AND') })])
            let usersB = await rowsOf('users')
            let res = await postSync('grups', { from: F, rows: [{ order: 0, name: 'rcN1renamed', cpemis: JSON.stringify({ [P.p1]: ON('OR') }) }, { order: 1, name: 'rcN2', cpemis: JSON.stringify({ [P.p2]: ON('OR') }) }] })
            A.equal(res.state, 'success', `同步應成功，實得: ${JSON.stringify(res)}`)
            let usersA = await rowsOf('users')
            let hit = checkHolders({ label: '未帶 id 改名', before: usersB, after: usersA, field: 'cgrups', del: new Set(['rcN1']) })
            A.deepEqual(hit, ['id-rc-nu'], '僅 nu 被清理')
            A.deepEqual(JSON.parse(usersA.find((u) => u.id === 'id-rc-nu').cgrups), { rcN2: ON('AND') }, '舊名 rcN1 之引用被清除, 新名 rcN1renamed 不繼承, rcN2 不動')
            A.ok((await rowsOf('grups')).some((g) => g.name === 'rcN1renamed'), '新名稱之群組存在')
        })

        it('API-RC-044 外部同步被拒(NameInUse／Conflict): 回固定鍵 invalidRows、四表逐位元不變、srLog 之 reason 為對應鍵且不含引用端值(S4、S5e)', async function() {
            await setupSync()
            const SEC1 = { id: 'id-rc-secret-s1', name: 'rcSecretS1Name', email: 'rc-secret-s1@rc.example.com' }
            const SEC2 = { id: 'id-rc-secret-s2', name: 'rcSecretS2Name', email: 'rc-secret-s2@rc.example.com' }
            await mustEdit('users', (rows) => [...rows,
                uRow(SEC1.id, SEC1.name, { rcGhostS: ON('OR') }, { email: SEC1.email }), //啟用中之懸空引用
                uRow(SEC2.id, SEC2.name, { rcX1: ON('OR'), rcOffS: OFF('OR') }, { email: SEC2.email }), //含舊名與停用之懸空同名項
            ])
            let cases = [
                { label: 'NameInUse', rows: [xGrup(1), xGrup(2, 'rcGhostS'), xGrup(3)], reason: 'renameCascadeNameInUse' },
                { label: 'Conflict', rows: [xGrup(1, 'rcOffS'), xGrup(2), xGrup(3)], reason: 'renameCascadeConflict' },
            ]
            for (let c of cases) {
                let s0 = await snap4()
                let t0 = Date.now()
                let res = await postSync('grups', { from: 'appRC', rows: c.rows })
                A.equal(res.state, 'error', `${c.label} 應被拒，實得: ${JSON.stringify(res)}`)
                A.equal(res.msg, 'invalidRows', `${c.label} 外部應用只收固定鍵 invalidRows，實得: ${JSON.stringify(res.msg)}`)
                A.deepEqual(await snap4(), s0, `${c.label} 被拒時四表須逐位元不變`)
                let lines = await waitLines(t0, (l) => l.event === 'syncAndReplaceTabs-error' && l.reason === c.reason, `${c.label} reason`)
                checkNoSecrets(lines, [SEC1.id, SEC1.name, SEC1.email, SEC2.id, SEC2.name, SEC2.email], `044 ${c.label}`)
            }
        })

        it('API-RC-045 外部同步 pemis: 同 id 改名連帶改寫 grups.cpemis(授權不變); 舊 id 不再推送則清理(授權等於對照; S5f)', async function() {
            await mustSync('pemis', { from: 'appRC', rows: [
                { id: 'id-rc-px1', order: 0, name: 'rcPx1', description: 'px1', crules: JSON.stringify({ '專案A/頁A/區塊A': 'y', '專案A/頁C': 'y' }) },
                { id: 'id-rc-px2', order: 1, name: 'rcPx2', description: 'px2', crules: JSON.stringify({ '專案B/頁A/區塊B': 'y', '專案A/頁C': 'n' }) },
            ] })
            await mustEdit('grups', (rows) => [...rows, gRow('id-rc-gx', 'rc-gx', { rcPx1: ON('OR'), rcPx2: ON('AND') }), gRow('id-rc-gxc', 'rc-gxc', { rcPx1: ON('OR') })])
            await mustEdit('users', (rows) => [...rows, uRow('id-rc-ux', 'rcUx', { 'rc-gx': ON('OR') }), uRow('id-rc-uxc', 'rcUxc', { 'rc-gxc': ON('OR') })])
            let pxRows = (n1) => [
                { id: 'id-rc-px1', order: 0, name: n1, description: 'px1', crules: JSON.stringify({ '專案A/頁A/區塊A': 'y', '專案A/頁C': 'y' }) },
                { id: 'id-rc-px2', order: 1, name: 'rcPx2', description: 'px2', crules: JSON.stringify({ '專案B/頁A/區塊B': 'y', '專案A/頁C': 'n' }) },
            ]

            //(1) 同 id 改名
            let grupsB = await rowsOf('grups')
            let permB = await permAll()
            let res1 = await postSync('pemis', { from: 'appRC', rows: pxRows('rcPx1new') })
            A.equal(res1.state, 'success', `同步改名應成功，實得: ${JSON.stringify(res1)}`)
            let hit1 = checkHolders({ label: 'pemis 同步改名', before: grupsB, after: await rowsOf('grups'), field: 'cpemis', ren: new Map([['rcPx1', 'rcPx1new']]) })
            A.deepEqual(hit1, ['id-rc-gx', 'id-rc-gxc'], '被改寫者恰為引用 rcPx1 之兩個群組')
            expectPermSame(permB, await permAll(), { label: 'pemis 同步改名' })

            //(2) px2 不再推送
            let grupsB2 = await rowsOf('grups')
            let res2 = await postSync('pemis', { from: 'appRC', rows: [pxRows('rcPx1new')[0]] })
            A.equal(res2.state, 'success', `同步(少一個)應成功，實得: ${JSON.stringify(res2)}`)
            let hit2 = checkHolders({ label: 'pemis 同步刪除', before: grupsB2, after: await rowsOf('grups'), field: 'cpemis', del: new Set(['rcPx2']) })
            A.deepEqual(hit2, ['id-rc-gx'], '被清理者恰為引用 rcPx2 之 gx')
            let permA = await permAll()
            A.deepEqual(permA['id-rc-ux'].rules, permA['id-rc-uxc'].rules, 'ux(gx: OR px1＋AND px2)清理後等於僅 OR px1 之對照使用者')
        })

        it('API-RC-046 外部同步 targets: 舊 id 不再推送則 pemis.crules 清理該標的; 改 id 視為刪舊增新(舊 id 引用被清、新 id 不繼承; S5f、階段 1 已知限制①)', async function() {
            const [TA, TB, TC, TD] = ['專案RC/頁1/區塊A', '專案RC/頁1/區塊B', '專案RC/頁1/區塊C', '專案RC/頁1/區塊D']
            await mustSync('targets', { from: 'appRC', rows: [{ id: TA, order: 0, description: 'a' }, { id: TB, order: 1, description: 'b' }, { id: TC, order: 2, description: 'c' }] })
            await mustEdit('pemis', (rows) => [...rows, pRow('id-rc-pt', 'rc-pt', { [TA]: 'y', [TB]: 'y', [TC]: 'n' })])
            await mustEdit('grups', (rows) => [...rows, gRow('id-rc-gt', 'rc-gt', { 'rc-pt': ON('OR') })])
            await mustEdit('users', (rows) => [...rows, uRow('id-rc-ut', 'rcUt', { 'rc-gt': ON('OR') })])

            //(1) B 不再推送
            let pemisB = await rowsOf('pemis')
            let res1 = await postSync('targets', { from: 'appRC', rows: [{ id: TA, order: 0, description: 'a' }, { id: TC, order: 2, description: 'c' }] })
            A.equal(res1.state, 'success', `同步應成功，實得: ${JSON.stringify(res1)}`)
            let hit1 = checkHolders({ label: 'targets 同步刪除', before: pemisB, after: await rowsOf('pemis'), field: 'crules', del: new Set([TB]) })
            A.deepEqual(hit1, ['id-rc-pt'], '被清理者僅 rc-pt')

            //(2) C 改為 D(改 id＝刪舊增新)
            let pemisB2 = await rowsOf('pemis')
            let res2 = await postSync('targets', { from: 'appRC', rows: [{ id: TA, order: 0, description: 'a' }, { id: TD, order: 2, description: 'd' }] })
            A.equal(res2.state, 'success', `同步應成功，實得: ${JSON.stringify(res2)}`)
            let pemisA2 = await rowsOf('pemis')
            let hit2 = checkHolders({ label: 'targets 同步改 id', before: pemisB2, after: pemisA2, field: 'crules', del: new Set([TC]) })
            A.deepEqual(hit2, ['id-rc-pt'], '舊 id C 之引用被清理')
            A.deepEqual(JSON.parse(pemisA2.find((p) => p.id === 'id-rc-pt').crules), { [TA]: 'y' }, 'rc-pt 僅剩 A; 新 id D 不繼承 C 之引用')
            A.equal((await permOf('id-rc-ut')).rules.find((x) => x.name === TD).isActive, 'n', '新 id D 對該使用者為 n(不繼承)')
        })


        // ---------- 案例 6: 無關寫入零連帶 ----------

        it('API-RC-060 只改說明／調列序／新增列之 updateGrups: 不改 users 任何列(含 timeUpdate／userIdUpdate), pemis／targets 亦同(S7)', async function() {
            let s0 = await snap4()
            let r1 = await edit('grups', (rows) => rows.map((g) => (g.name === G.m1 ? { ...g, description: 'only-desc' } : g)))
            A.ok(r1.ok, `只改說明應成功，實得: ${JSON.stringify(r1)}`)
            let s1 = await snap4()
            A.equal(s1.users, s0.users, '只改說明: users 逐位元不變')
            A.equal(s1.pemis, s0.pemis, 'pemis 不變')
            A.equal(s1.targets, s0.targets, 'targets 不變')
            A.notEqual(s1.grups, s0.grups, '前提: grups 本身確實被寫入')
            let r2 = await edit('grups', (rows) => rows.reverse())
            A.ok(r2.ok, `調列序應成功，實得: ${JSON.stringify(r2)}`)
            A.equal((await snap4()).users, s0.users, '調列序: users 逐位元不變')
            let r3 = await edit('grups', (rows) => [...rows, gRow('id-rc-g-add', 'rc-g-add', {})])
            A.ok(r3.ok, `新增列應成功，實得: ${JSON.stringify(r3)}`)
            A.equal((await snap4()).users, s0.users, '新增列: users 逐位元不變')
        })

        it('API-RC-061 只改說明／新增列之 updatePemis 與 updateTargets: 不改 grups、users(pemis 不改 grups; targets 不改 pemis; S7)', async function() {
            let s0 = await snap4()
            let r1 = await edit('pemis', (rows) => [...rows.map((p) => (p.name === P.p1 ? { ...p, description: 'only-desc' } : p)), pRow('id-rc-p-add', 'rc-p-add', {})])
            A.ok(r1.ok, `updatePemis 應成功，實得: ${JSON.stringify(r1)}`)
            let s1 = await snap4()
            A.equal(s1.grups, s0.grups, 'grups 逐位元不變')
            A.equal(s1.users, s0.users, 'users 逐位元不變')
            let r2 = await edit('targets', (rows) => [...rows.map((t, k) => (k === 0 ? { ...t, description: 'only-desc' } : t)), tRow('專案RC/新增')])
            A.ok(r2.ok, `updateTargets 應成功，實得: ${JSON.stringify(r2)}`)
            let s2 = await snap4()
            A.equal(s2.pemis, s1.pemis, 'pemis 逐位元不變')
            A.equal(s2.grups, s1.grups, 'grups 逐位元不變')
        })

        it('API-RC-062 外部同步同 id 同名只改說明: 不改 users(含更新者欄位)(S7)', async function() {
            await setupSync()
            let usersS = await snapKt('users')
            let res = await postSync('grups', { from: 'appRC', rows: [xGrup(1, 'rcX1', { description: 'x1-edited' }), xGrup(2), xGrup(3)] })
            A.equal(res.state, 'success', `同步應成功，實得: ${JSON.stringify(res)}`)
            A.equal((await rowsOf('grups')).find((g) => g.id === 'id-rc-x1').description, 'x1-edited', '前提: 同步已落地')
            A.equal(await snapKt('users'), usersS, 'users 逐位元不變')
        })


        // ---------- 案例 8: 更新者 ----------

        it('API-RC-080 後台(admin)改名連帶改寫之引用端列: userIdUpdate 記為 id-for-admin、timeUpdate 前進、其餘欄位不變; 未改寫列之更新者不動(S9)', async function() {
            await mustSync('users', { from: 'appRC', rows: [{ id: 'id-rc-xa', order: 0, name: 'rcXa', email: 'rc-xa@rc.example.com', cgrups: JSON.stringify({ [G.m1]: ON('OR') }), isAdmin: 'n', isActive: 'y' }] })
            let usersB = await rowsOf('users')
            let xaB = usersB.find((u) => u.id === 'id-rc-xa')
            A.notEqual(xaB.userIdUpdate, ID_ADMIN, `前提: 外部列之更新者不是 admin(實得 ${xaB.userIdUpdate}), 否則無法區分`)
            const NEW = '權限群組M1更新者'
            let r = await edit('grups', (rows) => rows.map((g) => (g.name === G.m1 ? { ...g, name: NEW } : g)))
            A.ok(r.ok, `改名應成功，實得: ${JSON.stringify(r)}`)
            let usersA = await rowsOf('users')
            let hit = checkHolders({ label: '更新者', before: usersB, after: usersA, field: 'cgrups', ren: new Map([[G.m1, NEW]]) })
            A.deepEqual(hit, ['id-for-peter', 'id-rc-xa'], '被改寫者為 peter 與 xa')
            for (let id of hit) {
                let b = usersB.find((u) => u.id === id)
                let a = usersA.find((u) => u.id === id)
                A.equal(a.userIdUpdate, ID_ADMIN, `${id} 之 userIdUpdate 須記為操作者 admin`)
                A.ok(String(a.timeUpdate) > String(b.timeUpdate), `${id} 之 timeUpdate 須前進(前 ${b.timeUpdate}／後 ${a.timeUpdate})`)
                A.equal(a.userId, b.userId, `${id} 之建立者不變`)
                A.equal(a.timeCreate, b.timeCreate, `${id} 之建立時間不變`)
            }
        })

        it('API-RC-081 外部同步(application)改名連帶改寫之後台引用端列: userIdUpdate 記為 id-for-application、timeUpdate 前進、其餘欄位不變(S9)', async function() {
            await setupSync()
            let usersB = await rowsOf('users')
            let buB = usersB.find((u) => u.id === 'id-rc-bu')
            A.notEqual(buB.userIdUpdate, ID_APP, `前提: 後台列之更新者不是 application(實得 ${buB.userIdUpdate})`)
            let res = await postSync('grups', { from: 'appRC', rows: [xGrup(1, 'rcX1upd'), xGrup(2), xGrup(3)] })
            A.equal(res.state, 'success', `同步應成功，實得: ${JSON.stringify(res)}`)
            let usersA = await rowsOf('users')
            let hit = checkHolders({ label: '同步更新者', before: usersB, after: usersA, field: 'cgrups', ren: new Map([['rcX1', 'rcX1upd']]) })
            A.ok(hit.includes('id-rc-bu'), 'bu 被改寫')
            let buA = usersA.find((u) => u.id === 'id-rc-bu')
            A.equal(buA.userIdUpdate, ID_APP, 'bu 之 userIdUpdate 須記為操作者 application')
            A.ok(String(buA.timeUpdate) > String(buB.timeUpdate), `bu 之 timeUpdate 須前進(前 ${buB.timeUpdate}／後 ${buA.timeUpdate})`)
        })


        // ---------- 案例 7: 併發不死結 ----------

        //五個寫入者以「各自之最終意圖」組 payload(整表寫入之快照過期問題: 以「所有寫入完成後之終態」為各自 payload, 使任一取鎖順序之終態相同):
        //  刪除方向(清理引用)之 payload 預先帶清理後之值, 兩種順序皆收斂; 改名方向之引用端表不與另一個整表寫入者並行(改名對引用端之寫入與「引用端表整表寫入」之快照過期為應用層競態, 非鎖之責任)
        let settleWithin = async (ps, ms, label) => {
            let timer = null
            let tout = new Promise((resolve, reject) => {
                timer = setTimeout(() => reject(new Error(`${label}: ${ms} ms 內未全數完成(疑似死結)`)), ms)
            })
            try {
                return await Promise.race([Promise.allSettled(ps), tout])
            }
            finally {
                clearTimeout(timer)
            }
        }
        let okOf = (st) => st.status === 'fulfilled' && (st.value.ok === true || st.value.state === 'success')
        //writeFresh(run07, F-23／F-26): 後台整表寫入須原樣帶回外部列(外部列之內容後台不得改, 不得新增／刪除); 外部同步並行時, 後台所持外部列快照可能已過期(該列被同步改名／刪除)而被拒
        //  (saveExternalRowChanged／saveFromNotAllowed／saveStale／saveBaselineRequired)——此為過期快照之正確處置, 後台應重新載入再送。故以 build(最新列) 建 payload, 遇上述拒絕即重讀重送(至多 8 次), 回傳最終結果與嘗試次數。
        //  原 070／071 之設計「GW 之 payload 帶 SW 之終態(sx1→sx1b、刪 sx2)、兩者謀同一終態」自 run07 起不可行(後台不得改／刪外部列), 改為: 外部列之改名／刪除只由同步寫入者(SW)執行, GW 只改後台列且重讀重送; 終態斷言不變
        let STALE_KEYS = new Set(['saveExternalRowChanged', 'saveFromNotAllowed', 'saveStale', 'saveBaselineRequired'])
        let writeFresh = async (kt, build) => {
            let r = null
            for (let i = 1; i <= 8; i++) {
                r = await write(kt, build((await rowsOf(kt)).map(clone)))
                if (r.ok || !STALE_KEYS.has(r.msg)) {
                    return { ...r, tries: i }
                }
            }
            return { ...r, tries: 8 }
        }
        let rotate = (arr, k) => [...arr.slice(k % arr.length), ...arr.slice(0, k % arr.length)]
        let checkIntegrity = async (label) => {
            let dg = await danglingOf()
            A.deepEqual(dg, [], `${label} 引用端與主體不得有懸空引用，實得 ${JSON.stringify(dg)}`)
            for (let kt of ['grups', 'pemis']) {
                let names = (await selectAll(kt)).map((r) => r.name)
                A.equal(new Set(names).size, names.length, `${label} ${kt} 名稱不得重複`)
            }
            let t = await withTimeout(callRpc('users.select', [], TOKEN_ADMIN), 15000, 'users.select')
            A.ok(t.ok, `${label} 並行後後端仍可服務，實得 ${JSON.stringify(t).slice(0, 200)}`)
        }

        it('API-RC-070 並行五寫入者(updateGrups 含改名＋刪除、updateUsers、updatePemis 含刪除＋改名、updateTargets 含刪除、syncAndReplaceTabs grups 含改名＋刪除)×3 輪、輪輪不同啟動次序: 30 秒內全數完成、全部成功、終態無懸空且無遺失更新(S8)', async function() {
            this.timeout(300000)
            for (let r = 1; r <= 3; r++) {
                const p = `rcA${r}`
                const [tD, tK] = [`專案RC/${p}/D`, `專案RC/${p}/K`]
                const [pT, pD, pU, pU2] = [`${p}-pT`, `${p}-pD`, `${p}-pU`, `${p}-pU2`]
                const [gP, gD, gU, gU2] = [`${p}-gP`, `${p}-gD`, `${p}-gU`, `${p}-gU2`]
                const [sx1, sx1b, sx2] = [`${p}-sx1`, `${p}-sx1b`, `${p}-sx2`]
                const fromS = `appRCa${r}`
                const [uGid, uNid] = [`id-${p}-uG`, `id-${p}-uN`]
                //預置(循序): 鏈 tD→pT→gP／gD→uG, pD→gP; 無人引用之 pU／gU／sx1／sx2(其改名／刪除仍會取引用端表鎖)
                await mustEdit('targets', (rows) => [...rows, tRow(tD), tRow(tK)])
                await mustEdit('pemis', (rows) => [...rows, pRow(`id-${pT}`, pT, { [tD]: 'y', [tK]: 'y' }), pRow(`id-${pD}`, pD, { [tK]: 'y' }), pRow(`id-${pU}`, pU, {})])
                await mustEdit('grups', (rows) => [...rows, gRow(`id-${gP}`, gP, { [pD]: ON('OR'), [pT]: ON('OR') }), gRow(`id-${gD}`, gD, { [pT]: ON('OR') }), gRow(`id-${gU}`, gU, {})])
                await mustEdit('users', (rows) => [...rows, uRow(uGid, `${p}uG`, { [gD]: ON('OR'), [gP]: ON('OR') })])
                await mustSync('grups', { from: fromS, rows: [gRow(`id-${sx1}`, sx1, {}), gRow(`id-${sx2}`, sx2, {})] })

                //終態 payload
                let [T, Pm, U] = [await rowsOf('targets'), await rowsOf('pemis'), await rowsOf('users')]
                let payT = T.filter((t) => t.id !== tD)
                let payP = Pm.filter((x) => x.name !== pD).map((x) => (x.name === pT ? { ...x, crules: JSON.stringify({ [tK]: 'y' }) } : (x.name === pU ? { ...x, name: pU2 } : x)))
                //run07(F-23): GW 只改後台列(刪 gD、gU→gU2、gP 之 cpemis), 外部列 sx1／sx2 原樣帶回(其改名／刪除由 SW 執行; 原 payload 曾含 sx2 之刪除與 sx1→sx1b), 並以 writeFresh 重讀重送
                let buildG = (rows) => rows.filter((g) => g.name !== gD).map((g) => (g.name === gP ? { ...g, cpemis: JSON.stringify({ [pT]: ON('OR') }) } : (g.name === gU ? { ...g, name: gU2 } : g)))
                let payU = [...U.map((u) => (u.id === uGid ? { ...u, cgrups: JSON.stringify({ [gP]: ON('OR') }), description: 'edited-by-UW' } : u)), uRow(uNid, `${p}uN`, { [gP]: ON('OR') })]
                let swBody = { from: fromS, rows: [gRow(`id-${sx1}`, sx1b, {})] }
                let jobs = [
                    () => write('targets', payT),
                    () => write('pemis', payP),
                    () => writeFresh('grups', buildG),
                    () => write('users', payU),
                    () => postSync('grups', swBody),
                ]
                let t0 = Date.now()
                let rs = await settleWithin(rotate(jobs, r).map((j) => j()), 30000, `第 ${r} 輪`)
                A.ok(Date.now() - t0 < 30000, '整體須於 30 秒內完成')
                rs.forEach((st, k) => A.ok(okOf(st), `第 ${r} 輪第 ${k} 個寫入者應成功，實得: ${JSON.stringify(st)}`))

                //終態(無遺失更新: 各寫入者之意圖皆在; 無懸空)
                let [T1, P1, G1, U1] = [await rowsOf('targets'), await rowsOf('pemis'), await rowsOf('grups'), await rowsOf('users')]
                A.ok(!T1.some((t) => t.id === tD) && T1.some((t) => t.id === tK), `第 ${r} 輪 TW: tD 已刪、tK 仍在`)
                A.deepEqual(JSON.parse(P1.find((x) => x.name === pT).crules), { [tK]: 'y' }, `第 ${r} 輪 pT 之 crules 僅剩 tK`)
                A.ok(!P1.some((x) => x.name === pD) && P1.some((x) => x.name === pU2) && !P1.some((x) => x.name === pU), `第 ${r} 輪 PW: pD 已刪、pU→pU2`)
                A.deepEqual(JSON.parse(G1.find((g) => g.name === gP).cpemis), { [pT]: ON('OR') }, `第 ${r} 輪 gP 之 cpemis 僅剩 pT`)
                A.ok(!G1.some((g) => g.name === gD) && G1.some((g) => g.name === gU2) && !G1.some((g) => g.name === gU), `第 ${r} 輪 GW: gD 已刪、gU→gU2`)
                A.deepEqual(G1.filter((g) => g.from === fromS).map((g) => g.name), [sx1b], `第 ${r} 輪 SW: 分區僅剩 sx1b`)
                let uG = U1.find((u) => u.id === uGid)
                A.deepEqual(JSON.parse(uG.cgrups), { [gP]: ON('OR') }, `第 ${r} 輪 uG 之 cgrups 僅剩 gP`)
                A.equal(uG.description, 'edited-by-UW', `第 ${r} 輪 UW 之編修未遺失`)
                A.ok(U1.some((u) => u.id === uNid), `第 ${r} 輪 UW 之新增使用者存在`)
                await checkIntegrity(`第 ${r} 輪`)
            }
        })

        it('API-RC-071 並行改名級聯(updateGrups 改名＋同步 grups 改名, 皆連帶改寫 users)∥ updatePemis 刪除 ∥ updateTargets 刪除 ×3 輪: 全部成功、users 之物件／陣列引用皆為新名、授權不變、無懸空(S8、S1、S2)', async function() {
            this.timeout(300000)
            for (let r = 1; r <= 3; r++) {
                const p = `rcB${r}`
                const [tD, tK] = [`專案RC/${p}/D`, `專案RC/${p}/K`]
                const [pT, pD] = [`${p}-pT`, `${p}-pD`]
                const [gP, gR, gR2, sx1, sx1b] = [`${p}-gP`, `${p}-gR`, `${p}-gR2`, `${p}-sx1`, `${p}-sx1b`]
                const fromS = `appRCb${r}`
                await mustEdit('targets', (rows) => [...rows, tRow(tD), tRow(tK)])
                await mustEdit('pemis', (rows) => [...rows, pRow(`id-${pT}`, pT, { [tD]: 'y', [tK]: 'y' }), pRow(`id-${pD}`, pD, { [tK]: 'y' })])
                await mustEdit('grups', (rows) => [...rows, gRow(`id-${gP}`, gP, { [pD]: ON('OR'), [pT]: ON('OR') }), gRow(`id-${gR}`, gR, { [pT]: ON('OR') })])
                await mustSync('grups', { from: fromS, rows: [gRow(`id-${sx1}`, sx1, { [pT]: ON('OR') })] })
                await mustEdit('users', (rows) => [...rows,
                    uRow(`id-${p}-uA`, `${p}uA`, { [gR]: ON('OR'), [sx1]: ON('AND') }),
                    uRow(`id-${p}-uB`, `${p}uB`, [{ name: gR, mode: 'OR', isActive: 'y' }, { name: sx1, mode: 'OR', isActive: 'y' }]),
                    uRow(`id-${p}-uC`, `${p}uC`, { [gP]: ON('OR') }),
                ])
                let permB = await permAll()
                let usersB = await rowsOf('users')

                let [T, Pm] = [await rowsOf('targets'), await rowsOf('pemis')]
                let payT = T.filter((t) => t.id !== tD)
                let payP = Pm.filter((x) => x.name !== pD).map((x) => (x.name === pT ? { ...x, crules: JSON.stringify({ [tK]: 'y' }) } : x))
                //run07(F-23): GW 只改後台列(gR→gR2; gP 預先清掉 pD), 外部列 sx1 原樣帶回、其改名(sx1→sx1b)由 SW 執行(原 payload 曾帶 SW 之終態, 後台不得改外部列); 以 writeFresh 重讀重送
                let buildG = (rows) => rows.map((g) => (g.name === gP ? { ...g, cpemis: JSON.stringify({ [pT]: ON('OR') }) } : (g.name === gR ? { ...g, name: gR2 } : g)))
                let swBody = { from: fromS, rows: [gRow(`id-${sx1}`, sx1b, { [pT]: ON('OR') })] }
                let jobs = [
                    () => write('targets', payT),
                    () => write('pemis', payP),
                    () => writeFresh('grups', buildG),
                    () => postSync('grups', swBody),
                ]
                let rs = await settleWithin(rotate(jobs, r).map((j) => j()), 30000, `第 ${r} 輪`)
                rs.forEach((st, k) => A.ok(okOf(st), `第 ${r} 輪第 ${k} 個寫入者應成功，實得: ${JSON.stringify(st)}`))

                let usersA = await rowsOf('users')
                let ren = new Map([[gR, gR2], [sx1, sx1b]])
                let hit = checkHolders({ label: `第 ${r} 輪`, before: usersB, after: usersA, field: 'cgrups', ren })
                A.deepEqual(hit, [`id-${p}-uA`, `id-${p}-uB`], `第 ${r} 輪被改寫者恰為 uA、uB`)
                A.deepEqual(JSON.parse(usersA.find((u) => u.id === `id-${p}-uA`).cgrups), { [gR2]: ON('OR'), [sx1b]: ON('AND') }, `第 ${r} 輪 uA 之引用皆為新名`)
                let uB = JSON.parse(usersA.find((u) => u.id === `id-${p}-uB`).cgrups)
                A.ok(Array.isArray(uB) && uB[0].name === gR2 && uB[1].name === sx1b, `第 ${r} 輪 uB(陣列形式)之引用皆為新名`)
                let permA = await permAll()
                for (let id of [`id-${p}-uA`, `id-${p}-uB`]) {
                    A.deepEqual(permA[id].rules, permB[id].rules.filter((x) => x.name !== tD), `第 ${r} 輪 ${id} 授權除已刪標的外不變`)
                }
                await checkIntegrity(`第 ${r} 輪`)
            }
        })

        it('API-RC-072 並行 updatePemis 改名(連帶改寫 grups)∥ updateTargets 刪除(清理 pemis)∥ updateUsers ×3 輪: 全部成功、grups.cpemis 為新名、授權不變、無懸空(S8)', async function() {
            this.timeout(300000)
            for (let r = 1; r <= 3; r++) {
                const p = `rcC${r}`
                const [tD, tK] = [`專案RC/${p}/D`, `專案RC/${p}/K`]
                const [pT, pR, pR2, gQ] = [`${p}-pT`, `${p}-pR`, `${p}-pR2`, `${p}-gQ`]
                await mustEdit('targets', (rows) => [...rows, tRow(tD), tRow(tK)])
                await mustEdit('pemis', (rows) => [...rows, pRow(`id-${pT}`, pT, { [tD]: 'y', [tK]: 'y' }), pRow(`id-${pR}`, pR, { [tK]: 'y' })])
                await mustEdit('grups', (rows) => [...rows, gRow(`id-${gQ}`, gQ, { [pR]: ON('OR'), [pT]: ON('OR') })])
                await mustEdit('users', (rows) => [...rows, uRow(`id-${p}-uQ`, `${p}uQ`, { [gQ]: ON('OR') })])
                let permB = await permAll()
                let [T, Pm, U] = [await rowsOf('targets'), await rowsOf('pemis'), await rowsOf('users')]
                let payT = T.filter((t) => t.id !== tD)
                let payP = Pm.map((x) => (x.name === pT ? { ...x, crules: JSON.stringify({ [tK]: 'y' }) } : (x.name === pR ? { ...x, name: pR2 } : x)))
                let payU = [...U.map((u) => (u.id === `id-${p}-uQ` ? { ...u, description: 'edited-by-UW' } : u)), uRow(`id-${p}-uN`, `${p}uN`, { [gQ]: ON('OR') })]
                let jobs = [() => write('targets', payT), () => write('pemis', payP), () => write('users', payU)]
                let rs = await settleWithin(rotate(jobs, r).map((j) => j()), 30000, `第 ${r} 輪`)
                rs.forEach((st, k) => A.ok(okOf(st), `第 ${r} 輪第 ${k} 個寫入者應成功，實得: ${JSON.stringify(st)}`))
                let G1 = await rowsOf('grups')
                A.deepEqual(JSON.parse(G1.find((g) => g.name === gQ).cpemis), { [pR2]: ON('OR'), [pT]: ON('OR') }, `第 ${r} 輪 gQ 之 cpemis 引用為新名`)
                A.deepEqual(JSON.parse((await rowsOf('pemis')).find((x) => x.name === pT).crules), { [tK]: 'y' }, `第 ${r} 輪 pT 之 crules 已清理 tD`)
                let permA = await permAll()
                A.deepEqual(permA[`id-${p}-uQ`].rules, permB[`id-${p}-uQ`].rules.filter((x) => x.name !== tD), `第 ${r} 輪 uQ 授權除已刪標的外不變`)
                A.equal((await rowsOf('users')).find((u) => u.id === `id-${p}-uQ`).description, 'edited-by-UW', `第 ${r} 輪 UW 之編修未遺失`)
                await checkIntegrity(`第 ${r} 輪`)
            }
        })

        it('API-RC-073 後台持過期之外部列快照整表寫入(外部同步已改名／已刪除該外部列): 被拒(saveExternalRowChanged／saveFromNotAllowed)且四表逐位元不變(含同批後台列之編修亦未落地); 重新載入後重送成功(run07 F-23／F-26, 取代 070／071 原「GW 帶 SW 終態」之設計)', async function() {
            const F = 'appRC73'
            let edit73 = (rows) => rows.map((g) => (g.name === G.m3 ? { ...g, description: 'edit73' } : g))
            await mustSync('grups', { from: F, rows: [gRow('id-rc-s73a', 'rcS73a', {}), gRow('id-rc-s73b', 'rcS73b', {})] })

            //(1) 外部同步改名 a(b 不動): 持舊快照之後台寫入 → a 之身分欄(name／description)與庫內不同 → saveExternalRowChanged
            let stale1 = (await rowsOf('grups')).map(clone)
            await mustSync('grups', { from: F, rows: [gRow('id-rc-s73a', 'rcS73a-renamed', {}), gRow('id-rc-s73b', 'rcS73b', {})] })
            let s1 = await snap4()
            let r1 = await write('grups', edit73(stale1))
            A.equal(r1.ok, false, `(1) 持過期外部列快照應被拒，實得: ${JSON.stringify(r1)}`)
            A.equal(r1.msg, 'saveExternalRowChanged', `(1) 應回 saveExternalRowChanged，實得: ${r1.msg}`)
            A.deepEqual(await snap4(), s1, '(1) 被拒時四表須逐位元不變(後台列 M3 之編修未落地)')

            //(2) 外部同步再刪除 b: 持舊快照之後台寫入含 b → 庫內已無 b, 視為「新增」且 from 非 ''(外部列不得由後台新增) → saveFromNotAllowed
            let stale2 = (await rowsOf('grups')).map(clone)
            await mustSync('grups', { from: F, rows: [gRow('id-rc-s73a', 'rcS73a-renamed', {})] })
            let s2 = await snap4()
            let r2 = await write('grups', edit73(stale2))
            A.equal(r2.ok, false, `(2) 持過期外部列快照(含已被同步刪除之列)應被拒，實得: ${JSON.stringify(r2)}`)
            A.equal(r2.msg, 'saveFromNotAllowed', `(2) 應回 saveFromNotAllowed，實得: ${r2.msg}`)
            A.deepEqual(await snap4(), s2, '(2) 被拒時四表須逐位元不變')

            //(3) 重新載入後重送: 成功, 後台列之編修落地、外部列不變
            let r3 = await write('grups', edit73((await rowsOf('grups')).map(clone)))
            A.ok(r3.ok, `(3) 重新載入後重送應成功，實得: ${JSON.stringify(r3)}`)
            let gs = await rowsOf('grups')
            A.equal(gs.find((g) => g.name === G.m3).description, 'edit73', '(3) 後台列之編修已落地')
            A.deepEqual(gs.filter((g) => g.from === F).map((g) => g.name), ['rcS73a-renamed'], '(3) 外部列分區仍為同步後之內容')
            checkLangKey('saveExternalRowChanged')
            checkLangKey('saveFromNotAllowed')
        })

    })


    // ===== B. 歷史同名(旁路寫庫; 預設設定): DupGroup 拒絕、清理路徑、歷史同名只刪其一 =====
    //歷史同名之 grups 無任何現行寫入入口可造(後台與外部同步皆拒同名, ADR-034; 任務原述「先以外部同步造出」不可行: 同 from 批內同名與跨 from 同名皆回 invalidRows), 故以 seedExtra 於後端停止期間寫庫.
    //本區各案依序執行(B1／B2 不改資料; B3／B4 改動), 不逐案還原; 區尾以 restoreAll 清除旁路列.

    describe('B. 歷史同名(seedExtra)', function() {

        before(async function() {
            this.timeout(300000)
            await restoreAllSafe()
            await useBackend('default', { seedExtra: writeSeedExtra() })
            let gs = await rowsOf('grups')
            A.deepEqual(gs.filter((g) => g.name === 'rc-dup-g').map((g) => g.id).sort(), ['id-rc-dg1', 'id-rc-dg2'], '前提: 庫內兩列同名 rc-dup-g(旁路寫入)')
            A.deepEqual(gs.filter((g) => g.name === 'rc-dup-h').map((g) => g.id).sort(), ['id-rc-dh1', 'id-rc-dh2'], '前提: 庫內兩列同名 rc-dup-h')
            A.ok((await rowsOf('users')).some((u) => u.id === 'id-rc-du'), '前提: 引用者 id-rc-du 存在')
            A.deepEqual(gs.filter((g) => g.name === 'rc-dup-k').map((g) => g.id).sort(), ['id-rc-dk1', 'id-rc-dk2'], '前提: 庫內兩列同名 rc-dup-k(兩列皆後台, run07)')
            A.ok((await rowsOf('users')).some((u) => u.id === 'id-rc-dkh'), '前提: 引用者 id-rc-dkh 存在')
        })
        after(async function() {
            this.timeout(300000)
            await restoreAllSafe()
            fs.rmSync(dirTmp, { recursive: true, force: true })
        })

        it('API-RC-032 renameCascadeDupGroup(後台): 被改名者屬歷史同名組且該名稱仍被引用 → 回語系鍵、四表逐位元不變、srLog 有 reason 且不含引用端值; 改名任一筆皆同(S4)', async function() {
            checkLangKey('renameCascadeDupGroup')
            //run07(F-23): 原迴圈為 dg2／dg1; dg1 現為外部列(appRC-d)、後台改名外部列屬 saveExternalRowChanged(非本案之 renameCascadeDupGroup), 故「任一筆」改以兩列皆後台之 dk1／dk2(rc-dup-k, 被 dkh 引用)驗, dg2 仍驗(其同名者 dg1 為外部列)
            for (let id of ['id-rc-dg2', 'id-rc-dk1', 'id-rc-dk2']) {
                let s0 = await snap4()
                let t0 = Date.now()
                let r = await edit('grups', (rows) => rows.map((g) => (g.id === id ? { ...g, name: 'rc-dup-g-renamed' } : g)))
                A.equal(r.ok, false, `${id} 改名應被拒，實得: ${JSON.stringify(r)}`)
                A.equal(r.msg, 'renameCascadeDupGroup', `${id} 應回語系鍵 renameCascadeDupGroup，實得: ${r.msg}`)
                A.deepEqual(await snap4(), s0, `${id} 被拒時四表須逐位元不變`)
                let lines = await waitLines(t0, (l) => l.event === 'updateTabItems-refCascade-error' && l.msg === 'renameCascadeDupGroup', 'refCascade-error')
                checkNoSecrets(lines, ['id-rc-du', 'rcDupHolder', 'rc-dup-holder@example.com', 'id-rc-dkh', 'rcDupHolderK', 'rc-dup-holder-k@example.com'], `032 ${id}`)
            }
        })

        it('API-RC-033 renameCascadeDupGroup(外部同步): 同步歷史同名組中屬該 from 之一列改名 → 回固定鍵 invalidRows、四表逐位元不變、srLog 之 reason 為 renameCascadeDupGroup 且不含引用端值(S4、S5e)', async function() {
            let s0 = await snap4()
            let t0 = Date.now()
            let res = await postSync('grups', { from: 'appRC-d', rows: [{ id: 'id-rc-dg1', order: 0, name: 'rc-dup-g-s', description: 'rc-dup-g 1', cpemis: JSON.stringify({ [P.p1]: ON('OR') }) }] })
            A.equal(res.state, 'error', `應被拒，實得: ${JSON.stringify(res)}`)
            A.equal(res.msg, 'invalidRows', `外部應用只收固定鍵 invalidRows，實得: ${JSON.stringify(res.msg)}`)
            A.deepEqual(await snap4(), s0, '被拒時四表須逐位元不變')
            let lines = await waitLines(t0, (l) => l.event === 'syncAndReplaceTabs-error' && l.reason === 'renameCascadeDupGroup', 'reason')
            checkNoSecrets(lines, ['id-rc-du', 'rcDupHolder', 'rc-dup-holder@example.com'], '033')
        })

        it('API-RC-034 歷史同名組無人引用時改名不擋(清理路徑): 其中一筆改名成功、引用端表逐位元不變(S4 規則 3)', async function() {
            let usersS = await snapKt('users')
            let r = await edit('grups', (rows) => rows.map((g) => (g.id === 'id-rc-dh1' ? { ...g, name: 'rc-dup-h-1' } : g)))
            A.ok(r.ok, `無人引用之歷史同名改名應成功，實得: ${JSON.stringify(r)}`)
            let gs = await rowsOf('grups')
            A.equal(gs.find((g) => g.id === 'id-rc-dh1').name, 'rc-dup-h-1', 'dh1 已改名')
            A.equal(gs.find((g) => g.id === 'id-rc-dh2').name, 'rc-dup-h', 'dh2 不變')
            A.equal(await snapKt('users'), usersS, 'users 不動(無人引用)')
        })

        it('API-RC-035 刪除歷史同名組之一筆: 仍有同 id 同名之存續列, 引用不清理(逐位元不變); 兩筆皆刪後才清理(S3)', async function() {
            //run07(F-23): 原以 dg1／dg2 驗, dg1 現為外部列(appRC-d, 後台不得刪除), 改以兩列皆後台之 dk1／dk2(rc-dup-k, 被 dkh 引用)驗同一句 spec
            let usersS = await snapKt('users')
            let r1 = await edit('grups', (rows) => rows.filter((g) => g.id !== 'id-rc-dk1'))
            A.ok(r1.ok, `刪除其一應成功，實得: ${JSON.stringify(r1)}`)
            A.equal(await snapKt('users'), usersS, '歷史同名只刪其一: users 逐位元不變(引用仍解得出)')
            let usersB = await rowsOf('users')
            let r2 = await edit('grups', (rows) => rows.filter((g) => g.id !== 'id-rc-dk2'))
            A.ok(r2.ok, `刪除另一筆應成功，實得: ${JSON.stringify(r2)}`)
            let hit = checkHolders({ label: '歷史同名全刪', before: usersB, after: await rowsOf('users'), field: 'cgrups', del: new Set(['rc-dup-k']) })
            A.deepEqual(hit, ['id-rc-dkh'], '最後一筆被刪後引用才被清理')
        })

    })


    // ===== C. cascadeRename:false =====
    //改名不連帶(引用成為懸空, 授權依 ADR-035 c 收嚴)、不產生三種改名相關拒絕; 刪除連帶清理不受影響

    describe('C. cascadeRename:false', function() {

        before(async function() {
            this.timeout(300000)
            await restoreAllSafe()
            await useBackend('off')
        })
        beforeEach(async function() {
            this.timeout(300000)
            await restoreAllSafe()
        })
        after(async function() {
            this.timeout(300000)
            await restoreAllSafe() //須於仍為 false 之設定下還原(預設設定下改回 base 名稱會被 NameInUse 拒絕: 引用端留有指向 base 名稱之懸空引用)
            await useBackend('default')
        })

        it('API-RC-050 關閉後群組改名不連帶: users 逐位元不變、引用成為懸空、授權只收嚴不放寬且被改名者之使用者授權為全 n、grupsNames 不再列出(S6; ADR-035 c)', async function() {
            await setupFx()
            let usersS = await snapKt('users')
            let permB = await permAll()
            const NEW = '權限群組M1關閉改名'
            let r = await edit('grups', (rows) => rows.map((g) => (g.name === G.m1 ? { ...g, name: NEW } : g)))
            A.ok(r.ok, `關閉後改名應成功，實得: ${JSON.stringify(r)}`)
            A.equal((await rowsOf('grups')).find((g) => g.id === `id-for-${G.m1}`).name, NEW, '主體已改名')
            A.equal(await snapKt('users'), usersS, 'users 須逐位元不變(不連帶改名, 不寫引用端)')
            let permA = await permAll()
            A.ok(permB['id-for-peter'].nY > 0, '前提: peter 改名前有授權')
            A.equal(permA['id-for-peter'].nY, 0, 'peter 之引用成為懸空, 授權為全 n(收嚴)')
            A.equal(permA['id-for-peter'].grupsNames, '', '懸空引用不列入 grupsNames')
            for (let id of Object.keys(permB)) {
                let yB = new Set(permB[id].rules.filter((x) => x.isActive === 'y').map((x) => x.name))
                for (let x of permA[id].rules.filter((x) => x.isActive === 'y')) {
                    A.ok(yB.has(x.name), `${id} 之 ${x.name} 改名後不得比改名前多給`)
                }
            }
        })

        it('API-RC-051 關閉後不產生三種改名相關拒絕: 新名撞懸空名、容器內相撞、權限改名皆成功且引用端不動(S6)', async function() {
            await mustEdit('users', (rows) => [...rows, uRow('id-rc-ghost', 'rcGhost', { '幽靈群組': ON('OR') }), uRow('id-rc-conf', 'rcConf', { [G.m1]: ON('OR'), '停用懸空': OFF('OR') })])
            let usersS = await snapKt('users')
            let r1 = await edit('grups', (rows) => rows.map((g) => (g.name === G.m3 ? { ...g, name: '幽靈群組' } : g)))
            A.ok(r1.ok, `新名撞懸空名(原 NameInUse)關閉後應成功，實得: ${JSON.stringify(r1)}`)
            let r2 = await edit('grups', (rows) => rows.map((g) => (g.name === G.m1 ? { ...g, name: '停用懸空' } : g)))
            A.ok(r2.ok, `容器內相撞(原 Conflict)關閉後應成功，實得: ${JSON.stringify(r2)}`)
            A.equal(await snapKt('users'), usersS, 'users 不動')
            let grupsS = await snapKt('grups')
            let r3 = await edit('pemis', (rows) => rows.map((p) => (p.name === P.p2 ? { ...p, name: '權限P2關閉改名' } : p)))
            A.ok(r3.ok, `權限改名應成功，實得: ${JSON.stringify(r3)}`)
            A.equal(await snapKt('grups'), grupsS, '權限改名不連帶改 grups.cpemis')
        })

        it('API-RC-052 關閉後刪除仍連帶清理: 群組→users.cgrups、權限→grups.cpemis、標的→pemis.crules(S6、S3)', async function() {
            await setupFx()
            let usersB = await rowsOf('users')
            A.ok((await edit('grups', (rows) => rows.filter((g) => g.name !== G.m2))).ok, '刪群組應成功')
            let hit1 = checkHolders({ label: '關閉後刪群組', before: usersB, after: await rowsOf('users'), field: 'cgrups', del: new Set([G.m2]) })
            A.ok(hit1.includes('id-for-mary') && hit1.includes('id-rc-uo'), `mary、uo 被清理，實得 ${JSON.stringify(hit1)}`)
            let grupsB = await rowsOf('grups')
            A.ok((await edit('pemis', (rows) => rows.filter((p) => p.name !== P.p3))).ok, '刪權限應成功')
            let hit2 = checkHolders({ label: '關閉後刪權限', before: grupsB, after: await rowsOf('grups'), field: 'cpemis', del: new Set([P.p3]) })
            A.ok(hit2.length >= 3, `引用 P3 之群組被清理，實得 ${JSON.stringify(hit2)}`)
            let pemisB = await rowsOf('pemis')
            A.ok((await edit('targets', (rows) => rows.filter((t) => t.id !== '專案A/頁A/區塊A'))).ok, '刪標的應成功')
            let hit3 = checkHolders({ label: '關閉後刪標的', before: pemisB, after: await rowsOf('pemis'), field: 'crules', del: new Set(['專案A/頁A/區塊A']) })
            A.deepEqual(hit3, [`id-for-${P.p1}`], '引用該標的之 P1 被清理')
        })

        it('API-RC-053 關閉後外部同步: 同 id 改名不連帶(引用端逐位元不變)、舊 id 不再推送仍清理引用(S6、S5)', async function() {
            await mustSync('grups', { from: 'appRC', rows: [xGrupOff(1), xGrupOff(2)] })
            await mustEdit('users', (rows) => [...rows, uRow('id-rc-bu', 'rcBu', { rcX1: ON('OR'), rcX2: ON('AND') })])
            let usersS = await snapKt('users')
            let res1 = await postSync('grups', { from: 'appRC', rows: [xGrupOff(1, 'rcX1new'), xGrupOff(2)] })
            A.equal(res1.state, 'success', `同步改名應成功，實得: ${JSON.stringify(res1)}`)
            A.equal(await snapKt('users'), usersS, '關閉後同步改名: users 逐位元不變')
            let usersB = await rowsOf('users')
            let res2 = await postSync('grups', { from: 'appRC', rows: [xGrupOff(1, 'rcX1new')] }) //rcX2 不再推送
            A.equal(res2.state, 'success', `同步(少一個)應成功，實得: ${JSON.stringify(res2)}`)
            let hit = checkHolders({ label: '關閉後同步刪除', before: usersB, after: await rowsOf('users'), field: 'cgrups', del: new Set(['rcX2']) })
            A.deepEqual(hit, ['id-rc-bu'], '舊 id 不再推送仍清理引用')
        })

    })

    describe('C2. cascadeRename:false 且歷史同名', function() {

        before(async function() {
            this.timeout(300000)
            await restoreAllSafe()
            await useBackend('off', { seedExtra: writeSeedExtra() })
        })
        after(async function() {
            this.timeout(300000)
            await restoreAllSafe()
            fs.rmSync(dirTmp, { recursive: true, force: true })
            await useBackend('default')
        })

        it('API-RC-054 關閉後歷史同名組改名不產生 renameCascadeDupGroup: 改名成功、users 逐位元不變(S6)', async function() {
            A.deepEqual((await rowsOf('grups')).filter((g) => g.name === 'rc-dup-g').map((g) => g.id).sort(), ['id-rc-dg1', 'id-rc-dg2'], '前提: 歷史同名存在')
            let usersS = await snapKt('users')
            let r = await edit('grups', (rows) => rows.map((g) => (g.id === 'id-rc-dg2' ? { ...g, name: 'rc-dup-g-renamed' } : g)))
            A.ok(r.ok, `關閉後改名歷史同名組應成功，實得: ${JSON.stringify(r)}`)
            A.equal(await snapKt('users'), usersS, 'users 不動')
        })

    })

})


//xGrupOff: C 區之同步群組列(同 A 區 xGrup, 因 describe 作用域獨立而於此重列)
function xGrupOff(n, name, o = {}) {
    return { id: `id-rc-x${n}`, order: n - 1, name: name || `rcX${n}`, description: `x${n}`, cpemis: JSON.stringify({ [`權限P${n}`]: ON('OR') }), ...o }
}
