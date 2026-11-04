// unit: e2e 共用 openApp 之靜態守護(規則帳本 R-TEST-OPENAPP-NOPREVISIT-01)
//
// 規則: openApp 不得先開無 token 之頁面——無 token 頁約 2 秒後會自行導覽, 與其後之 evaluate 或 goto 相撞,
//   測試行程停滯時即拋 `Execution context was destroyed`(2026-11-04 全連動 AF-038 之紅燈). 全新 context 之儲存本就為空, 不需先清.
// 重現與回歸: node test/tools/probeOpenAppRace.mjs
import assert from 'assert'
import fs from 'fs'
import path from 'path'

let src = fs.readFileSync(path.resolve('./test/tools/e2e-setup.mjs'), 'utf8')

//取 openApp 函式本體(自宣告至行首之右大括號)
let bodyOf = (code) => {
    let m = /export async function openApp\([\s\S]*?\r?\n\}\r?\n/.exec(code)
    assert.ok(m, 'e2e-setup.mjs 應有 openApp')
    return m[0]
}

describe('e2e openApp 不先開無 token 頁', function() {

    it('本體之第一個 goto 即帶 token(appUrl), 且不存取 localStorage', function() {
        let body = bodyOf(src)
        let gotos = body.match(/\.goto\(\s*[\w.]+/g) || []
        assert.deepStrictEqual(gotos.map((v) => v.replace(/\.goto\(\s*/, '')), ['appUrl'])
        assert.ok(!/localStorage/.test(body), 'openApp 不應存取 localStorage')
    })

    it('守護本身有鑑別力: 舊寫法(先 goto baseUrl 再清 localStorage)會被抓到', function() {
        let old = "export async function openApp(browser, opts = {}) {\n    await page.goto(baseUrl, {}).catch(() => {})\n    await page.evaluate(() => { localStorage.clear() })\n    await page.goto(appUrl, {})\n}\n"
        let gotos = bodyOf(old).match(/\.goto\(\s*[\w.]+/g).map((v) => v.replace(/\.goto\(\s*/, ''))
        assert.notDeepStrictEqual(gotos, ['appUrl'])
        assert.ok(/localStorage/.test(bodyOf(old)))
    })

})
