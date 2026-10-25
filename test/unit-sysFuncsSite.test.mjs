//系統函數身分關卡之設定與前提(站點不變式; perm-run01 本輪, 任務 20261025161334; 規則帳本 R-SYSFUNCS-01; dspec/使用者身分驗證原則.md 二.7、二.8)
//
//受測: server/WWebPerm.mjs(WServHapiServer 之 sysFuncsPublic)、src/main.js(WServHapiClient 之 useWaitToken／getToken)、package.json 與已安裝之 w-serv-hapi／w-serv-webdata／w-serv-broadcast 版本。
//述語:
//  SFS-001  server/WWebPerm.mjs 恰有一處 `sysFuncsPublic:` 設定(去註解後), 其值恰為 ['[sys:getFuncList]'](只公開函數名稱清單; [sys:polling]、[sys:getTableTags] 須有效身分);
//           且位於 WServHapiServer 的選項物件內(與 getUserIdByToken 同一物件); 框架在 sysFuncsPublic 缺漏／null／鍵名打錯時退回「三者皆公開」, 故此項不可省;
//  SFS-002  src/main.js 之 WServHapiClient 以 useWaitToken: true 且 getToken 取 $store.state.userToken: 登入前(尚無 token)前端元件不輪詢、不取函數清單、不呼叫任何系統函數,
//           因此登入前各畫面(無 token 進站、轉址 SSO、一般使用者「無權進入」畫面)不依賴公開之系統函數; 改為 false 或換 token 來源須先重審 SFS-001(w-web-sso 之登入頁即因登入前須連線而需公開 [sys:polling]);
//  SFS-003  相依版本: package.json 之 w-serv-hapi 範圍下限 ≥ 1.1.8, 且已安裝之 w-serv-hapi ≥ 1.1.8、w-serv-webdata ≥ 1.1.16、w-serv-broadcast ≥ 1.1.12
//           (低於者不認 sysFuncsPublic, 靜默退回三者皆公開; 前端元件亦須為輪詢帶 `__sysToken__` 之新版, 否則升版後登入後的輪詢被拒);
//           sysFuncsPublic 之元素須為框架三個系統函數名之一(SFS-001 內);
//  SFS-004  server/ 內以字串字面值寫出系統函數名([sys: 前綴)之站點只有 sysFuncsPublic 那一處(kpFunExt 不得使用此前綴, 框架保留; 他處另設系統函數之公開判斷即為繞過 SFS-001 的第二個擁有者)。
//跑法: npx mocha test/unit-sysFuncsSite.test.mjs --reporter list --timeout 30000
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { stripLineComment } from './tools/srcScan.mjs'

const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const A = assert.strict

