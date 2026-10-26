//角色名稱統一為「系統管理者」之顯示文字與站點不變式(perm-run01 2026-10-26, 任務 20261026143318; 建議書 rddmanager Gitea #16: 使用者裁定全系統角色名稱統一, 本套件「管理使用者」欄位名原為「是否為系統管理員」)
//
//受測: server/procLang.mjs(isAdmin／userNotAdmin 之 cht 文字)、src/schema/tables/users.mjs(isAdmin 之 name)、src/ 與 server/ 之可執行碼(排除註解)
//述語(只改顯示文字, 不動欄位鍵名 isAdmin 與資料; 其他語系 eng 不動):
//  RN-001  procLang cht.isAdmin 為「是否為系統管理者」(「管理使用者」表格欄位標題之來源); eng.isAdmin 仍為 Administrator; 鍵名 isAdmin 仍存在
//  RN-002  schema users.settings.isAdmin.name 與 RN-001 之 cht 同字(兩處不得分歧), 鍵名 isAdmin 不變
//  RN-003  procLang cht.userNotAdmin(後台拒絕非管理者之訊息)為「僅系統管理者可存取或變更此資料」; eng 不動
//  RN-S1   src/、server/ 之可執行碼(.mjs／.js／.vue, 排除 // 與區塊註解)不得含「系統管理員」(建議書 §2 驗證 2、完成條件 1); 註解不在此限
//  RN-S2   掃描器自測: 對字串字面值、模板文字、.vue 腳本內之「系統管理員」必命中; 對 // 註解、JSDoc 不命中(防掃描器失效而假綠)
//跑法: npx mocha test/unit-roleName.test.mjs --reporter list --timeout 30000
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import procLang from '../server/procLang.mjs'
import usersTab from '../src/schema/tables/users.mjs'
import { sourceLines } from './tools/srcScan.mjs'

const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const A = assert.strict
const OLD = '系統管理員'
const NEW = '系統管理者'
const TMP_DIR = path.join(projRoot, 'test', '_tmp', 'unit-roleName')

//listCodeFiles: 遞迴列出 dir 下之 .mjs／.js／.vue(不含 node_modules)
let listCodeFiles = (dir) => {
    let out = []
    for (let ent of fs.readdirSync(dir, { withFileTypes: true })) {
        let fp = path.join(dir, ent.name)
        if (ent.isDirectory()) {
            if (ent.name !== 'node_modules') {
                out.push(...listCodeFiles(fp))
            }
        }
        else if (/\.(mjs|js|vue)$/.test(ent.name)) {
            out.push(fp)
        }
    }
    return out
}

//scanOld: 盤點可執行碼行(排除註解)含「系統管理員」者, 回傳 'rel:行號: 文字' 陣列
let scanOld = (files) => {
    let hits = []
    for (let fp of files) {
        for (let { no, text } of sourceLines(fp, 'code')) {
            if (text.includes(OLD)) {
                hits.push(`${path.relative(projRoot, fp).replace(/\\/g, '/')}:${no}: ${text.trim().slice(0, 80)}`)
            }
        }
    }
    return hits
}


describe('unit-roleName (角色名稱統一為「系統管理者」之顯示文字與站點, perm-run01 2026-10-26)', function() {

    after(function() {
        fs.rmSync(TMP_DIR, { recursive: true, force: true })
    })

    describe('顯示文字(RN-001～003)', function() {

        let LANG = procLang({})

        it('RN-001 procLang: cht.isAdmin 為「是否為系統管理者」、eng.isAdmin 不動、鍵名 isAdmin 仍存在  [建議書 §1; 欄位標題來源]', function() {
            A.ok(Object.prototype.hasOwnProperty.call(LANG.cht, 'isAdmin'), '鍵名 isAdmin 須仍存在')
            A.equal(LANG.cht.isAdmin, `是否為${NEW}`)
            A.equal(LANG.eng.isAdmin, 'Administrator', 'eng 不動')
        })

        it('RN-002 schema users: settings.isAdmin.name 與 procLang cht.isAdmin 同字、鍵名 isAdmin 不變  [建議書 §1 兩處同改]', function() {
            A.ok(Object.prototype.hasOwnProperty.call(usersTab.settings, 'isAdmin'), 'schema 鍵名 isAdmin 須仍存在')
            A.equal(usersTab.settings.isAdmin.name, `是否為${NEW}`)
            A.equal(usersTab.settings.isAdmin.name, LANG.cht.isAdmin, '兩處不得分歧')
            A.equal(usersTab.settings.isAdmin.type, 'STRING', '欄位型別不變(只改顯示文字)')
        })

        it('RN-003 procLang: cht.userNotAdmin 為「僅系統管理者可存取或變更此資料」、eng 不動  [任務範圍 3: 使用者看得到之訊息]', function() {
            A.equal(LANG.cht.userNotAdmin, `僅${NEW}可存取或變更此資料`)
            A.equal(LANG.eng.userNotAdmin, 'Only system administrators can access or change this data', 'eng 不動')
        })

        it('RN-003b 全部 cht 語系文字不含「系統管理員」(同源顯示文字全掃)', function() {
            let bad = Object.keys(LANG.cht).filter((k) => typeof LANG.cht[k] === 'string' && LANG.cht[k].includes(OLD))
            A.deepEqual(bad, [], `含舊稱之語系鍵: ${bad.join(', ')}`)
        })

    })

    describe('站點(RN-S1／S2)', function() {

        it('RN-S1 src/、server/ 之可執行碼(排除註解)不含「系統管理員」  [建議書 §2 驗證 2; 完成條件 1]', function() {
            let files = [...listCodeFiles(path.join(projRoot, 'src')), ...listCodeFiles(path.join(projRoot, 'server'))]
            A.ok(files.length > 50, `盤點檔數應遠多於 50(實得 ${files.length}), 否則掃描範圍失效`)
            let hits = scanOld(files)
            A.deepEqual(hits, [], `可執行碼仍含舊稱:\n${hits.join('\n')}`)
        })

        it('RN-S2 掃描器自測: 字串字面值／模板文字／.vue 腳本內之舊稱必命中, // 註解與 JSDoc 不命中', function() {
            fs.mkdirSync(TMP_DIR, { recursive: true })
            let fpMjs = path.join(TMP_DIR, 'fx.mjs')
            let fpVue = path.join(TMP_DIR, 'fx.vue')
            fs.writeFileSync(fpMjs, [
                `//註解內之${OLD}不計`,
                '/**',
                ` * JSDoc 內之${OLD}不計`,
                ' */',
                `let a = '字串內之${OLD}'`, //命中 1(行 5)
                `let b = \`模板內之${OLD}\``, //命中 2(行 6)
                `let c = 1 //行尾註解之${OLD}不計`,
                '',
            ].join('\n'))
            fs.writeFileSync(fpVue, [
                '<template>',
                `    <div>${OLD}</div>`, //命中 3(行 2)
                '</template>',
                '<script>',
                `    //腳本註解之${OLD}不計`,
                `    let d = \`${OLD}\``, //命中 4(行 6)
                '</script>',
                '',
            ].join('\n'))
            let hits = scanOld([fpMjs, fpVue])
            A.equal(hits.length, 4, `應命中 4 行, 實得 ${hits.length}: ${hits.join(' | ')}`)
            A.ok(hits.some((h) => h.includes('fx.mjs:5:')) && hits.some((h) => h.includes('fx.mjs:6:')))
            A.ok(hits.some((h) => h.includes('fx.vue:2:')) && hits.some((h) => h.includes('fx.vue:6:')))
        })

    })

})
