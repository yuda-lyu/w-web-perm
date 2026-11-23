//本地型別／錯誤摘要函數之收斂(2026-11-24 twp3, 排程第 609 項; 承 twp2 排程第 603 項之 describeShape／describeErr 改 wsemi; 規格〈診斷輸出與遮罩〉D1 單一實作、D2 預設不輸出資料值; 規則帳本 R-CONSOLE-NOVAL-03)
//規格句(本檔所翻譯者; 各案註解標明):
//  S1 D1「摘要一律用 wsemi 共用函數, 本地不得另寫等價實作」: src/plugins/mShare.mjs 原有第二份本地錯誤類別摘要 nameOfErr(任何 \w{1,40} 之 err.name 皆放行, 比 wsemi getDiagBriefErr 寬, 可印出被植入之識別字)
//     與 `(typeof …)` 字面值之型別標示 → 改用 getDiagBriefErr(物件直印)／getDiagShape.
//  S2 D2「預設不輸出資料值」: 授權字串(使用者或外部應用寫入之 JSON5)與其解析結果之鍵為群組／權限／規則名(資料), 型別標示不列鍵名({ keys: false }, 輸出與修前同為只標型別).
//  S3 盤點(派工〈主控已定〉3): 本地仍保留之「錯誤類別名稱擷取」限定於二處非 console 用途(SDK 之 reject message 契約、srLog 之 upstreamName 欄位), 新增者須先判定(DLS-013).
//DLS-001／002／003 行為: 真函數 getUserRules 於授權字串解碼失敗時之 console 輸出(以識別值植入授權字串、其鍵與錯誤文字, 逐案驗輸出不含識別值且為預期之摘要; DLS-003 以鏡像根強制 cvKpToArr 之防禦分支)
//DLS-010／011／013 靜態: 本地無 nameOfErr; 無 `(typeof …)` 字面值之產生者(maskLog 之 `${typeof …}` 為權杖遮罩 M 契約, 不在此列); 錯誤類別名稱擷取之檔限定於已判定者
//跑法(需測試鎖): node C:/opensrcOper/tools/quiet-run.mjs --lock --name twp3 -- npx mocha test/unit-diagLocalSummary.test.mjs --timeout 120000
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { getUserRules } from '../src/plugins/mShare.mjs'
import { sourceLines } from './tools/srcScan.mjs'

const A = assert.strict
const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const rel = (fp) => path.relative(projRoot, fp).replace(/\\/g, '/')
const SEC = 'ZZ-secret-9317' //識別值: 置於授權字串、其鍵與錯誤文字; 任何診斷輸出皆不得含此字串
const SECW = 'ZZsecret9317' //識別值之識別字形狀(\w{1,40}): 置於 Error.name(原本地 nameOfErr 對此形狀之名稱原樣放行)
const fdTmp = path.join(projRoot, 'test', '_tmp', 'diagLocalSummary')

//capture: 執行 fn 期間收集 console.log 之引數(每次呼叫一組), 結束還原
function capture(fn) {
    let calls = []
    let orig = console.log
    console.log = (...args) => {
        calls.push(args)
    }
    try {
        fn()
    }
    finally {
        console.log = orig
    }
    return calls
}

//noSec: 引數(含物件引數)之序列化不含識別值
function noSec(calls, label) {
    let s = JSON.stringify(calls)
    A.ok(!s.includes(SEC), `${label}: 診斷輸出不得含識別值, 實得 ${s.slice(0, 500)}`)
}

//listFiles: 全部非測試之可執行檔(src 之 .vue/.js/.mjs、server 全部 .mjs、srv.mjs、g_*.mjs、toolg/*.mjs)
function listFiles() {
    let out = []
    let walk = (d, re) => {
        for (let n of fs.readdirSync(d, { withFileTypes: true })) {
            let fp = path.join(d, n.name)
            if (n.isDirectory()) {
                walk(fp, re)
            }
            else if (re.test(n.name)) {
                out.push(fp)
            }
        }
    }
    walk(path.join(projRoot, 'src'), /\.(vue|js|mjs)$/)
    walk(path.join(projRoot, 'server'), /\.mjs$/)
    walk(path.join(projRoot, 'toolg'), /\.mjs$/)
    out.push(path.join(projRoot, 'srv.mjs'))
    for (let n of fs.readdirSync(projRoot)) {
        if (/^g_[^/]*\.mjs$/.test(n)) {
            out.push(path.join(projRoot, n))
        }
    }
    return out.sort()
}


