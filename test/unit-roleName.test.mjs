//角色名稱統一為「系統管理者」之顯示文字與站點不變式
//來源: perm-run01(2026-10-26, 任務 20261026143318; 建議書 rddmanager Gitea #16)改欄位名「是否為系統管理者」; perm-run02(2026-10-26)依使用者 2026-10-26 裁示擴及全 repo——
//  指系統管理者角色之詞一律為「系統管理者」(舊稱「系統管理」後接「員」者、單獨之「管理」後接「員」者、單獨之「管理＋者」皆改), 與 w-web-sso／w-web-api／w-web-task 同; 英文等其他語系、欄位鍵名 isAdmin、程式識別字、資料不動.
//
//受測: server/procLang.mjs(isAdmin／userNotAdmin／anUnexpectedErrorOccurred／srcKeyConflict 之 cht 文字)、src/schema/tables/users.mjs(isAdmin 之 name)、src/ 與 server/ 之可執行碼、git 追蹤之全部文字檔
//述語:
//  RN-001  procLang cht.isAdmin 為「是否為系統管理者」(「管理使用者」表格欄位標題之來源); eng.isAdmin 仍為 Administrator; 鍵名 isAdmin 仍存在
//  RN-002  schema users.settings.isAdmin.name 與 RN-001 之 cht 同字(兩處不得分歧), 鍵名 isAdmin 不變
//  RN-003  procLang cht.userNotAdmin(後台拒絕非系統管理者之訊息)為「僅系統管理者可存取或變更此資料」; eng 不動
//  RN-003b procLang 全部 cht 文字: 不含舊稱; 「管理＋者」之前一律為「系統」
//  RN-003c 無「系統」前綴之舊稱訊息已統一: cht.anUnexpectedErrorOccurred 為「發生非預期錯誤，請洽系統管理者」、cht.srcKeyConflict 末句為「請聯絡系統管理者處置」; eng 不動
//  RN-S1   src/、server/、srv.mjs 之可執行碼(排除 // 與區塊註解): 不含舊稱、「管理＋者」之前一律為「系統」
//  RN-S2   掃描器自測: 對舊稱(含單獨舊稱)、單獨「管理＋者」必命中; 對「系統管理者」不命中; 區塊與 // 註解依模式處理(防掃描器失效而假綠)
//  RN-S3   git 追蹤之全部文字檔(含註解、README、spec、sgud、docs、dist、測試): 舊稱 0 處、單獨「管理＋者」0 處(完成條件: git grep 舊稱為 0, 「管理＋者」每處皆為「系統管理者」)
//跑法: npx mocha test/unit-roleName.test.mjs --reporter list --timeout 60000
//註: 本檔以拆開之片段組出舊稱(OLD_A／OLD_B), 不寫成字面值, 否則本檔自身即違反 RN-S3.
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import procLang from '../server/procLang.mjs'
import usersTab from '../src/schema/tables/users.mjs'
import { sourceLines } from './tools/srcScan.mjs'

const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const A = assert.strict
const SYS = '系統'
const OLD_B = '管理' + '員' //舊稱(單獨)
const OLD_A = SYS + OLD_B //舊稱(含「系統」前綴)
const ZE = '管理' + '者'
const NEW = SYS + ZE
const TMP_DIR = path.join(projRoot, 'test', '_tmp', 'unit-roleName')
const TEXT_EXT = new Set(['.mjs', '.js', '.vue', '.md', '.html', '.json', '.txt', '.log', '.patch', '.css', '.tmp', '.map', '.cjs', '.ts', '.yml', '.yaml'])

//scanText: 回傳文字中 舊稱(任何形式)次數、單獨「管理＋者」(前一字串非「系統」)次數
let scanText = (s) => {
    let old = (s.match(new RegExp(OLD_B, 'g')) || []).length
    let bare = (s.match(new RegExp(`(?<!${SYS})${ZE}`, 'g')) || []).length
    return { old, bare }
}

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

//scanCode: 盤點可執行碼行(排除註解)含舊稱或單獨「管理＋者」者, 回傳 'rel:行號: 文字' 陣列
let scanCode = (files) => {
    let hits = []
    for (let fp of files) {
        for (let { no, text } of sourceLines(fp, 'code')) {
            let r = scanText(text)
            if (r.old > 0 || r.bare > 0) {
                hits.push(`${path.relative(projRoot, fp).replace(/\\/g, '/')}:${no}: ${text.trim().slice(0, 80)}`)
            }
        }
    }
    return hits
}

