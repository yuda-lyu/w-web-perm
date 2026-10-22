//run07 外審 sol R1／R2 之前端站點守護(靜態, 讀 .vue 原始碼文字): 真實行為(編輯器開著時他人改列→回填被放棄; 存檔中再次 show() 不改寫新實體)由 e2e 與 Node 內 harness 驗證, 此處守護接線不被回退.
//規格來源: tmp/run07/design-digest.md 第 3 點「推播不得替舊草稿換新基準」; 外審 R1(直接指派編輯器之回填)、R2(對話框存檔期間重開).
//輸入空間: 站點 5(三個清單頁之 show 編輯器方法 × 兩個反向對話框之 doSave)× 守護項(R1: 3 項／頁; R2: 5 項／對話框), 全測;
//刻意不測: 瀏覽器內實際互動(e2e), 四清單頁中 Targets 無指派編輯器.

import fs from 'fs'
import path from 'path'
import assert from 'assert'

let read = (rel) => fs.readFileSync(path.resolve(rel), 'utf8').replace(/\r\n/g, '\n')

//region: 取 from 起至 to 之前之文字
let region = (txt, from, to) => {
    let i0 = txt.indexOf(from)
    assert.ok(i0 >= 0, `找不到區段起點 ${from}`)
    let i1 = txt.indexOf(to, i0 + from.length)
    assert.ok(i1 > i0, `找不到區段終點 ${to}`)
    return txt.slice(i0, i1)
}


describe('unit-sitesStale (外審 R1／R2 之前端站點守護)', function() {

    for (let [rel, fn, nextFn, show, field] of [
        ['src/components/LayoutContentUsers.vue', 'showVeCgrupsById: function(id)', 'saveUsers: function', 'showVeCgrups', 'cgrups'],
        ['src/components/LayoutContentGrups.vue', 'showVeCpemisById: function(id)', 'saveGrups: function', 'showVeCpemis', 'cpemis'],
        ['src/components/LayoutContentPemis.vue', 'showVeCrulesById: function(id)', 'savePemis: function', 'showVeCrules', 'crules'],
    ]) {
        it(`SITE-ST-R1 ${path.basename(rel)}: 開啟指派編輯器前記下該列基準指紋, 回填前比對, 變動即放棄回填並提示 saveStale`, function() {
            let txt = read(rel)
            assert.ok(txt.includes(`import { makeBaseline, getBaselineDigest } from '../js/rowDigest.mjs'`), '須匯入 getBaselineDigest')
            let b = region(txt, fn, nextFn)
            let iDg0 = b.indexOf('let dg0 = getBaselineDigest(vo.baseline, id)')
            let iShow = b.indexOf(`vo.$dg.${show}(`)
            let iCmp = b.indexOf('if (getBaselineDigest(vo.baseline, id) !== dg0) {')
            let iSet = b.indexOf(`set(vo, \`opt.rows[\${krNow}].${field}\``)
            assert.ok(iDg0 >= 0 && iShow > iDg0, 'dg0 須於開啟編輯器之前取得')
            assert.ok(iCmp > iShow && iSet > iCmp, '比對須在回填(set)之前、編輯器 then 內')
            assert.ok(b.slice(iCmp, iSet).includes("vo.$t('saveStale')") && b.slice(iCmp, iSet).includes('return'), '指紋變動須提示 saveStale 並放棄回填')
        })
    }

    for (let [rel, ent, nameVar, logName] of [
        ['src/components/VeGrupBlngUsers.vue', 'grup', 'grupName', 'usersNew'],
        ['src/components/VePemiBlngGrups.vue', 'pemi', 'pemiName', 'grupsNew'],
    ]) {
        it(`SITE-ST-R2 ${path.basename(rel)}: doSave 於開頭取得名稱與 pm, 之後不再讀 vo.${ent}.name／vo.pm, 舊流程不得關閉新視窗, 不再 console.log 整表`, function() {
            let txt = read(rel)
            let d = region(txt, 'doSave: function(opt = {}) {', 'clickClose: function() {')
            assert.ok(d.includes('let pmDlg = vo.pm'), '須於開頭取得 pmDlg')
            let iAwait = d.split('\n').findIndex((ln) => !/^\s*\/\//.test(ln) && /\bawait\b/.test(ln.replace(/\/\/.*$/, '')))
            let iPm = d.split('\n').findIndex((ln) => ln.includes('let pmDlg = vo.pm'))
            assert.ok(iAwait > 0 && iPm >= 0 && iPm < iAwait, 'pmDlg 須在任何(非註解)await 之前取得')
            assert.ok(d.includes(`let ${nameVar} = get(vo, '${ent}.name', '')`), `須取得 ${nameVar}`)
            assert.ok(d.indexOf(`let ${nameVar} =`) < d.indexOf('await delay('), `${nameVar} 須在 await delay 之前取得`)
            assert.strictEqual(d.split(`get(vo, '${ent}.name', '')`).length - 1, 1, `doSave 內只可讀一次 vo.${ent}.name`)
            assert.ok(d.includes('pmDlg.resolve(rows)') && !d.includes('vo.pm.resolve(rows)'), '須 resolve 自己之 pmDlg')
            assert.ok(/if \(vo\.pm === pmDlg\) \{[^}]*vo\.bShow = false/.test(d), '僅當視窗未被取代才關閉')
            assert.ok(!d.includes(`console.log('${logName}'`), '不得 console.log 送出之整表(含 email)')
        })
    }

})