describe('unit-diagLocalSummary (mShare 之 console 摘要: 授權字串解碼失敗; 真函數 getUserRules 收集 console 輸出)', function() {

    const GRUPS = []
    const PEMIS = []
    const TARGETS = [{ id: 'A' }]

    //DLS-001: S1 授權字串非合法 JSON5 → 型別以 wsemi getDiagShape、錯誤類別以 getDiagBriefErr 之物件(原: `(typeof string)` 與字串 'SyntaxError')
    it('DLS-001-invalid-authorization-text-shape-and-errType', function() {
        let calls = capture(() => {
            getUserRules({ cgrups: `${SEC} {oops` }, GRUPS, PEMIS, TARGETS)
        })
        noSec(calls, '非合法 JSON5 之授權字串')
        A.deepEqual(calls, [['cvStrToArr: JSON5.parse failed', '(string)', { errType: 'SyntaxError' }]], `實得 ${JSON.stringify(calls)}`)
        //空字串(使用者無授權字串)為另一形狀: 標 empty
        let calls2 = capture(() => {
            getUserRules({ cgrups: '' }, GRUPS, PEMIS, TARGETS)
        })
        A.deepEqual(calls2, [['cvStrToArr: JSON5.parse failed', '(string, empty)', { errType: 'SyntaxError' }]], `實得 ${JSON.stringify(calls2)}`)
    })

    //DLS-001b: S1 錯誤之 name 可被設為任意字串(原 nameOfErr 放行任何 \w{1,40} 之 name 而原樣印出): 解析時拋出之錯誤帶被植入之識別字名稱, 只印內建類別名('Error'), 不印該名稱
    it('DLS-001b-planted-err-name-not-printed', function() {
        let planted = Object.assign(new Error('m'), { name: SECW })
        let toStr = () => {
            throw planted
        }
        let calls = capture(() => {
            getUserRules({ cgrups: { toString: toStr } }, GRUPS, PEMIS, TARGETS) //String(授權值)拋出帶植入名稱之錯誤, 被 cvStrToArr 之 try 接住
        })
        A.ok(!JSON.stringify(calls).includes(SECW), `診斷輸出不得含被植入之 err.name, 實得 ${JSON.stringify(calls)}`)
        A.deepEqual(calls, [['cvStrToArr: JSON5.parse failed', '(object)', { errType: 'Error' }]], `實得 ${JSON.stringify(calls)}`)
    })

    //DLS-002: S2 傳入之授權值非字串(外部應用寫入之物件、陣列)時, 型別標示不列鍵名: 物件為 (object)、陣列為 (array, length=N); 鍵為使用者資料(群組／權限名)
    it('DLS-002-non-string-authorization-no-key-names', function() {
        //物件: String(物件) 為 '[object Object]' → JSON5 解析失敗; 鍵為識別值
        let o = { [SEC]: 'y', [`${SEC}-2`]: { mode: 'OR', isActive: 'y' } }
        let calls = capture(() => {
            getUserRules({ cgrups: o }, GRUPS, PEMIS, TARGETS)
        })
        noSec(calls, '授權值為以識別值為鍵之物件')
        A.deepEqual(calls, [['cvStrToArr: JSON5.parse failed', '(object)', { errType: 'SyntaxError' }]], `物件只標型別, 不列鍵名; 實得 ${JSON.stringify(calls)}`)
        //陣列: 只標筆數
        let calls2 = capture(() => {
            getUserRules({ cgrups: [SEC, SEC] }, GRUPS, PEMIS, TARGETS)
        })
        noSec(calls2, '授權值為含識別值之陣列')
        A.deepEqual(calls2, [['cvStrToArr: JSON5.parse failed', '(array, length=2)', { errType: 'SyntaxError' }]], `陣列只標筆數; 實得 ${JSON.stringify(calls2)}`)
        //toString 為函數且回含識別值之文字之物件(JSON5.parse 以 String() 轉字串): 解析失敗, 仍只標 (object)
        let calls3 = capture(() => {
            getUserRules({ cgrups: { [SEC]: 'y', toString: () => `${SEC} {oops` } }, GRUPS, PEMIS, TARGETS)
        })
        noSec(calls3, 'toString 回識別值之物件')
        A.deepEqual(calls3, [['cvStrToArr: JSON5.parse failed', '(object)', { errType: 'SyntaxError' }]], `實得 ${JSON.stringify(calls3)}`)
        //無原型物件(null-prototype; String() 拋 TypeError): 同被 try 接住, 只標 (object) 與錯誤類別
        let np = Object.assign(Object.create(null), { [SEC]: 'y' })
        let calls4 = capture(() => {
            getUserRules({ cgrups: np }, GRUPS, PEMIS, TARGETS)
        })
        noSec(calls4, 'null-prototype 物件')
        A.deepEqual(calls4, [['cvStrToArr: JSON5.parse failed', '(object)', { errType: 'TypeError' }]], `實得 ${JSON.stringify(calls4)}`)
    })

    //DLS-003: S1／S2 cvKpToArr 之防禦分支(資料不可達, 以鏡像根強制): 型別 c、kp 皆以 getDiagShape({ keys: false }), 錯誤以 getDiagBriefErr
    //  鏡像根: test/_tmp/diagLocalSummary/src 為 src/plugins/mShare.mjs 與 src/js/ 之逐字複本, 只把 js/cvKpToArr.mjs 換成「必拋含識別值訊息之 TypeError」之替身(經 dependency 縫強制進入該分支);
    //  被測之 console 呼叫為 mShare.mjs 原碼, 替身只決定是否進入分支
    describe('DLS-003 cvKpToArr 防禦分支(鏡像根)', function() {
        let mod = null

        before(async function() {
            fs.rmSync(fdTmp, { recursive: true, force: true })
            fs.mkdirSync(path.join(fdTmp, 'src', 'plugins'), { recursive: true })
            fs.cpSync(path.join(projRoot, 'src', 'js'), path.join(fdTmp, 'src', 'js'), { recursive: true })
            fs.copyFileSync(path.join(projRoot, 'src', 'plugins', 'mShare.mjs'), path.join(fdTmp, 'src', 'plugins', 'mShare.mjs'))
            fs.writeFileSync(path.join(fdTmp, 'src', 'js', 'cvKpToArr.mjs'), `export default function cvKpToArr(kp) {\n    throw (typeof globalThis.__dlsThrow === 'function') ? globalThis.__dlsThrow() : new TypeError('${SEC} boom')\n}\n`, 'utf8')
            mod = await import(pathToFileURL(path.join(fdTmp, 'src', 'plugins', 'mShare.mjs')).href)
        })

        after(function() {
            fs.rmSync(fdTmp, { recursive: true, force: true })
        })

        it('DLS-003a-kp-object-type-only', function() {
            let calls = capture(() => {
                mod.getUserRules({ cgrups: JSON.stringify({ [SEC]: 'y' }) }, GRUPS, PEMIS, TARGETS)
            })
            noSec(calls, 'kp 為以識別值為鍵之物件')
            A.deepEqual(calls, [['cvStrToArr: cvKpToArr failed', '(string)', '(object)', { errType: 'TypeError' }]], `c 只標型別、kp 不列鍵名、錯誤為類別物件(訊息不入); 實得 ${JSON.stringify(calls)}`)
        })

        it('DLS-003b-kp-array-count-only', function() {
            let calls = capture(() => {
                mod.getUserRules({ cgrups: JSON.stringify([{ name: SEC, isActive: 'y' }, { name: SEC, isActive: 'n' }]) }, GRUPS, PEMIS, TARGETS)
            })
            noSec(calls, 'kp 為含識別值之陣列')
            A.deepEqual(calls, [['cvStrToArr: cvKpToArr failed', '(string)', '(array, length=2)', { errType: 'TypeError' }]], `實得 ${JSON.stringify(calls)}`)
        })

        it('DLS-003c-kp-scalar-type-only', function() {
            let calls = capture(() => {
                mod.getUserRules({ cgrups: JSON.stringify(SEC) }, GRUPS, PEMIS, TARGETS)
            })
            noSec(calls, 'kp 為字串純量')
            A.deepEqual(calls, [['cvStrToArr: cvKpToArr failed', '(string)', '(string)', { errType: 'TypeError' }]], `實得 ${JSON.stringify(calls)}`)
        })

        it('DLS-003e-c-object-with-valid-json-text-type-only', function() {
            //授權值為物件(外部應用寫入), 其 toString 回合法 JSON(解析成功、進入 cvKpToArr 之防禦分支): c 為以識別值為鍵之物件, 只標 (object), 不列鍵名
            let calls = capture(() => {
                mod.getUserRules({ cgrups: { [SEC]: 1, toString: () => '{"A":"y"}' } }, GRUPS, PEMIS, TARGETS)
            })
            noSec(calls, 'c 為以識別值為鍵之物件')
            A.deepEqual(calls, [['cvStrToArr: cvKpToArr failed', '(object)', '(object)', { errType: 'TypeError' }]], `實得 ${JSON.stringify(calls)}`)
        })

        it('DLS-003d-planted-err-name-and-code-not-printed', function() {
            //錯誤帶被植入之識別字名稱與白名單外之代碼: 只印內建類別名, 名稱與該代碼皆不入
            globalThis.__dlsThrow = () => Object.assign(new TypeError(`${SEC} boom`), { name: SECW, code: 'ZZ_SECRET_9317' })
            try {
                let calls = capture(() => {
                    mod.getUserRules({ cgrups: JSON.stringify({ A: 'y' }) }, GRUPS, PEMIS, TARGETS)
                })
                noSec(calls, '錯誤帶植入之名稱與代碼')
                A.ok(!JSON.stringify(calls).includes(SECW) && !JSON.stringify(calls).includes('ZZ_SECRET_9317'), `診斷輸出不得含被植入之名稱與代碼, 實得 ${JSON.stringify(calls)}`)
                A.deepEqual(calls, [['cvStrToArr: cvKpToArr failed', '(string)', '(object)', { errType: 'Error' }]], `實得 ${JSON.stringify(calls)}`)
            }
            finally {
                delete globalThis.__dlsThrow
            }
        })
    })

})


