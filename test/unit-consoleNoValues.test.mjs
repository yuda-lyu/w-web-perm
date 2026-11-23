//console 診斷不輸出資料值(perm 修正輪 20261031023204, 排程第 191、165 項; 規則帳本 R-CONSOLE-NOVAL-01; ADR-047 取代原「請求驗證失敗之 console 診斷記錄不修」之處置〔ADR-044／045 之 T-c〕)
//規格句(本檔所翻譯者; 各案註解標明):
//  S1 dspec〈診斷輸出與遮罩〉D2「預設不輸出資料值」(使用者 2026-10-29 裁示): 診斷輸出只含安全摘要(錯誤類型、鍵名、型別等), 不含資料值、id、後端錯誤原文.
//  S2 dspec〈輸入參數之檢測機制〉§6 V20「訊息與 throw／reject 前之 console 皆不含輸入值」.
//  S3 主控裁定(任務 20261031023204 _common.md): console 診斷只印鍵名、型別或固定詞彙, 不印使用者物件、請求本體、傳入值; 權杖之 maskTok 照舊.
//本檔為單元層: ①wsemi 之 getDiagShape／getDiagBriefErr(2026-11-23 twp2 起, 排程第 603 項, 取代本套件原自有之 describeShape／describeErr; 規格 D1 單一實作)不含值之行為與永不拋錯——釘住本套件所倚賴之輸出契約, wsemi 升版若改變即紅; ②站點不變式——server 靜態匯入閉包內每個可執行 console 呼叫之每個引數皆為「固定字面值／typeof／不含值之摘要函數／已逐一登錄理由之識別字」,
//  新增站點若印出值即紅(靜態判準見 test/tools/srcScan.mjs scanConsoleValueArgs); ③被豁免之離線工具與關閉範圍之清單釘住. 真後端之行為驗證(以同一組識別值經真 HTTP 觸發各站點)見 api-consoleNoValues.
//跑法(需測試鎖): node C:/opensrcOper/tools/quiet-run.mjs --lock --name console -- npx mocha test/unit-consoleNoValues.test.mjs --timeout 120000
import fs from 'fs'
import path from 'path'
import assert from 'assert'
import { fileURLToPath } from 'url'
import getDiagShape from 'wsemi/src/getDiagShape.mjs'
import getDiagBriefErr from 'wsemi/src/getDiagBriefErr.mjs'
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