let readRaw = (rel) => fs.readFileSync(path.join(projRoot, rel), 'utf8')
let readCode = (rel) => readRaw(rel).split(/\r?\n/).map((ln) => stripLineComment(ln)).join('\n')
let verOf = (s) => String(s).replace(/^[^\d]*/, '').split('.').map((n) => parseInt(n, 10))
let cmpVer = (a, b) => {
    for (let i = 0; i < 3; i++) {
        let d = (a[i] || 0) - (b[i] || 0)
        if (d !== 0) {
            return d
        }
    }
    return 0
}
const SYS_FUNCS = ['[sys:getFuncList]', '[sys:polling]', '[sys:getTableTags]']
const RE_PUB = /\bsysFuncsPublic\s*:\s*\[((?:\s*'[^']*'\s*,?)*)\s*\]/g //值須為單引號字串字面值之陣列
let elemsOf = (inner) => [...inner.matchAll(/'([^']*)'/g)].map((m) => m[1])


describe('unit-sysFuncsSite (系統函數身分關卡之設定與前提, perm-run01)', function() {

    it('SFS-001 server/WWebPerm.mjs 恰一處 sysFuncsPublic, 值恰為 [\'[sys:getFuncList]\'], 位於 WServHapiServer 選項物件內', function() {
        let code = readCode('server/WWebPerm.mjs')
        A.equal([...code.matchAll(/\bsysFuncsPublic\s*:/g)].length, 1, '去註解後 sysFuncsPublic 設定應恰 1 處')
        let ms = [...code.matchAll(RE_PUB)]
        A.equal(ms.length, 1, 'sysFuncsPublic 應為字串字面值陣列')
        A.deepStrictEqual(elemsOf(ms[0][1]), ['[sys:getFuncList]'], 'sysFuncsPublic 只公開函數名稱清單')
        for (let n of elemsOf(ms[0][1])) {
            A.ok(SYS_FUNCS.includes(n), `sysFuncsPublic 元素 ${n} 不是框架系統函數名`)
        }
        //位於交給 new WServHapiServer(...) 之選項物件(let optWServHapiServer = { ... })內: 該物件起點與建構呼叫之間, 且與 getUserIdByToken 同一物件
        let iOpt = code.search(/\blet\s+optWServHapiServer\s*=\s*\{/)
        let iNew = code.search(/new\s+WServHapiServer\s*\(\s*optWServHapiServer\s*\)/)
        A.ok(iOpt >= 0, '找不到 let optWServHapiServer = {')
        A.ok(iNew > iOpt, '找不到 new WServHapiServer(optWServHapiServer)')
        let iGet = code.indexOf('getUserIdByToken:', iOpt)
        let iPub = ms[0].index
        A.ok(iGet > iOpt && iGet < iNew, '找不到 optWServHapiServer 內之 getUserIdByToken')
        A.ok(iPub > iOpt && iPub < iNew, 'sysFuncsPublic 須在 optWServHapiServer 與建構呼叫之間')
        //同一物件: 選項物件起點與建構呼叫之間不得出現第二個 `let opt… = {` 選項物件宣告
        A.ok(!/\blet\s+opt\w*\s*=\s*\{/.test(code.slice(iOpt + 10, iNew)), 'optWServHapiServer 與建構呼叫之間不得另有選項物件宣告')
    })

    it('SFS-002 src/main.js: WServHapiClient 以 useWaitToken: true 且 getToken 取 $store.state.userToken(登入前不連線、不呼叫系統函數)', function() {
        let code = readCode('src/main.js')
        let i = code.indexOf('WServHapiClient({')
        A.ok(i >= 0, '找不到 WServHapiClient({')
        let body = code.slice(i)
        A.ok(/\buseWaitToken\s*:\s*true\b/.test(body), 'useWaitToken 須為 true')
        //getToken 取 store 之 userToken 並回傳該值(外審 sol F5: 只驗文字存在, 改成 return '' 仍會過; 故連同 let token = … 與 return token 一併固定)
        A.ok(/\bgetToken\s*:\s*\(\)\s*=>\s*\{\s*let\s+token\s*=\s*get\(Vue\.prototype,\s*`\$store\.state\.userToken`,\s*''\)\s*return\s+token\s*\}/.test(body), 'getToken 須為 let token = get(Vue.prototype, `$store.state.userToken`, \'\') 並 return token(登入成功才有值)')
        //token 只在登入成功寫入、登入失敗清空(App.vue): 無權進入／被否決時不會殘留 token 使前端元件連線
        let app = readCode('src/App.vue')
        A.ok(/updateUserToken\(data\.token\)/.test(app), 'loginSuccess 寫入 token')
        A.ok(/updateUserToken\(''\)/.test(app), 'loginError 清空 token')
        //useWaitToken 只管首次啟動: 資料通道啟動後清空 token 並不會讓元件回到等待狀態(外審 sol F4), 故 src 內寫入／清空 userToken 之呼叫點須恰為 App.vue 這兩處(登入前); 新增第三處(如登出)須先停止資料通道(clearBroadcast＋clearSync)並重審本規則
        let sites = []
        let walk = (d) => {
            for (let f of fs.readdirSync(d, { withFileTypes: true })) {
                let p = path.join(d, f.name)
                if (f.isDirectory()) {
                    walk(p)
                }
                else if (/\.(mjs|js|vue)$/.test(f.name)) {
                    let c = readCode(path.relative(projRoot, p))
                    for (let m of c.matchAll(/\.updateUserToken\(/g)) {
                        sites.push(`${path.relative(projRoot, p).replace(/\\/g, '/')}:${m.index}`)
                    }
                }
            }
        }
        walk(path.join(projRoot, 'src'))
        A.deepStrictEqual(sites.map((s) => s.split(':')[0]), ['src/App.vue', 'src/App.vue'], `updateUserToken 呼叫點須恰為 App.vue 之 loginSuccess／loginError, 實得 ${JSON.stringify(sites)}`)
    })

    it('SFS-003 相依版本: package.json 之 w-serv-hapi 下限 ≥ 1.1.8; 已安裝 w-serv-hapi ≥ 1.1.8、w-serv-webdata ≥ 1.1.16、w-serv-broadcast ≥ 1.1.12', function() {
        let pkg = JSON.parse(readRaw('package.json'))
        //範圍須為單純之 ^x.y.z／~x.y.z／x.y.z(外審 sol F6: <=1.1.8、|| 等複合範圍會被當成單一版本而誤過)
        let rng = pkg.dependencies['w-serv-hapi']
        A.ok(/^[\^~]?\d+\.\d+\.\d+$/.test(rng), `package.json 之 w-serv-hapi 範圍 ${rng} 須為單純之 ^／~／精確版本`)
        A.ok(cmpVer(verOf(rng), [1, 1, 8]) >= 0, `package.json 之 w-serv-hapi 範圍 ${rng} 下限須 ≥ 1.1.8`)
        let installed = (name) => JSON.parse(readRaw(`node_modules/${name}/package.json`)).version
        A.ok(cmpVer(verOf(installed('w-serv-hapi')), [1, 1, 8]) >= 0, `已安裝 w-serv-hapi ${installed('w-serv-hapi')}`)
        A.ok(cmpVer(verOf(installed('w-serv-webdata')), [1, 1, 16]) >= 0, `已安裝 w-serv-webdata ${installed('w-serv-webdata')}`)
        A.ok(cmpVer(verOf(installed('w-serv-broadcast')), [1, 1, 12]) >= 0, `已安裝 w-serv-broadcast ${installed('w-serv-broadcast')}`)
    })

    it('SFS-004 server/ 內以字串字面值寫出系統函數名([sys: 前綴)之站點只有 sysFuncsPublic', function() {
        let dir = path.join(projRoot, 'server')
        let hits = []
        let walk = (d) => {
            for (let f of fs.readdirSync(d, { withFileTypes: true })) {
                let p = path.join(d, f.name)
                if (f.isDirectory()) {
                    walk(p)
                }
                else if (/\.mjs$/.test(f.name)) {
                    let code = fs.readFileSync(p, 'utf8').split(/\r?\n/).map((ln) => stripLineComment(ln)).join('\n')
                    //物件鍵或字串字面值以 [sys: 起頭, 且不是 sysFuncsPublic 陣列內之元素
                    for (let m of code.matchAll(/['"`]\[sys:[^'"`\]]*\]['"`]/g)) {
                        hits.push(`${path.relative(projRoot, p).replace(/\\/g, '/')}:${m[0]}`)
                    }
                }
            }
        }
        walk(dir)
        A.deepStrictEqual(hits, ['server/WWebPerm.mjs:\'[sys:getFuncList]\''], 'server/ 內出現 [sys: 字面值之站點只有 sysFuncsPublic 之 getFuncList')
    })
})
