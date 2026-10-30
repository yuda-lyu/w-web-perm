//console 診斷不輸出資料值(perm 修正輪 20261031023204, 排程第 191、165 項; 規則帳本 R-CONSOLE-NOVAL-01; ADR-047 取代原「請求驗證失敗之 console 診斷記錄不修」之處置〔ADR-044／045 之 T-c〕)
//規格句(本檔所翻譯者; 各案註解標明):
//  S1 dspec〈診斷輸出與遮罩〉D2「預設不輸出資料值」(使用者 2026-10-29 裁示): 診斷輸出只含安全摘要(錯誤類型、鍵名、型別等), 不含資料值、id、後端錯誤原文.
//  S2 dspec〈輸入參數之檢測機制〉§6 V20「訊息與 throw／reject 前之 console 皆不含輸入值」.
//  S3 主控裁定(任務 20261031023204 _common.md): console 診斷只印鍵名、型別或固定詞彙, 不印使用者物件、請求本體、傳入值; 權杖之 maskTok 照舊.
//本檔為單元層: ①describeShape／describeErr(server/maskLog.mjs)不含值之行為與永不拋錯; ②站點不變式——server 靜態匯入閉包內每個可執行 console 呼叫之每個引數皆為「固定字面值／typeof／不含值之摘要函數／已逐一登錄理由之識別字」,
//  新增站點若印出值即紅(靜態判準見 test/tools/srcScan.mjs scanConsoleValueArgs); ③被豁免之離線工具與關閉範圍之清單釘住. 真後端之行為驗證(以同一組識別值經真 HTTP 觸發各站點)見 api-consoleNoValues.
//跑法(需測試鎖): node C:/opensrcOper/tools/quiet-run.mjs --lock --name console -- npx mocha test/unit-consoleNoValues.test.mjs --timeout 120000
import fs from 'fs'
import path from 'path'
import assert from 'assert'
import { fileURLToPath } from 'url'
import { scanConsoleValueArgs, importClosure, sourceLines } from './tools/srcScan.mjs'

const A = assert.strict
const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const SEC = 'ZZ-secret-9317' //識別值: 置於使用者物件、請求本體、傳入參數之「值」; 任何診斷輸出皆不得含此字串
const rel = (fp) => path.relative(projRoot, fp).replace(/\\/g, '/')

//允許之識別字(逐一有理由; 非資料值): 見各站點註解與 ADR-047 決定 8. only: 只在符合之檔內允許(null 為閉包內任何檔; keyTable 於 WWebPerm 為請求值, 不得放行)
const ALLOW_IDS = {
    mappingBy: { why: '建構期正規化為 \'id\'|\'email\'|\'name\' 三值之一(WWebPerm.mjs mappingBy), 固定詞彙', only: /^server\/WWebPerm\.mjs$/ },
    count: { why: '對應筆數(數字)', only: /^server\/WWebPerm\.mjs$/ },
    countFind: { why: '對應筆數(數字)', only: /^server\/WWebPerm\.mjs$/ },
    apiType: { why: 'w-converhp 依已註冊路由傳入之固定名稱(main／ulctr／slc／dwgfn／dwgf／dw), 非請求內容; srLog 亦記同欄', only: /^server\/WWebPerm\.mjs$/ },
    fpEntryIn: { why: '由固定檔名 index.tmp／index.html 與靜態檔夾(dist 或 npm 套件內 dist)導出之路徑, 無使用者或請求之值', only: /^server\/WWebPerm\.mjs$/ },
    fnEntryOut: { why: '固定檔名 index.html', only: /^server\/WWebPerm\.mjs$/ },
    keyTable: { why: '資料表固定名稱(src/schema/tables/*.mjs 模組常數 users／targets／pemis／grups, 測試資料產生器之訊息用)', only: /^src\/schema\/tables\/\w+\.mjs$/ },
}
//idsOf: 某檔允許之識別字
const idsOf = (f) => Object.entries(ALLOW_IDS).filter(([, v]) => v.only === null || v.only.test(f)).map(([k]) => k)