describe('unit-consoleNoValues-shape (wsemi getDiagShape／getDiagBriefErr: 只印鍵名、型別、類別, 不印值; 永不拋錯; 本套件所倚賴之輸出契約)', function() {

    //getDiagBriefErr 回傳物件(不是字串): 以 JSON 字串比對, 且須不含識別值
    const brief = (e) => JSON.stringify(getDiagBriefErr(e))

    //S1: 物件只列鍵名, 值(含巢狀)不出現
    it('SHAPE-001-object-keys-only', function() {
        let u = { id: SEC, name: SEC, email: `${SEC}@example.com`, nested: { x: SEC }, list: [SEC] }
        let s = getDiagShape(u)
        A.equal(s, '(keys: id,name,email,nested,list)')
        A.ok(!s.includes(SEC), `不得含識別值, 實得 ${s}`)
        A.equal(getDiagShape({}), '(keys: none)')
        A.equal(getDiagShape(Object.create(null)), '(keys: none)')
        //null-prototype(Hapi 之 req.query 形狀)
        let q = Object.assign(Object.create(null), { token: SEC, userId: SEC })
        A.equal(getDiagShape(q), '(keys: token,userId)')
    })

    //S1: 非物件只印型別(2026-11-23 twp2 起字樣為 `(string)` 而非原自有實作之 `(typeof string)`); 空字串另標 empty(區分「空」與「非字串」)
    it('SHAPE-002-non-object-types-only', function() {
        A.equal(getDiagShape(SEC), '(string)')
        A.equal(getDiagShape(''), '(string, empty)')
        A.equal(getDiagShape(123456789), '(number)')
        A.equal(getDiagShape(true), '(boolean)')
        A.equal(getDiagShape(() => SEC), '(function)')
        A.equal(getDiagShape(10n), '(bigint)')
        A.equal(getDiagShape(Symbol(SEC)), '(symbol)')
        A.equal(getDiagShape(null), '(null)')
        A.equal(getDiagShape(undefined), '(undefined)')
        for (let v of [SEC, 123456789, () => SEC, Symbol(SEC)]) {
            A.ok(!getDiagShape(v).includes(SEC), `不得含識別值`)
        }
    })

    //S1: 陣列只印筆數
    it('SHAPE-003-array-length-only', function() {
        let s = getDiagShape([SEC, { id: SEC }, SEC])
        A.equal(s, '(array, length=3)')
        A.ok(!s.includes(SEC))
        A.equal(getDiagShape([]), '(array, length=0)')
    })

    //上限與控制字元: 鍵名至多 20 個、單鍵至多 32 字(wsemi 預設; 原自有實作為 40 字), 超出標示; 控制字元與格式字元換 '?'(防請求端偽造 log 行)
    it('SHAPE-004-bounds-and-control-chars', function() {
        let o = {}
        for (let i = 0; i < 25; i++) {
            o[`k${i}`] = SEC
        }
        let s = getDiagShape(o)
        A.ok(s.endsWith(',...+5)'), `超過 20 鍵須標示餘數, 實得 ${s}`)
        A.equal(s.split(',').length, 21, '20 個鍵＋餘數標示')
        let long = getDiagShape({ ['x'.repeat(60)]: SEC })
        A.equal(long, `(keys: ${'x'.repeat(32)}...)`)
        let ctl = getDiagShape({ ['a\nb\r\u0000c']: SEC })
        A.equal(ctl, '(keys: a?b??c)')
        A.ok(!/[\r\n\u0000]/.test(ctl))
        //格式字元(Cf: 零寬字元、BOM、軟連字號; 原自有實作不換, wsemi 換)亦換 '?'
        A.equal(getDiagShape({ 'a​b': 1, 'c﻿d': 1 }), '(keys: a?b,c?d)')
    })

    //D4: 永不拋錯(Proxy 陷阱、不可列舉之存取器、循環、巨量)
    it('SHAPE-005-never-throws', function() {
        let p = new Proxy({}, { ownKeys() {
            throw new Error(SEC)
        } })
        let s = getDiagShape(p)
        A.equal(s, '(proxy)') //可偵測之 Proxy 不觸發其陷阱(伺服端; 瀏覽器無 util.types 時走 '(unreadable)')
        A.ok(!s.includes(SEC))
        let pa = new Proxy([], { get() {
            throw new Error(SEC)
        } })
        A.doesNotThrow(() => getDiagShape(pa))
        A.ok(!getDiagShape(pa).includes(SEC))
        let c = { a: SEC }
        c.self = c
        A.equal(getDiagShape(c), '(keys: a,self)')
        let g = {}
        Object.defineProperty(g, 'boom', { enumerable: true, get() {
            throw new Error(SEC)
        } })
        A.equal(getDiagShape(g), '(keys: boom)') //只讀鍵名, 不觸發存取器
        let huge = {}
        for (let i = 0; i < 5000; i++) {
            huge[`h${i}`] = SEC
        }
        let hs = getDiagShape(huge)
        A.ok(hs.length < 400, `巨量鍵名之輸出須有界, 實得長度 ${hs.length}`)
        //已撤銷之 Proxy
        let rv = Proxy.revocable({}, {})
        rv.revoke()
        A.doesNotThrow(() => getDiagShape(rv.proxy))
    })

    //內建物件以型別標示, 不再列為 `(keys: none)`(原自有實作之 Map／Set／Date／Error 皆為 `(keys: none)`, 型別化陣列列出索引鍵)
    it('SHAPE-006-builtin-objects-by-kind', function() {
        A.equal(getDiagShape(new Map([[SEC, SEC]])), '(map, size=1)')
        A.equal(getDiagShape(new Set([SEC])), '(set, size=1)')
        A.equal(getDiagShape(new Uint8Array(4)), '(binary, byteLength=4)')
        A.equal(getDiagShape(new Date(0)), '(date)')
        A.equal(getDiagShape(new Error(SEC)), '(error)')
        for (let v of [new Map([[SEC, SEC]]), new Set([SEC]), new Date(0), new Error(SEC), Promise.resolve(SEC), /x/]) {
            A.ok(!getDiagShape(v).includes(SEC), '不得含識別值')
        }
    })

    //S1: 錯誤只印類別(與白名單機器代碼), 不印訊息文字(2026-11-23 twp2 起以 wsemi getDiagBriefErr 之物件 { errType, errCode } 直接輸出, 不再經本地字串格式化 `(Error ENOENT)`)
    it('ERR-001-error-type-only', function() {
        let e1 = new Error(`parse failed near ${SEC}`)
        A.equal(brief(e1), '{"errType":"Error"}')
        let e2 = new TypeError(`bad ${SEC}`)
        A.equal(brief(e2), '{"errType":"TypeError"}')
        let e3 = new Error(`open ${SEC}`)
        e3.code = 'ENOENT'
        A.equal(brief(e3), '{"errType":"Error","errCode":"ENOENT"}')
        for (let e of [e1, e2, e3, SEC, { message: SEC }, null, undefined]) {
            let s = brief(e)
            A.ok(!s.includes(SEC), `不得含識別值, 實得 ${s}`)
        }
        A.equal(brief(SEC), '{"errType":"string"}')
        //實例自設 name 夾帶識別字者仍歸 Error(wsemi 之類別名白名單)
        let e4 = new Error('x')
        e4.name = SEC
        A.ok(!brief(e4).includes(SEC))
        //代碼夾帶識別字者不列(代碼只收白名單)
        let e5 = new Error('x')
        e5.code = SEC
        A.equal(brief(e5), '{"errType":"Error"}')
        //取值拋錯之物件不使其拋錯
        let bad = new Proxy({}, { get() {
            throw new Error(SEC)
        } })
        A.doesNotThrow(() => getDiagBriefErr(bad))
        A.ok(!brief(bad).includes(SEC))
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
                'console.log(\'ok\', getDiagShape(user), typeof user, `x ${typeof user}`)',
                'console.log(err)',
                'console.log(`v ${user.id}`)',
                'console.log(\'a\', getDiagShape(user) + user.id)',
                'console.log(\'userSelf\', userSelf, \'x\')',
                'console.error(payload)',
                'console.log(getDiagBriefErr(err), \'c\', mappingBy)',
                //2026-11-23 twp2 起摘要函數為 wsemi 之 getDiagShape／getDiagBriefErr; 原自有之 describeShape／describeErr 不再是允許之呼叫(若有人重新引入本地實作, 其站點即紅)
                'console.log(\'old\', describeShape(user))',
                'console.log(\'oldErr\', describeErr(err))',
            ]
            fs.writeFileSync(fp, lines.join('\n'), 'utf8')
            let bad = scanConsoleValueArgs(fp, 'code', { allowIds: ['mappingBy'] })
            A.deepEqual(bad.map((x) => Number(/:(\d+)/.exec(x)[1])), [1, 3, 4, 5, 6, 7, 9, 10], `實得 ${bad.join(' | ')}`)
        }
        finally {
            fs.rmSync(path.join(projRoot, 'test', '_tmp', 'consoleNoValues-scan'), { recursive: true, force: true })
        }
    })

})
