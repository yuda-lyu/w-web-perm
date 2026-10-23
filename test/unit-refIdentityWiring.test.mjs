//正反關聯之被引用實體身分檢查: 前端接線之靜態站點守護(perm-run02 範圍一; 規則帳本 R-REF-IDENTITY-01、R-SUBJECT-ID-01 規則 4; ADR-037 Update(perm-run02))
//
//受測: 三清單頁(LayoutContentUsers／Grups／Pemis.vue)與兩反向對話框(VeGrupBlngUsers／VePemiBlngGrups.vue)對 src/js/refIdentity.mjs 之接線(靜態讀碼).
//純函式與伺服端行為見 test/unit-refIdentity.test.mjs、test/unit-procCore-identity.test.mjs、test/api-identity.test.mjs; 真瀏覽器行為(前端自檢零請求、伺服端強制)見 test/e2e-concurrent-edit.test.mjs E2E-025～036.
//
//規格(每條 assertion 註解標出對應句):
//  [W1] 三清單頁: 編輯器開啟前取「名稱 → id」快照(snapRefIds), 回填前 recordPicks 記下本次新增之啟用引用項, 回填(set)之後才改列; 重建草稿時 refPicks 歸零.
//  [W2] 三清單頁 doSave: 與 rows／baseline 同刻組宣告(buildRefDecl 以 baseRows 為舊), 前端先以 store 驗(countRefMismatch > 0 → 不送出、訊息框、早退), 於開 loading 之前; 送出帶 refs.
//  [W3] 兩對話框: subject 於 doSave 流程開頭取得並持有, saveXxx 以第 3 參帶入 RPC 之 { baseline, returnRows, subject }.
//  [W4] targets 頁不接(無授權引用欄; 帶了會被伺服端以 saveIdentityFormat 拒收).
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'


const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const code = (rel) => fs.readFileSync(path.join(projRoot, rel), 'utf8').replace(/\r\n/g, '\n').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
const count = (s, re) => (s.match(re) || []).length

const PAGES = [
    { fn: 'LayoutContentUsers', kt: 'users', api: 'updateUsers', field: 'cgrups', ref: 'vo.grups', editor: 'showVeCgrups' },
    { fn: 'LayoutContentGrups', kt: 'grups', api: 'updateGrups', field: 'cpemis', ref: 'vo.pemis', editor: 'showVeCpemis' },
    { fn: 'LayoutContentPemis', kt: 'pemis', api: 'updatePemis', field: 'crules', ref: 'vo.targets', editor: 'showVeCrules' },
]
const DLGS = [
    { fn: 'VeGrupBlngUsers', save: 'saveUsers', api: 'updateUsers' },
    { fn: 'VePemiBlngGrups', save: 'saveGrups', api: 'updateGrups' },
]