describe('unit-consoleNoValues-shape (describeShape／describeErr: 只印鍵名、型別、類別, 不印值; 永不拋錯)', function() {

    let describeShape = null
    let describeErr = null

    before(async function() {
        let m = await import('../server/maskLog.mjs')
        describeShape = m.describeShape
        describeErr = m.describeErr
    })

    //S1: 物件只列鍵名, 值(含巢狀)不出現
    it('SHAPE-001-object-keys-only', function() {
        let u = { id: SEC, name: SEC, email: `${SEC}@example.com`, nested: { x: SEC }, list: [SEC] }
        let s = describeShape(u)
        A.equal(s, '(keys: id,name,email,nested,list)')
        A.ok(!s.includes(SEC), `不得含識別值, 實得 ${s}`)
        A.equal(describeShape({}), '(keys: none)')
        A.equal(describeShape(Object.create(null)), '(keys: none)')
        //null-prototype(Hapi 之 req.query 形狀)
        let q = Object.assign(Object.create(null), { token: SEC, userId: SEC })
        A.equal(describeShape(q), '(keys: token,userId)')
    })

    //S1: 非物件只印型別; 空字串另標 empty(區分「空」與「非字串」)
    it('SHAPE-002-non-object-types-only', function() {
        A.equal(describeShape(SEC), '(typeof string)')
        A.equal(describeShape(''), '(typeof string, empty)')
        A.equal(describeShape(123456789), '(typeof number)')
        A.equal(describeShape(true), '(typeof boolean)')
        A.equal(describeShape(() => SEC), '(typeof function)')
        A.equal(describeShape(10n), '(typeof bigint)')
        A.equal(describeShape(Symbol(SEC)), '(typeof symbol)')
        A.equal(describeShape(null), '(null)')
        A.equal(describeShape(undefined), '(undefined)')
        for (let v of [SEC, 123456789, () => SEC, Symbol(SEC)]) {
            A.ok(!describeShape(v).includes(SEC), `不得含識別值`)
        }
    })

    //S1: 陣列只印筆數
    it('SHAPE-003-array-length-only', function() {
        let s = describeShape([SEC, { id: SEC }, SEC])
        A.equal(s, '(array, length=3)')
        A.ok(!s.includes(SEC))
        A.equal(describeShape([]), '(array, length=0)')
    })

    //上限與控制字元: 鍵名至多 20 個、單鍵至多 40 字, 超出標示; 控制字元換 '?'(防請求端偽造 log 行)
    it('SHAPE-004-bounds-and-control-chars', function() {
        let o = {}
        for (let i = 0; i < 25; i++) {
            o[`k${i}`] = SEC
        }
        let s = describeShape(o)
        A.ok(s.endsWith(',...+5)'), `超過 20 鍵須標示餘數, 實得 ${s}`)
        A.equal(s.split(',').length, 21, '20 個鍵＋餘數標示')
        let long = describeShape({ ['x'.repeat(60)]: SEC })
        A.equal(long, `(keys: ${'x'.repeat(40)}...)`)
        let ctl = describeShape({ ['a\nb\r\u0000c']: SEC })
        A.equal(ctl, '(keys: a?b??c)')
        A.ok(!/[\r\n\u0000]/.test(ctl))
    })

    //D4: 永不拋錯(Proxy 陷阱、不可列舉之存取器、循環、巨量)
    it('SHAPE-005-never-throws', function() {
        let p = new Proxy({}, { ownKeys() {
            throw new Error(SEC)
        } })
        let s = describeShape(p)
        A.equal(s, '(typeof object)')
        A.ok(!s.includes(SEC))
        let pa = new Proxy([], { get() {
            throw new Error(SEC)
        } })
        A.doesNotThrow(() => describeShape(pa))
        A.ok(!describeShape(pa).includes(SEC))
        let c = { a: SEC }
        c.self = c
        A.equal(describeShape(c), '(keys: a,self)')
        let g = {}
        Object.defineProperty(g, 'boom', { enumerable: true, get() {
            throw new Error(SEC)
        } })
        A.equal(describeShape(g), '(keys: boom)') //只讀鍵名, 不觸發存取器
        let huge = {}
        for (let i = 0; i < 5000; i++) {
            huge[`h${i}`] = SEC
        }
        let hs = describeShape(huge)
        A.ok(hs.length < 400, `巨量鍵名之輸出須有界, 實得長度 ${hs.length}`)
    })

    //S1: 錯誤只印類別(與白名單機器代碼), 不印訊息文字
    it('ERR-001-error-type-only', function() {
        let e1 = new Error(`parse failed near ${SEC}`)
        A.equal(describeErr(e1), '(Error)')
        let e2 = new TypeError(`bad ${SEC}`)
        A.equal(describeErr(e2), '(TypeError)')
        let e3 = new Error(`open ${SEC}`)
        e3.code = 'ENOENT'
        A.equal(describeErr(e3), '(Error ENOENT)')
        for (let e of [e1, e2, e3, SEC, { message: SEC }, null, undefined]) {
            let s = describeErr(e)
            A.ok(!s.includes(SEC), `不得含識別值, 實得 ${s}`)
        }
        A.equal(describeErr(SEC), '(string)')
        //實例自設 name 夾帶識別字者仍歸 Error(wsemi 之類別名白名單)
        let e4 = new Error('x')
        e4.name = SEC
        A.ok(!describeErr(e4).includes(SEC))
        //取值拋錯之物件不使其拋錯
        let bad = new Proxy({}, { get() {
            throw new Error(SEC)
        } })
        A.doesNotThrow(() => describeErr(bad))
        A.ok(!describeErr(bad).includes(SEC))
    })

})