//listTracked: git 追蹤之檔案(非 git 環境時退回遞迴列舉主要目錄); 排除標準圖、資料庫、node_modules、暫存
let listTracked = () => {
    let rels = []
    try {
        rels = execFileSync('git', ['ls-files', '-z'], { cwd: projRoot, encoding: 'buffer', maxBuffer: 1 << 28 }).toString('utf8').split('\0').filter((s) => s)
    }
    catch (err) {
        let walk = (dir) => {
            for (let ent of fs.readdirSync(path.join(projRoot, dir), { withFileTypes: true })) {
                let rel = `${dir}/${ent.name}`
                if (ent.isDirectory()) {
                    if (!['node_modules', 'pics', '_tmp', 'db'].includes(ent.name)) {
                        walk(rel)
                    }
                }
                else {
                    rels.push(rel)
                }
            }
        }
        for (let d of ['src', 'server', 'test', 'spec', 'sgud', 'docs', 'dist', 'toolg']) {
            if (fs.existsSync(path.join(projRoot, d))) {
                walk(d)
            }
        }
        rels.push(...['README.md', 'srv.mjs', 'SECURITY.md'].filter((f) => fs.existsSync(path.join(projRoot, f))))
    }
    return rels.filter((rel) => TEXT_EXT.has(path.extname(rel).toLowerCase()) && !/^(db|node_modules|test\/pics|test\/_tmp|tmp)\//.test(rel))
}


describe('unit-roleName (角色名稱統一為「系統管理者」之顯示文字與站點, perm-run01／perm-run02 2026-10-26)', function() {

    this.timeout(60000)

    after(function() {
        fs.rmSync(TMP_DIR, { recursive: true, force: true })
    })

    describe('顯示文字(RN-001～003c)', function() {

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

        it('RN-003 procLang: cht.userNotAdmin 為「僅系統管理者可存取或變更此資料」、eng 不動  [perm-run01 範圍 3: 使用者看得到之訊息]', function() {
            A.equal(LANG.cht.userNotAdmin, `僅${NEW}可存取或變更此資料`)
            A.equal(LANG.eng.userNotAdmin, 'Only system administrators can access or change this data', 'eng 不動')
        })

        it('RN-003b procLang 全部 cht 文字: 不含舊稱; 「管理＋者」之前一律為「系統」(同源顯示文字全掃)', function() {
            let bad = Object.keys(LANG.cht).filter((k) => {
                let v = LANG.cht[k]
                if (typeof v !== 'string') {
                    return false
                }
                let r = scanText(v)
                return r.old > 0 || r.bare > 0
            })
            A.deepEqual(bad, [], `含舊稱或單獨「管理＋者」之語系鍵: ${bad.join(', ')}`)
        })

        it('RN-003c 無「系統」前綴之舊稱訊息已統一(使用者 2026-10-26 裁示); eng 不動', function() {
            A.equal(LANG.cht.anUnexpectedErrorOccurred, `發生非預期錯誤，請洽${NEW}`)
            A.equal(LANG.eng.anUnexpectedErrorOccurred, 'An unexpected error occurred, please contact the administrator', 'eng 不動')
            A.ok(LANG.cht.srcKeyConflict.endsWith(`請聯絡${NEW}處置`), `實得: ${LANG.cht.srcKeyConflict}`)
            A.ok(LANG.eng.srcKeyConflict.endsWith('Please contact the administrator'), 'eng 不動')
        })

    })

    describe('站點(RN-S1～S3)', function() {

        it('RN-S1 src/、server/、srv.mjs 之可執行碼(排除註解)不含舊稱、「管理＋者」前一律為「系統」', function() {
            let files = [...listCodeFiles(path.join(projRoot, 'src')), ...listCodeFiles(path.join(projRoot, 'server')), path.join(projRoot, 'srv.mjs')]
            A.ok(files.length > 50, `盤點檔數應遠多於 50(實得 ${files.length}), 否則掃描範圍失效`)
            let hits = scanCode(files)
            A.deepEqual(hits, [], `可執行碼仍含舊稱:\n${hits.join('\n')}`)
        })

        it('RN-S2 掃描器自測: 字串字面值／模板文字／.vue 腳本內之舊稱與單獨「管理＋者」必命中, // 註解與 JSDoc 於 code 模式不命中, 「系統管理者」不命中', function() {
            let r1 = scanText(`${OLD_A}、非${OLD_B}、${NEW}、後台${ZE}`)
            A.deepEqual(r1, { old: 2, bare: 1 }, '含舊稱之 2 處(系統前綴者與單獨者)與單獨「管理＋者」之 1 處')
            let r2 = scanText(`${NEW}／${NEW}`)
            A.deepEqual(r2, { old: 0, bare: 0 }, '「系統管理者」不命中')
            fs.mkdirSync(TMP_DIR, { recursive: true })
            let fpMjs = path.join(TMP_DIR, 'fx.mjs')
            let fpVue = path.join(TMP_DIR, 'fx.vue')
            fs.writeFileSync(fpMjs, [
                `//註解內之${OLD_A}不計`,
                '/**',
                ` * JSDoc 內之${OLD_B}不計`,
                ' */',
                `let a = '字串內之${OLD_A}'`, //命中 1(行 5)
                `let b = \`模板內之${OLD_B}\``, //命中 2(行 6)
                `let c = 1 //行尾註解之${OLD_A}不計`,
                `let d = '單獨之${ZE}'`, //命中 3(行 8)
                `let e = '${NEW}'`, //不命中
                '',
            ].join('\n'))
            fs.writeFileSync(fpVue, [
                '<template>',
                `    <div>${OLD_B}</div>`, //命中 4(行 2)
                '</template>',
                '<script>',
                `    //腳本註解之${OLD_A}不計`,
                `    let f = \`${OLD_A}\``, //命中 5(行 6)
                '</script>',
                '',
            ].join('\n'))
            let hits = scanCode([fpMjs, fpVue])
            A.equal(hits.length, 5, `應命中 5 行, 實得 ${hits.length}: ${hits.join(' | ')}`)
            for (let k of ['fx.mjs:5:', 'fx.mjs:6:', 'fx.mjs:8:', 'fx.vue:2:', 'fx.vue:6:']) {
                A.ok(hits.some((h) => h.includes(k)), `應含 ${k}`)
            }
        })

        it('RN-S3 git 追蹤之全部文字檔(含註解、README、spec、sgud、docs、dist、測試): 舊稱 0 處、單獨「管理＋者」0 處  [完成條件: 全 repo 用詞統一]', function() {
            let rels = listTracked()
            A.ok(rels.length > 300, `盤點檔數應遠多於 300(實得 ${rels.length}), 否則掃描範圍失效`)
            let hits = []
            let nScanned = 0
            for (let rel of rels) {
                let fp = path.join(projRoot, rel)
                if (!fs.existsSync(fp)) {
                    continue //已刪除而尚未提交者
                }
                let b = fs.readFileSync(fp)
                nScanned++
                let s = b.toString(b.includes(0) ? 'latin1' : 'utf8')
                if (b.includes(0)) {
                    //含 NUL 之檔(如帶控制字元之 log)以 UTF-8 位元組樣式比對
                    let toLatin1 = (t) => Buffer.from(t, 'utf8').toString('latin1')
                    let rOld = (s.match(new RegExp(toLatin1(OLD_B), 'g')) || []).length
                    let rBare = (s.match(new RegExp(`(?<!${toLatin1(SYS)})${toLatin1(ZE)}`, 'g')) || []).length
                    if (rOld > 0 || rBare > 0) {
                        hits.push(`${rel}: 舊稱 ${rOld}／單獨「管理＋者」 ${rBare}`)
                    }
                    continue
                }
                let r = scanText(s)
                if (r.old > 0 || r.bare > 0) {
                    hits.push(`${rel}: 舊稱 ${r.old}／單獨「管理＋者」 ${r.bare}`)
                }
            }
            A.ok(nScanned > 300, `實際掃描檔數 ${nScanned}`)
            A.deepEqual(hits, [], `仍含舊稱或單獨「管理＋者」之檔:\n${hits.slice(0, 40).join('\n')}`)
        })

    })

})