describe('unit-diagLocalSummary-static (本地摘要函數之盤點: 單一實作、無 `(typeof …)` 字面值、類別名稱擷取之檔限定; R-CONSOLE-NOVAL-03)', function() {

    //DLS-010: S1 本地無 nameOfErr(定義、匯入、呼叫皆無); 原擁有者 mShare 自 wsemi 匯入摘要函數並呼叫
    it('DLS-010-no-local-nameOfErr-mShare-uses-wsemi', function() {
        let bad = []
        for (let fp of listFiles()) {
            let code = sourceLines(fp, 'code').map((l) => l.text).join('\n')
            if (/\bnameOfErr\b/.test(code)) {
                bad.push(`${rel(fp)} 含 nameOfErr`)
            }
        }
        A.deepEqual(bad, [], `本地錯誤類別摘要 nameOfErr 已改用 wsemi getDiagBriefErr(單一實作, D1), 不得復活:\n${bad.join('\n')}`)
        let ls = sourceLines(path.join(projRoot, 'src', 'plugins', 'mShare.mjs'), 'code')
        let code = ls.map((l) => l.text).join('\n')
        A.ok(ls.some((l) => /^import getDiagShape from 'wsemi\/src\/getDiagShape\.mjs'$/.test(l.text.trim())), 'mShare.mjs 須自 wsemi/src/getDiagShape.mjs 匯入 getDiagShape')
        A.ok(ls.some((l) => /^import getDiagBriefErr from 'wsemi\/src\/getDiagBriefErr\.mjs'$/.test(l.text.trim())), 'mShare.mjs 須自 wsemi/src/getDiagBriefErr.mjs 匯入 getDiagBriefErr')
        A.ok(/\bgetDiagBriefErr\(err\)/.test(code) && /\bgetDiagShape\(c, \{ keys: false \}\)/.test(code) && /\bgetDiagShape\(kp, \{ keys: false \}\)/.test(code), 'mShare.mjs 之 console 站點須用 getDiagBriefErr(err)、getDiagShape(c／kp, { keys: false })')
    })

    //DLS-011: S1 無「(typeof …)」字面值之產生者: 可執行碼之字串或樣板字串內不得有 `(typeof `(原 mShare 之 `(typeof ${typeof c})`);
    //  樣板字串之 `${typeof …}` 只允許在 server/maskLog.mjs(maskTok／maskUrl 對非字串回 `(${typeof x})`, 即 `(string)` 形式之單字型別, 權杖遮罩之 M 契約, 四 repo 一致, 不改)
    it('DLS-011-no-typeof-literal-producers', function() {
        let bad = []
        let kept = []
        let reLit = /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g //字串／樣板字串字面值(單行)
        for (let fp of listFiles()) {
            for (let { no, text } of sourceLines(fp, 'code')) {
                for (let lit of text.match(reLit) || []) {
                    if (lit.includes('(typeof ')) {
                        bad.push(`${rel(fp)}:${no}: ${text.trim()}`)
                    }
                    if (lit.startsWith('`') && lit.includes('${typeof ')) {
                        kept.push(rel(fp))
                    }
                }
            }
        }
        A.deepEqual(bad, [], `不得產生 '(typeof …)' 字面值(型別標示一律 wsemi getDiagShape):\n${bad.join('\n')}`)
        A.deepEqual(kept, ['server/maskLog.mjs', 'server/maskLog.mjs'], `樣板字串內之 \${typeof …} 限於 server/maskLog.mjs 之 maskTok／maskUrl 兩處(M 契約); 實得 ${kept}`)
    })

    //DLS-013: S3 「錯誤類別名稱擷取」(以 err.name／get(err, 'name')／cause.code／constructor.name 自錯誤值取名稱或代碼並輸出)之檔限定於已判定者;
    //  新增者須先判定是否改用 wsemi getDiagBriefErr(console 用途一律改; 非 console 用途之結構化欄位／契約字串須有理由並加入此表)
    it('DLS-013-error-name-extraction-files-pinned', function() {
        const RETAINED = {
            'server/wrapInjected.mjs': '注入函數失敗時 srLog 之 upstreamType／upstreamName 欄位(describeUpstream; 持久日誌之結構化欄位, 與 w-web-sso K／W 契約同步點; 非 console)',
            'src/fetchJson.mjs': 'SDK(getPerm／getPermUserInfor／perm.conn／provideTabs)reject 物件之 message 字串 `<名稱>[ <代碼>]`(errDesc; 對外 reject 契約, unit-sdk-tokenSafety SDK-005 釘住; 非 console)',
        }
        let re = /\bget\(\s*\w*[eE]rr\w*\s*,\s*['"`](?:name|cause\.code|code)['"`]|\b\w*[eE]rr(?:or)?\w*\.name\b|\.constructor\.name\b|Object\.prototype\.toString\.call\(/
        let got = new Set()
        for (let fp of listFiles()) {
            if (sourceLines(fp, 'code').some((l) => re.test(l.text))) {
                got.add(rel(fp))
            }
        }
        A.deepEqual([...got].sort(), Object.keys(RETAINED).sort(), `錯誤類別名稱擷取之檔須限定於已判定者(console 用途一律用 wsemi getDiagBriefErr; 其餘須有理由並加入 RETAINED); 實得 ${[...got].sort()}`)
        for (let [f, why] of Object.entries(RETAINED)) {
            A.ok(why.length > 20, `${f} 須有理由`)
        }
    })

})