describe('unit-consoleNoValues-sites (站點不變式: server 靜態匯入閉包內之 console 呼叫不印資料值; R-CONSOLE-NOVAL-01)', function() {

    let closure = null
    let files = null

    before(function() {
        closure = importClosure(path.join(projRoot, 'server', 'WWebPerm.mjs'))
        files = [...closure].map(rel).sort()
    })

    const opt = (f) => ({ allowIds: idsOf(f) })

    //S1／S2／S3: 閉包內每個檔之每個可執行 console 呼叫之每個引數皆不印值(修前: WWebPerm 印 user／payload／userSelf／userId／keyTable／err、mShare 印授權字串 c／kp／err、schema 印整批 rs)
    it('SITE-NV-001-closure-console-args-no-values', function() {
        A.ok(files.includes('server/WWebPerm.mjs'), `閉包須含入口檔, 實得 ${files.slice(0, 5)}`)
        let bad = []
        for (let f of files) {
            bad.push(...scanConsoleValueArgs(path.join(projRoot, f), 'code', opt(f)).map((x) => `${f} ${x}`))
        }
        A.deepEqual(bad, [], `console 站點印出可能含資料值之引數 ${bad.length} 處:\n${bad.join('\n')}`)
    })

    //閉包涵蓋之檔須含已知之共用碼(證明掃描範圍含 src 內被伺服端匯入者, 修前 mShare／schema 之站點在此範圍)
    it('SITE-NV-002-closure-covers-shared-src', function() {
        for (let f of ['server/WWebPerm.mjs', 'server/procCore.mjs', 'server/syncCore.mjs', 'server/maskLog.mjs', 'src/plugins/mShare.mjs', 'src/schema/index.mjs', 'src/schema/tables/users.mjs', 'src/schema/tables/targets.mjs', 'src/schema/tables/pemis.mjs', 'src/schema/tables/grups.mjs']) {
            A.ok(files.includes(f), `閉包缺 ${f}; 實得 ${files.join(',')}`)
        }
        //被豁免之離線工具不得被伺服端匯入(否則其輸出將進伺服路徑)
        let leaked = files.filter((f) => f.startsWith('server/tools/') || /^g_[^/]*\.mjs$/.test(f) || f.startsWith('toolg/'))
        A.deepEqual(leaked, [], `離線工具不得在伺服端匯入閉包內: ${leaked}`)
    })

    //豁免清單釘住: server/ 下不在閉包之檔, 若有 console 呼叫必在 server/tools/ 下(離線維運工具, 操作者即資料持有者; README〈Not covered〉); 他處新增者須先判定
    it('SITE-NV-003-exempt-files-pinned', function() {
        let all = []
        let walk = (d) => {
            for (let n of fs.readdirSync(d, { withFileTypes: true })) {
                let fp = path.join(d, n.name)
                if (n.isDirectory()) {
                    walk(fp)
                }
                else if (n.name.endsWith('.mjs')) {
                    all.push(fp)
                }
            }
        }
        walk(path.join(projRoot, 'server'))
        let stray = []
        for (let fp of all) {
            let r = rel(fp)
            if (closure.has(fp) || r.startsWith('server/tools/')) {
                continue
            }
            let n = sourceLines(fp, 'code').filter((l) => /\bconsole\.\w+/.test(l.text)).length
            if (n > 0) {
                stray.push(`${r}(${n})`)
            }
        }
        A.deepEqual(stray, [], `閉包外且非 server/tools 之檔含 console 呼叫(須先判定是否印值): ${stray}`)
    })

    //參考部署 srv.mjs(測試後端與部署方範本): error 事件只印類別
    it('SITE-NV-004-srv-console-args-no-values', function() {
        let bad = scanConsoleValueArgs(path.join(projRoot, 'srv.mjs'), 'code', opt('srv.mjs'))
        A.deepEqual(bad, [], `srv.mjs 之 console 印出可能含資料值之引數 ${bad.length} 處:\n${bad.join('\n')}`)
    })

    //部署方會照抄之範例: WWebPerm.mjs JSDoc 與 README.md 之 console 範例不印使用者物件
    it('SITE-NV-005-doc-examples-no-values', function() {
        let o = { allowIds: [], allowExprs: ['err && err.name', 'from'] } //from: 本套件傳給部署方函數之固定來源名(getPerm／main／getUserByToken 等路由與 apiType), 非使用者資料
        let bad = [
            ...scanConsoleValueArgs(path.join(projRoot, 'server', 'WWebPerm.mjs'), 'doc', o),
            ...scanConsoleValueArgs(path.join(projRoot, 'README.md'), 'md', o),
        ]
        A.deepEqual(bad, [], `文件範例之 console 印出可能含資料值之引數 ${bad.length} 處:\n${bad.join('\n')}`)
    })

    //允許識別字須仍存在於其站點(清單不得殘留無用項; 每項皆有理由)
    it('SITE-NV-006-allow-ids-have-reasons-and-are-used', function() {
        for (let [id, v] of Object.entries(ALLOW_IDS)) {
            A.ok(v.why.length > 4, `${id} 須有理由`)
            let used = files.filter((f) => (v.only === null || v.only.test(f)) && new RegExp(`console\\.log\\([^\\n]*\\b${id}\\b`).test(sourceLines(path.join(projRoot, f), 'code').map((l) => l.text).join('\n')))
            A.ok(used.length > 0, `允許識別字 ${id} 在其允許之檔內已無對應之 console 站點, 請自清單移除`)
        }
        //keyTable 於 WWebPerm(請求值)不得被放行
        A.ok(!idsOf('server/WWebPerm.mjs').includes('keyTable'), 'keyTable 於 WWebPerm.mjs 為請求值, 不得列入允許')
    })

    //掃描器自測: 對違規寫法確實回報(防掃描器空轉)
    it('SITE-NV-007-scanner-self-test', function() {
        let fp = path.join(projRoot, 'test', '_tmp', 'consoleNoValues-scan', 'sample.mjs')
        fs.mkdirSync(path.dirname(fp), { recursive: true })
        try {
            let lines = [
                'console.log(\'user\', user)',
                'console.log(\'ok\', describeShape(user), typeof user, `x ${typeof user}`)',
                'console.log(err)',
                'console.log(`v ${user.id}`)',
                'console.log(\'a\', describeShape(user) + user.id)',
                'console.log(\'userSelf\', userSelf, \'x\')',
                'console.error(payload)',
                'console.log(describeErr(err), \'c\', mappingBy)',
            ]
            fs.writeFileSync(fp, lines.join('\n'), 'utf8')
            let bad = scanConsoleValueArgs(fp, 'code', { allowIds: ['mappingBy'] })
            A.deepEqual(bad.map((x) => Number(/:(\d+)/.exec(x)[1])), [1, 3, 4, 5, 6, 7], `實得 ${bad.join(' | ')}`)
        }
        finally {
            fs.rmSync(path.join(projRoot, 'test', '_tmp', 'consoleNoValues-scan'), { recursive: true, force: true })
        }
    })

})
