//關聯對話框與評估呼叫端之靜態站點不變式(規則帳本 R-REL-PARSE-01／R-REL-PAIR-01／R-KEY-PROP-01, ADR-032; 來源: run02 設計一致性盤查 F-22／F-24／F-25)
//
//靜態盤點的是「新增同型站點即紅」: 元件行為由 e2e-array-form AF-013／AF-014(真瀏覽器)與 unit-pairRowsToSnapshot／unit-getPropKey／unit-getUserRules(函數層)守護.
//判定器為逐行掃描(去註解後之可執行碼), 非 AST; 能擋「拿掉 try」「改回列索引取快照列」「拿掉兜底 catch」等回歸, 變異驗證見 ADR-032 與修正報告.
//SITE-RP-001: 兩個反向關聯對話框不得以列索引(kr／ku)從 store 快照取列(F-24)
//SITE-RP-002: 兩個反向關聯對話框每一處 cvKpToObj(JSON5.parse(…)) 皆包在 try／catch(F-22)
//SITE-RP-003: 兩個反向關聯對話框之 doSave 經 pairRowsToSnapshot 配對並於 missing 非空時整次拒存(relationRowsStale), 且 revRows 亦以身分配對(F-24)
//SITE-RP-004: procLang 之 relationRowsStale 有 eng／cht 且含 {names}
//SITE-RP-005: 三個清單頁開直接編輯器對話框後之 .then 以 id 於「現在」之 opt.rows 重新找列, 不沿用開框時捕獲之列索引(外審 sol R1)
//SITE-RP-006: VeGrupBlngUsers 之三個批次勾選函數以使用者 id(不以 name)定位列(外審 sol R2)
//SITE-GK-001: WWebPerm.getGenUserAndRulesByUserId 之 getUserRules 呼叫包在 try, catch 內記 srLog 並以固定語系鍵 cannotGetUserRules reject(F-25)
//SITE-GK-002: mergeRules 與 cvKpToObj 以 name 當屬性鍵之指派皆經 getPropKey(F-25)
//跑法: npx mocha test/unit-relDialogs.test.mjs --timeout 30000
import assert from 'assert'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { sourceLines } from './tools/srcScan.mjs'

const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const RELS = ['VeGrupBlngUsers', 'VePemiBlngGrups']
const fpOf = (fn) => path.join(projRoot, 'src', 'components', `${fn}.vue`)

//codeLines: 去註解後之可執行碼(.vue 之 <script> 內; sourceLines 只處理 // 與 /* */ 註解)
const codeLines = (fp) => sourceLines(fp, 'code').filter((l) => l.text.trim() !== '')

//methodBody: 取 `<name>: function(...) {` 起至下一個同縮排層級方法起點之前的程式行(逐行掃描, 以 4 層縮排(8 空白)的 `xxx: function` 為方法邊界)
const methodBody = (lines, name) => {
    let i0 = lines.findIndex((l) => new RegExp(`^\\s{8}${name}: function`).test(l.text))
    assert.ok(i0 >= 0, `找不到方法 ${name}`)
    let i1 = lines.findIndex((l, k) => k > i0 && /^\s{8}[A-Za-z_$][\w$]*: (async )?function/.test(l.text))
    return lines.slice(i0, i1 < 0 ? lines.length : i1)
}