describe('unit-refIdentityWiring (被引用實體身分檢查之前端接線, 靜態)', function() {

    for (let p of PAGES) {
        let c = code(`src/components/${p.fn}.vue`)

        it(`RIW-1 ${p.fn}: 匯入 refIdentity 之五個函數; refPicks 於 created 與 rebuildDraft 各建立一次  [W1]`, function() {
            assert.ok(c.includes(`import { snapRefIds, recordPicks, buildRefDecl, parseRefDecl, countRefMismatch } from '../js/refIdentity.mjs'`))
            assert.strictEqual(count(c, /\bthis\.refPicks = new Map\(\)/g), 1, 'created 內建立')
            assert.strictEqual(count(c, /\bvo\.refPicks = new Map\(\)/g), 1, 'rebuildDraft 內歸零(重建即放棄未存編輯)')
        })

        it(`RIW-2 ${p.fn}: 編輯器(${p.editor})開啟前 snapRefIds('${p.kt}', ${p.ref}); 回填前 recordPicks, 次序 snap < showVeC < recordPicks < set(opt.rows[…].${p.field})  [W1]`, function() {
            let iSnap = c.indexOf(`snapRefIds('${p.kt}', ${p.ref})`)
            let iShow = c.indexOf(`vo.$dg.${p.editor}({`)
            let iRec = c.indexOf(`recordPicks({ keyTable: '${p.kt}'`)
            let iSet = c.indexOf('set(vo, `opt.rows[${krNow}].' + p.field + '`')
            assert.ok(iSnap > 0 && iShow > iSnap && iRec > iShow && iSet > iRec, JSON.stringify([iSnap, iShow, iRec, iSet]))
            assert.strictEqual(count(c, /\bsnapRefIds\(/g), 1)
            assert.strictEqual(count(c, /\brecordPicks\(/g), 1)
            assert.ok(c.includes(`strOld: get(vo, \`opt.rows[\${krNow}].${p.field}\`, '')`), '舊值取回填前該列之授權字串')
            assert.ok(c.includes('snap: refSnap, picks: vo.refPicks'), '以編輯器開啟當下快照與累積之選取記錄')
        })

        it(`RIW-3 ${p.fn}: doSave 內 buildRefDecl(以 vo.baseRows 為舊、vo.refPicks、被引用表 ${p.ref}) → countRefMismatch > 0 即 unlockBtn + showCheckYes(saveRefChanged, warning) + return, 全在 updateLoading(true) 之前; 送出帶 refs  [W2]`, function() {
            let iBuild = c.indexOf(`let refs = parseRefDecl(buildRefDecl({ keyTable: '${p.kt}', rowsNew: rows, rowsOld: vo.baseRows, picks: vo.refPicks, refRows: ${p.ref} }))`)
            let iChk = c.indexOf(`countRefMismatch({ keyTable: '${p.kt}', decl: refs, refRows: ${p.ref} }) > 0`)
            let iLoad = c.indexOf('vo.$ui.updateLoading(true)', iBuild)
            let iCall = c.indexOf(`vo.$fapi.${p.api}(rows, { baseline, returnRows: true, refs })`)
            assert.ok(iBuild > 0 && iChk > iBuild && iLoad > iChk && iCall > iLoad, JSON.stringify([iBuild, iChk, iLoad, iCall]))
            let blk = c.slice(iChk, iChk + 260)
            assert.ok(/unlockBtn\(\)\s*await vo\.\$dg\.showCheckYes\(vo\.\$t\('saveRefChanged'\), \{ type: 'warning' \}\)\s*return\s*\}/.test(blk), '不送出: 釋放按鈕鎖、警告型訊息框、早退')
            assert.strictEqual(count(c, /\bcountRefMismatch\(/g), 1)
            assert.strictEqual(count(c, /\bbuildRefDecl\(/g), 1)
        })
    }

    for (let d of DLGS) {
        let c = code(`src/components/${d.fn}.vue`)

        it(`RIW-4 ${d.fn}: ${d.save}(rows, baseline, subject) 以 { baseline, returnRows: true, subject } 送出; doSave 以 vo.${d.save}(…, baseline, subject) 呼叫(subject 於流程開頭取得並持有)  [W3]`, function() {
            assert.ok(new RegExp(`${d.save}: async function\\(rows, baseline, subject\\) \\{`).test(c))
            assert.ok(c.includes(`vo.$fapi.${d.api}(rows, { baseline, returnRows: true, subject })`))
            assert.ok(/let subject = vo\.subject\n/.test(c), 'doSave 開頭持有 subject')
            assert.ok(new RegExp(`vo\\.${d.save}\\(\\w+, baseline, subject\\)`).test(c))
            assert.strictEqual(count(c, /\bvo\.\$fapi\./g), 1, '只有一個 RPC 呼叫')
        })
    }

    it('RIW-5 targets 頁不帶 refs／subject(無授權引用欄; 帶了會被伺服端 saveIdentityFormat 拒收)  [W4]', function() {
        let c = code('src/components/LayoutContentTargets.vue')
        assert.ok(c.includes('vo.$fapi.updateTargets(rowsSend, { baseline, returnRows: true })'))
        assert.ok(!/refIdentity|refPicks|buildRefDecl|countRefMismatch/.test(c), '不匯入、不接線')
        assert.ok(!/updateTargets\([^)]*\b(refs|subject)\b/.test(c), '送出不帶 refs／subject')
    })
})
