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
//  [W5] perm-run03(宣告強制必帶＋移除亦須宣告; R-REF-IDENTITY-01 規則 7): src/js/refIdentity.mjs 之 recordPicks 與 buildRefDecl 都處理「移除」——
//       buildRefDecl 以 collectChangedNames（新增∪移除）取名稱, 不再以 collectNewNames; collectChangedNames 內含 removedActiveNames; recordPicks 對「舊值啟用而新值不再啟用」者另記選取;
//       伺服端 checkRefIdentity 以 collectChangedNames 判定「是否改變引用」（必帶）, 且 procCore 同時傳入 decl 與 subject; 前端三清單頁不自行以 collectNewNames 組宣告（單一擁有者 refIdentity）;
//       清單頁送出一律帶 refs（即使為 []）, 兩反向對話框送出一律帶 subject——兩者皆為「合規客戶端」, 不會因強制必帶被伺服端以 saveIdentityRequired 拒收.
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

    //——— perm-run03 [W5]: 「移除」之處理（宣告強制必帶＋移除亦須宣告）———
    //funcBody: 取 refIdentity.mjs（去註解行）內某具名函數之本體（自 `function name(` 起至下一個頂層 `\n}\n`）
    const idnCode = code('src/js/refIdentity.mjs')
    const funcBody = (name) => {
        let i = idnCode.indexOf(`function ${name}(`)
        assert.ok(i >= 0, `refIdentity.mjs 應有 function ${name}(`)
        let j = idnCode.indexOf('\n}\n', i)
        assert.ok(j > i, `${name} 本體應可截取`)
        return idnCode.slice(i, j + 2)
    }

    it('RIW-6 refIdentity.mjs: buildRefDecl 以 collectChangedNames（新增∪移除）取宣告名稱, 不用 collectNewNames; collectChangedNames 內含 newActiveNames 與 removedActiveNames  [W5]', function() {
        let b = funcBody('buildRefDecl')
        assert.strictEqual(count(b, /\bcollectChangedNames\(/g), 1, 'buildRefDecl 內恰一處 collectChangedNames(')
        assert.strictEqual(count(b, /\bcollectNewNames\(/g), 0, 'buildRefDecl 不得只取新增集合（會漏掉移除）')
        let c = funcBody('collectChangedNames')
        assert.strictEqual(count(c, /\bnewActiveNames\(/g), 1)
        assert.strictEqual(count(c, /\bremovedActiveNames\(/g), 1, 'collectChangedNames 須含移除')
        let r = funcBody('removedActiveNames')
        assert.ok(/activeNames\(rowOld\[t\.field\]/.test(r) && /activeNames\(rowNew\[t\.field\]/.test(r), 'removedActiveNames 以舊值啟用項 − 新值啟用項計')
        assert.ok(/!isPlain\(rowOld\)/.test(r), '舊列非物件（新增列）不產生移除')
    })

    it('RIW-7 refIdentity.mjs: recordPicks 對「舊值啟用而新值不再啟用」另記選取（移除／停用）, 與新增共用同一份 rec 記錄與衝突語意  [W5]', function() {
        let b = funcBody('recordPicks')
        assert.strictEqual(count(b, /\bwas\.forEach\(/g), 1, '另有一圈走訪舊值啟用項')
        assert.ok(/was\.forEach\(\(n\) => \{\s*if \(!now\.has\(n\)\) \{\s*rec\(n\)/.test(b), '舊值啟用且新值不再啟用者 → rec(n)')
        assert.ok(/now\.forEach\(\(n\) => \{\s*if \(!was\.has\(n\)\) \{\s*rec\(n\)/.test(b), '新增之啟用項 → rec(n)（同一個 rec: 共用衝突語意）')
        assert.strictEqual(count(b, /\brec\(n\)/g), 2, '新增與移除各一處, 皆經同一個 rec')
        assert.strictEqual(count(b, /const rec|let rec/g), 1, 'rec 單一定義')
    })

    it('RIW-8 refIdentity.mjs: checkRefIdentity 以 collectChangedNames 判定是否改變引用（必帶）, 且不再使用 collectNewNames; decl 與 subject 皆 null 才走必帶  [W5]', function() {
        let b = funcBody('checkRefIdentity')
        assert.strictEqual(count(b, /\bcollectChangedNames\(/g), 1)
        assert.strictEqual(count(b, /\bcollectNewNames\(/g), 0)
        assert.ok(/decl === null && subject === null/.test(b), '必帶判定條件')
        assert.ok(b.indexOf('saveIdentityRequired') > 0 && b.indexOf('saveIdentityRequired') < b.indexOf('countRefMismatch('), '必帶判定在不符判定之前, 且不需讀 refRows')
        assert.ok(/function checkRefIdentity\(\{ keyTable, decl, subject = null, rowsNew, rowsOld, refRows \}\)/.test(idnCode), '新簽名: { keyTable, decl, subject = null, rowsNew, rowsOld, refRows }')
    })

    it('RIW-9 伺服端 procCore: 呼叫 checkRefIdentity 同時傳 decl 與 subject（無單獨只傳 decl 之舊簽名）; 三清單頁與兩對話框不自行取 collectNewNames／removedActiveNames（單一擁有者 refIdentity）  [W5]', function() {
        let s = code('server/procCore.mjs')
        assert.strictEqual(count(s, /\bcheckRefIdentity\(/g), 1)
        assert.ok(/checkRefIdentity\(\{ keyTable, decl: refDecl, subject, /.test(s))
        for (let rel of ['LayoutContentUsers', 'LayoutContentGrups', 'LayoutContentPemis', 'VeGrupBlngUsers', 'VePemiBlngGrups']) {
            let c = code(`src/components/${rel}.vue`)
            assert.ok(!/collectNewNames|removedActiveNames|collectChangedNames|newActiveNames/.test(c), `${rel} 不自行組新增／移除集合`)
        }
    })

    for (let p of PAGES) {
        it(`RIW-10 ${p.fn}: 送出一律帶 refs（無論是否改變引用; 強制必帶之合規客戶端）, 且 refs 取自 parseRefDecl(buildRefDecl(…)) 而非條件式略過  [W5]`, function() {
            let c = code(`src/components/${p.fn}.vue`)
            assert.strictEqual(count(c, new RegExp(`vo\\.\\$fapi\\.${p.api}\\(rows, \\{ baseline, returnRows: true, refs \\}\\)`, 'g')), 1)
            assert.strictEqual(count(c, /let refs = parseRefDecl\(buildRefDecl\(/g), 1)
            assert.ok(!/refs\s*=\s*(undefined|null)\b/.test(c) && !/\?\s*\{\s*baseline,\s*returnRows:\s*true,\s*refs\s*\}\s*:/.test(c), '不得有條件式省略 refs 之寫法')
        })
    }
})
