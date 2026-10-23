//四清單頁之機械式相同改動(perm-run01): 以 assert 保證每個樣式在每檔恰好命中預期次數, 否則整檔不寫入
import fs from 'fs'
import assert from 'assert'

const DIR = 'C:/opensrc/開源-JS-411-8-w-web-perm/w-web-perm/src/components/'
const PAGES = [
    { f: 'LayoutContentGrups.vue', t: 'grups', fapi: 'updateGrups' },
    { f: 'LayoutContentPemis.vue', t: 'pemis', fapi: 'updatePemis' },
    { f: 'LayoutContentTargets.vue', t: 'targets', fapi: 'updateTargets' },
    { f: 'LayoutContentUsers.vue', t: 'users', fapi: 'updateUsers' },
]

function rep(s, find, to, n, label) {
    let cnt = s.split(find).length - 1
    assert.strictEqual(cnt, n, `${label}: expected ${n} got ${cnt}`)
    return s.split(find).join(to)
}

function repRe(s, re, to, n, label) {
    let m = s.match(re)
    let cnt = m ? m.length : 0
    assert.strictEqual(cnt, n, `${label}: expected ${n} got ${cnt}`)
    return s.replace(re, to)
}

for (let p of PAGES) {
    let path = DIR + p.f
    let s = fs.readFileSync(path, 'utf8')
    let crlf = s.includes('\r\n')
    if (crlf) {
        s = s.replace(/\r\n/g, '\n')
    }

    if (s.includes(`from '../js/applySaved.mjs'`)) {
        console.log('skip (already patched)', p.f)
        continue
    }

    //T1 imports
    s = rep(s,
        `import { refsChanged, planDraftSync, isDraftStale } from '../js/draftSync.mjs'\n`,
        `import { refsChanged, planDraftSync, isDraftStale, hasDraftNow } from '../js/draftSync.mjs'\nimport { applySavedRows } from '../js/applySaved.mjs'\nimport { isCellEditing, bindCellEditingStopRetry } from '../js/cellEditing.mjs'\n`,
        1, `${p.f} T1`)

    //T2 hasDraft
    s = rep(s,
        `hasDraft: () => vo.syncMark.dirty === true,`,
        `hasDraft: () => hasDraftNow({ dirty: vo.syncMark.dirty === true, editing: isCellEditing(get(vo, '$refs.rftable', null)) }), //未存修改, 或儲存格編輯器開啟中(已輸入、未按 Enter; 第 115 項, R-DRAFT-KEEP-01 規則 10)`,
        1, `${p.f} T2`)

    //T3 isDraftStale(keys → keyTable)
    s = repRe(s, /isDraftStale\(\{ keys: vo\.\$ds\.(\w+)\.keys,/g, `isDraftStale({ keyTable: '$1',`, p.t === 'targets' ? 2 : 3, `${p.f} T3`)

    //T4 makeBaseline(keys → keyTable)
    s = repRe(s, /makeBaseline\((\w+), vo\.\$ds\.(\w+)\.keys\)/g, `makeBaseline($1, '$2')`, 1, `${p.f} T4`)

    //T5 rebuildDraft 末尾綁定編輯結束監聽
    s = rep(s,
        `            //firstLoading\n            vo.firstLoading = false\n\n        },\n\n        curRefs: function() {`,
        `            //firstLoading\n            vo.firstLoading = false\n\n            //第 115 項: 重建後元件可能重建, 對新的 ag-grid 重綁「儲存格編輯結束」監聽(同一 api 只綁一次)\n            vo.$nextTick(() => {\n                vo.bindEditing()\n            })\n\n        },\n\n        curRefs: function() {`,
        1, `${p.f} T5`)

    //T6 bindEditing／afterEditing
    s = rep(s,
        `        reloadDraft: function() {`,
        `        bindEditing: function() {\n            //第 115 項(R-DRAFT-KEEP-01 規則 10): 儲存格編輯器開啟中視為有草稿(changeParams 的 hasDraft 以 ag-grid 的 getEditingCells 判定); 編輯結束(提交、Esc、失焦)時補做保留期間跳過之重建\n            let vo = this\n            bindCellEditingStopRetry(() => get(vo, '$refs.rftable', null), () => {\n                vo.afterEditing()\n            })\n        },\n\n        afterEditing: function() {\n            //儲存格編輯結束: 無未存修改(isModified 為假; 提交者此刻已由 rowsChange 設為真)而 store 於編輯期間已變新者, 補上一次重建; 有未存修改者維持保留(isModified 的 watch 於儲存或放棄後補重建)\n            let vo = this\n            if (vo.isModified !== true && vo.syncMark.refs !== null && refsChanged(vo.syncMark.refs, vo.curRefs())) {\n                vo.reloadDraft()\n            }\n        },\n\n        reloadDraft: function() {`,
        1, `${p.f} T6`)

    //T7 存檔: 帶 returnRows, 取回傳
    s = repRe(s,
        new RegExp(`await vo\\.\\$fapi\\.${p.fapi}\\((rows|rowsSend), \\{ baseline \\}\\)\\n( *)\\.then\\(\\(\\) => \\{\\n( *)okSave = true\\n`, 'g'),
        (m, arg, sp1, sp2) => `await vo.$fapi.${p.fapi}(${arg}, { baseline, returnRows: true })\n${sp1}.then((res) => {\n${sp2}okSave = true\n${sp2}savedRes = res\n`,
        1, `${p.f} T7a`)
    s = rep(s,
        `                let okSave = false\n                vo.saveMark.saving = true`,
        `                let okSave = false\n                let savedRes = null //伺服端回傳(成功 msg key 字串, 或 { msg, rows, others }: 寫入後之列, 鎖內新鮮讀取; 規格第 8 節)\n                vo.saveMark.saving = true`,
        1, `${p.f} T7b`)

    //T8 成功後立即套用
    s = repRe(s, /( *)vo\.isModified = false\n(\n? *\/\/alert|\n *\/\/alert)/g,
        (m, sp, tail) => `${sp}vo.isModified = false\n${sp}vo.syncMark.dirty = false //watch 為非同步, 此處同步歸零: 下面 commit 引起之 changeParams 重算須視為「無草稿」而重建\n${sp}\n${sp}//存檔成功後新基準取自伺服端且須立即取得(規格第 8 節; R-SAVED-ROWS-01): 以回傳之寫入後之列(鎖內新鮮讀取)更新 store, 本頁依既有流程以之重建畫面與基準;\n${sp}//其後抵達之同內容推播摘要相同, 不視為他人更新. 不以自己送出之值當新基準(clearXSS 等會改寫字串). 回傳不含列(舊伺服端、讀回失敗)時退回等推播\n${sp}applySavedRows('${p.t}', savedRes, (t, rs) => vo.$store.commit(vo.$store.types.UpdateTableData, { tableName: t, data: rs }))\n${tail}`,
        1, `${p.f} T8`)

    if (crlf) {
        s = s.replace(/\n/g, '\r\n')
    }
    fs.writeFileSync(path, s, 'utf8')
    console.log('patched', p.f)
}