describe('unit-relDialogs (關聯對話框與評估呼叫端之站點不變式, R-REL-PARSE-01／R-REL-PAIR-01／R-KEY-PROP-01)', function() {

    it('SITE-RP-001-兩個反向關聯對話框不得以列索引從 store 快照取列: 無 get(users|grups, kr…) 與 get(rows, `${索引變數}…`)(修前每個元件 4 處: doSave 有損檢查與寫出之 get(users|grups, kr) 各一、revRows 之 get(rows, `${ku|kg}.mode／.enable`) 各一)', function() {
        for (let fn of RELS) {
            let bad = codeLines(fpOf(fn)).filter((l) => /\bget\(\s*(users|grups)\s*,\s*kr\b/.test(l.text) || /\bget\(\s*rows\s*,\s*`\$\{\w+\}/.test(l.text) || /\b(users|grups)\s*\[\s*k\w*\s*\]/.test(l.text))
            assert.deepStrictEqual(bad.map((l) => `${fn}:${l.no}: ${l.text.trim()}`), [], `${fn} 仍以列索引配對`)
        }
    })

    it('SITE-RP-002-兩個反向關聯對話框每一處 cvKpToObj(JSON5.parse(…)) 皆為 `try {` 之唯一敘述且其後緊接 catch(F-22: 空字串、壞 JSON 視為空容器); 各 3 處', function() {
        for (let fn of RELS) {
            let lines = codeLines(fpOf(fn))
            let hits = lines.map((l, k) => [l, k]).filter(([l]) => /cvKpToObj\(JSON5\.parse\(/.test(l.text))
            assert.strictEqual(hits.length, 3, `${fn} 應有 3 處 cvKpToObj(JSON5.parse(`)
            for (let [l, k] of hits) {
                assert.strictEqual(lines[k - 1].text.trim(), 'try {', `${fn}:${l.no} 前一行須為 try {`)
                let nxt = lines.slice(k + 1, k + 3).map((v) => v.text.trim()).join(' ')
                assert.ok(/^\}\s*catch\b/.test(nxt), `${fn}:${l.no} 後面須緊接 } catch, 實得「${nxt}」`)
            }
        }
    })

    it('SITE-RP-003-doSave 經 pairRowsToSnapshot 配對, missing 非空即 return false 並顯示 relationRowsStale(整次拒存, 在 updateLoading(true) 與任何寫入之前); revRows 亦經 pairRowsToSnapshot 以身分配對', function() {
        for (let [fn, snapVar, verify] of [['VeGrupBlngUsers', 'users', false], ['VePemiBlngGrups', 'grups', true]]) {
            let lines = codeLines(fpOf(fn))
            let txt = fs.readFileSync(fpOf(fn), 'utf8')
            assert.ok(new RegExp(`import pairRowsToSnapshot from '\\.\\./js/pairRowsToSnapshot\\.mjs'`).test(txt), `${fn} 須 import pairRowsToSnapshot`)
            let d = methodBody(lines, 'doSave').map((l) => l.text).join('\n')
            assert.strictEqual(d.split('pairRowsToSnapshot(').length - 1, 1, `${fn}.doSave 應只配對一次(有損檢查與寫出共用同一份配對結果)`)
            let iPair = d.indexOf('pairRowsToSnapshot(')
            let iStale = d.indexOf('relationRowsStale')
            let iLoading = d.indexOf('updateLoading(true)')
            let iSave = d.search(/vo\.save(Users|Grups)\(/)
            assert.ok(iPair >= 0 && iStale > iPair, `${fn}.doSave 須在配對後以 relationRowsStale 拒存`)
            assert.ok(iStale < iLoading && iStale < iSave, `${fn}.doSave 之拒存須在 updateLoading(true) 與寫入之前`)
            assert.ok(/size\(\s*missing\s*\)\s*>\s*0/.test(d), `${fn}.doSave 須檢查 missing 非空`)
            let seg = d.slice(iStale)
            assert.ok(/return false/.test(seg.slice(0, 200)), `${fn}.doSave 拒存後須 return false`)
            assert.ok(d.includes(`cloneDeep(vo.${snapVar})`), `${fn}.doSave 仍取一次快照 cloneDeep(vo.${snapVar})`)
            assert.strictEqual(/verifyKeys:\s*\[\s*'name'\s*\]/.test(d), verify, `${fn}.doSave ${verify ? '須' : '不得'}以 verifyKeys: ['name'] 驗名稱`)
            assert.ok((d.match(/\bpairs\[kr\]/g) || []).length >= 2, `${fn}.doSave 有損檢查與寫出兩處都須取 pairs[kr](配對結果), 不得另取快照列`)
            let r = methodBody(lines, 'revRows').map((l) => l.text).join('\n')
            assert.ok(r.includes('pairRowsToSnapshot('), `${fn}.revRows 須以身分配對(pairRowsToSnapshot)`)
            assert.ok(/let \{ krs, matched: (usersRev|grupsRev) \} = pairRowsToSnapshot\(/.test(r), `${fn}.revRows 須以 pairRowsToSnapshot 之 krs／matched 取得配得到之列(不自行壓縮索引)`)
            assert.ok(/let kr = krs\[k\]$/m.test(r), `${fn}.revRows 更新顯示時須以 krs[k] 還原列索引(items[k] ↔ 第 krs[k] 列; 行尾錨定, 不得為 krs[k] ± n)`)
            assert.ok(!/opt\.rows\[\$\{k\}\]/.test(r), `${fn}.revRows 不得以壓縮後之 k 直接當 opt.rows 索引`)
        }
    })

    it('SITE-RP-005-三個清單頁開直接編輯器對話框後之 .then 以 id 於現在之 opt.rows 重新找列(krNow), 不沿用開框時捕獲之 kr 回填(對話框開啟期間 store 更新會重建 opt.rows)', function() {
        for (let [fn, method, key] of [['LayoutContentUsers', 'showVeCgrupsById', 'userEditCgrupsNoUserData'], ['LayoutContentGrups', 'showVeCpemisById', 'grupEditBlngNoGrupData'], ['LayoutContentPemis', 'showVeCrulesById', 'pemiEditCrulesNoPemiData']]) {
            let b = methodBody(codeLines(fpOf(fn)), method).map((l) => l.text).join('\n')
            assert.ok(/let krNow = -1/.test(b) && /krNow < 0/.test(b), `${fn}.${method} 須於 .then 內以 id 重新找列(krNow)`)
            assert.ok(b.includes(`$t('${key}')`), `${fn}.${method} 找不到列時須以 ${key} 提示`)
            assert.ok(/each\(get\(vo, 'opt\.rows', \[\]\), \(v, k\) => \{\s+if \(get\(v, 'id', ''\) === id\) \{\s+krNow = k/.test(b), `${fn}.${method} 之 krNow 須取自「現在」之 get(vo, 'opt.rows', [])(不得改回開框時捕獲之 rows)`)
            assert.ok(/opt\.rows\[\$\{krNow\}\]/.test(b), `${fn}.${method} 須以 krNow 回填`)
            assert.ok(!/opt\.rows\[\$\{kr\}\]/.test(b) && !/\bkr = k\b/.test(b), `${fn}.${method} 不得沿用開框時捕獲之 kr`)
        }
    })

    it('SITE-RP-006-VeGrupBlngUsers 之三個批次勾選函數(全選／全取消／反選)以使用者 id 定位列(使用者 name 允許重複), 不以 name', function() {
        let lines = codeLines(fpOf('VeGrupBlngUsers'))
        for (let m of ['showVeGrupBlngUsersToggleItemsEnableAllYes', 'showVeGrupBlngUsersToggleItemsEnableAllNo', 'showVeGrupBlngUsersToggleItemsEnableAllInv']) {
            let b = methodBody(lines, m).map((l) => l.text).join('\n')
            assert.ok(/kpRow\[r\.id\] = kr/.test(b) && /let kr = kpRow\[r\.id\]/.test(b), `${m} 須以 r.id 建立並查詢 kpRow`)
            assert.ok(!/kpRow\[r\.name\]/.test(b), `${m} 不得以 r.name 定位列`)
            //第二輪外審 minimax2 R1: 用來定位之 id 須真的存在於 rowsEff——getDisplayData 只回顯示欄位(name／enable／grupsNames, 不含 id), 須用 getDisplayRows(ag-grid api 之完整列)
            assert.ok(/let rowsEff = vo\.getDisplayRows\(\)/.test(b) && !/getDisplayData\(/.test(b), `${m} 之 rowsEff 須取自 vo.getDisplayRows()(含 id), 不得為 getDisplayData()(無 id)`)
        }
        let g = methodBody(lines, 'getDisplayRows').map((l) => l.text).join('\n')
        assert.ok(/getApi\(\)/.test(g) && /forEachNodeAfterFilterAndSort/.test(g) && /rows\.push\(node\.data\)/.test(g), 'getDisplayRows 須以 ag-grid api 取篩選排序後之完整列(node.data)')
    })

    it('SITE-RP-004-procLang 之 relationRowsStale 有 eng／cht 且含 {names}', function() {
        let lang = fs.readFileSync(path.join(projRoot, 'server', 'procLang.mjs'), 'utf8')
        assert.ok(/relationRowsStale: \{[^\n]*\n\s*eng: [^\n]*\{names\}[^\n]*\n\s*cht: [^\n]*\{names\}/.test(lang), 'procLang 須有 relationRowsStale 之 eng／cht 且含 {names}')
    })

    it('SITE-GK-001-WWebPerm.getGenUserAndRulesByUserId: getUserRules( 呼叫包在 try, catch 內記 srLog(msg cannotGetUserRules) 並 Promise.reject 固定語系鍵(不回引擎原文)', function() {
        let lines = sourceLines(path.join(projRoot, 'server', 'WWebPerm.mjs'), 'code').filter((l) => l.text.trim() !== '')
        let i0 = lines.findIndex((l) => /let getGenUserAndRulesByUserId = async/.test(l.text))
        assert.ok(i0 >= 0, '找不到 getGenUserAndRulesByUserId')
        let i1 = lines.findIndex((l, k) => k > i0 && /let pathStaticFiles/.test(l.text))
        let body = lines.slice(i0, i1).map((l) => l.text)
        let iCall = body.findIndex((l) => /\bgetUserRules\(/.test(l))
        assert.ok(iCall >= 0, '函數內應呼叫 getUserRules(')
        assert.strictEqual(body.filter((l) => /\bgetUserRules\(/.test(l)).length, 1, '函數內只應有一處 getUserRules(')
        assert.strictEqual(body[iCall - 1].trim(), 'try {', 'getUserRules( 的前一行須為 try {')
        let tail = body.slice(iCall + 1).join('\n')
        let m = /^\s*\}\s*catch\s*\((\w+)\)\s*\{([\s\S]*?)\n\s{8}\}/.exec(tail)
        assert.ok(m, 'getUserRules( 之後須緊接 catch 區塊')
        assert.ok(/srLog\.error\(\{[^}]*event: 'getGenUserAndRulesByUserId-error'[^}]*msg: 'cannotGetUserRules'/.test(m[2]), 'catch 內須 srLog.error 記 cannotGetUserRules')
        assert.ok(/return Promise\.reject\(`?'?cannotGetUserRules`?'?\)/.test(m[2]), 'catch 內須 Promise.reject 固定鍵 cannotGetUserRules')
        assert.ok(!new RegExp(`Promise\\.reject\\(\\s*${m[1]}\\b`).test(m[2]) && !new RegExp(`Promise\\.reject\\([^)]*${m[1]}\\.message`).test(m[2]), 'catch 內不得把例外本身或其 message 回給呼叫端')
    })

    it('SITE-GK-002-以 name 當屬性鍵之指派皆經 getPropKey: mShare.mergeRules 的 kpRule[…]、cvKpToObj 陣列形式(hasMode:false)的 o[…]; 且不再有 kpRule[vv.name] 直接指派', function() {
        let ms = sourceLines(path.join(projRoot, 'src', 'plugins', 'mShare.mjs'), 'code').map((l) => l.text).join('\n')
        assert.ok(/import getPropKey from '\.\.\/js\/getPropKey\.mjs'/.test(ms), 'mShare.mjs 須 import getPropKey')
        assert.ok(!/kpRule\[vv\.name\]\s*=/.test(ms), 'mergeRules 不得再以 kpRule[vv.name] 直接指派')
        assert.ok(/getPropKey\(vv\.name\)/.test(ms), 'mergeRules 須經 getPropKey(vv.name)')
        let co = sourceLines(path.join(projRoot, 'src', 'js', 'cvKpToObj.mjs'), 'code').map((l) => l.text).join('\n')
        assert.ok(/import getPropKey from '\.\/getPropKey\.mjs'/.test(co), 'cvKpToObj.mjs 須 import getPropKey')
        assert.ok(!/\bo\[r\.name\]\s*=/.test(co), 'cvKpToObj 陣列形式不得再以 o[r.name] 直接指派')
        assert.ok(/getPropKey\(r\.name\)/.test(co), 'cvKpToObj 須經 getPropKey(r.name)')
    })

})
