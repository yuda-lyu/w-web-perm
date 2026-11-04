//離線維運工具之出貨完整性單元測試(run08; 主控定案 3: 離線工具核心搬出 test/tools, 使 npm 套件安裝後可執行)
//
//受測: 離線維運工具 g_authRefsClean.mjs／g_purgeFrom.mjs／g_fixFromType.mjs(專案根)與 server/tools/{authRefsAudit,authRefsClean,fromTools,nameDupReport,isMain}.mjs 之出貨範圍(npm pack 清單)與入口判斷.
//依據: C:/opensrcOper/dspec/自有套件之npm發布範圍.md——原則 1(npm 包＝git 版控之內容)、原則 4(test/tools/ 一律不排除)、「套件測試之 npm 包檢查」①(2026-11-02 使用者裁示 A).
//
//規格句:
//  ST-S1 npm 套件必須帶有上列工具檔; 出貨清單(npm pack --dry-run)不得含 dspec「不得入包」項(外部執行檔與壓縮檔〔.exe／.dll／.node／.msi／.zip／.7z／.gz／.tgz〕、bin/ 除 manifest.json 外之檔、CLAUDE*.md、tmp/、test/_tmp/、.env);
//        test/、spec/、sgud/、docs/、toolg/ 等 git 版控內容依原則 1 隨包, 本檔不斷言其不在(.npmignore 現僅依第 2 條排除 test/ 下 tools 以外之大型資料).
//        工具核心不得留在 test/tools(離線工具核心歸 server/tools 與 src/js, R-SHIP-TOOLS-01).
//  ST-S2 工具的相對 import 閉包(靜態 import／字面動態 import('./…'))內每個檔案都在出貨清單內, 且不在 test/、spec/ 之下——工具不得依賴 test/ 下的檔案(如 test/tools/dbHolder.mjs; test/tools 依原則 4 隨包出貨, 「在出貨清單內」擋不住, 故明確斷言)、spec/ 下的檔案, 也不得依賴被 .npmignore 排除之檔案;
//        閉包內出現掃描器無法靜態解析的載入(非字面 import()、require／createRequire)一律視為不合格(run08 外審 sol #4: 否則依賴會被靜默略過).
//  ST-S3 離線工具核心只依賴 src/js、server/ 與套件依賴(不 import test/、spec/): 以閉包檢查涵蓋(ST-S2).
//  ST-S4 (run08 外審 sol #5) 套件經 symlink／junction 安裝(npm link、pnpm、workspaces)時, node 以真實路徑載入入口模組而 process.argv[1] 維持命令列所給路徑;
//        CLI 區塊的進入判斷(server/tools/isMain.mjs)須兩邊取真實路徑比對, 否則 CLI 靜默不執行(無報告卻正常結束).
//
//輸入空間: 出貨清單{含工具 8 檔, 不含「不得入包」項〔外部執行檔／壓縮檔／bin 非 manifest／CLAUDE*.md／tmp／test/_tmp／.env〕} × 閉包根{5 個入口: 3 個 g_*.mjs＋authRefsAudit＋nameDupReport} 全測(閉包內檔另斷言不在 test/、spec/ 之下);
//  禁入判斷式負向對照(ST-002b: 各類禁入路徑必被標記, bin/manifest.json 與 test/、spec/、sgud/、docs/、toolg/ 等隨包項不被標記——防判斷式過鬆或復活對 test/、spec/ 之「不在」斷言);
//  掃描器負向對照(ST-004: 字面靜態／字面動態／副作用 import 被收錄, 註解內者不收, 非字面 import()／require／createRequire 被標記);
//  入口判斷(ST-005: 同檔經 junction 為真; 他檔、空值為假; 以 junction 安裝之套件路徑執行兩個 CLI 皆有輸出〔無參數印用法, 離開碼 2〕).
//  刻意不測: 出貨清單的其他檔案(與本議題無關); 工具實際執行(unit-fromAudit／unit-refAudit／unit-nameDupReport 以真 lmdb 臨時庫與子行程涵蓋); 以符號連結(非 junction)安裝(本環境 EPERM, 與 junction 同走 realpath 路徑).
//跑法: npx mocha test/unit-shipTools.test.mjs --reporter list --timeout 60000
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { execSync, spawnSync } from 'child_process'
import { fileURLToPath, pathToFileURL } from 'url'
import isMain from '../server/tools/isMain.mjs'


const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOOLS = [
    'g_authRefsClean.mjs',
    'g_purgeFrom.mjs',
    'g_fixFromType.mjs',
    'server/tools/authRefsAudit.mjs',
    'server/tools/authRefsClean.mjs',
    'server/tools/fromTools.mjs',
    'server/tools/nameDupReport.mjs',
    'server/tools/isMain.mjs',
]
const ROOTS = ['g_authRefsClean.mjs', 'g_purgeFrom.mjs', 'g_fixFromType.mjs', 'server/tools/authRefsAudit.mjs', 'server/tools/nameDupReport.mjs']
const dirTmp = path.join(projRoot, 'test', '_tmp', 'shipTools')


//packList: npm pack --dry-run --json 之出貨清單(正規化為 / 分隔之相對路徑集合); 新舊版 npm 輸出形狀不同(陣列／以套件名為鍵之物件)皆處理
let packList = () => {
    let out = execSync('npm pack --dry-run --json', { cwd: projRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024, windowsHide: true })
    let j = JSON.parse(out)
    let info = Array.isArray(j) ? j[0] : Object.values(j)[0]
    return new Set(info.files.map((f) => f.path.replace(/\\/g, '/')))
}

//isForbiddenInPack: dspec〈自有套件之npm發布範圍〉「套件測試之 npm 包檢查」①之「不得入包」: 外部執行檔與壓縮檔、bin/ 除 manifest.json 外之檔、CLAUDE*.md、tmp/、test/_tmp/、.env.
//  CLAUDE*.md／tmp／.env 與 .gitignore 同為不限層級之樣式; test/_tmp 為根錨定. test/、spec/、sgud/、docs/、toolg/ 等 git 版控內容依原則 1 隨包, 不在此列.
let isForbiddenInPack = (p) => {
    return /\.(exe|dll|node|msi|zip|7z|gz|tgz)$/i.test(p) ||
        (p.startsWith('bin/') && p !== 'bin/manifest.json') ||
        /(^|\/)CLAUDE[^/]*\.md$/.test(p) ||
        /(^|\/)tmp\//.test(p) ||
        p.startsWith('test/_tmp/') ||
        /(^|\/)\.env$/.test(p)
}

//isDevAsset: 測試與規格文件資產(test/、spec/); 離線維運工具之閉包不得落在其下
let isDevAsset = (p) => p.startsWith('test/') || p.startsWith('spec/')

//stripComments: 去掉區塊註解(行首起算)與行註解(// 前須為行首或空白, 以免誤傷字串內之 URL)
let stripComments = (text) => text.replace(/^\s*\/\*[\s\S]*?\*\//gm, '').split(/\r?\n/).map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n')

//scanImports: 回傳 { lits: 相對路徑之字面載入(靜態 from／副作用 import／字面動態 import), dyn: 無法靜態解析之載入標記 }
let scanImports = (text) => {
    let t = stripComments(text)
    let lits = []
    for (let m of t.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.[^'"]+)['"]/g)) {
        lits.push(m[1])
    }
    let dyn = []
    for (let m of t.matchAll(/\bimport\s*\(\s*(?!['"])([^)\n]{0,40})/g)) {
        dyn.push(`import(${m[1]}`)
    }
    for (let m of t.matchAll(/\b(?:require|createRequire)\b/g)) {
        dyn.push(m[0])
    }
    return { lits, dyn }
}

let relImports = (rel) => {
    let { lits, dyn } = scanImports(fs.readFileSync(path.join(projRoot, rel), 'utf8'))
    return { targets: lits.map((x) => path.posix.normalize(path.posix.join(path.posix.dirname(rel), x))), dyn }
}


describe('unit-shipTools (離線維運工具出貨完整性, run08)', function() {
    this.timeout(60000)

    let list = null
    before(function() {
        list = packList()
    })

    it('ST-001 出貨清單含全部離線工具檔(3 個 g_*.mjs＋server/tools 5 檔)', function() {
        for (let f of TOOLS) {
            assert.strict.ok(list.has(f), `出貨清單缺 ${f}`)
        }
        for (let f of ['g_getSettings.mjs', 'g_mOrm.mjs', 'src/js/refAudit.mjs', 'src/js/fromAudit.mjs', 'src/js/cvKpToArr.mjs']) {
            assert.strict.ok(list.has(f), `出貨清單缺工具所需之 ${f}`)
        }
    })

    it('ST-002 出貨清單不含 dspec 所列「不得入包」項(外部執行檔與壓縮檔、bin/ 非 manifest、CLAUDE*.md、tmp/、test/_tmp/、.env); 工具核心不得留在 test/tools  [dspec〈自有套件之npm發布範圍〉套件測試之 npm 包檢查①]', function() {
        let bad = [...list].filter(isForbiddenInPack)
        assert.strict.deepEqual(bad, [])
        for (let f of ['fromTools', 'authRefsClean', 'authRefsAudit', 'nameDupReport']) {
            assert.strict.equal(fs.existsSync(path.join(projRoot, `test/tools/${f}.mjs`)), false, `test/tools/${f}.mjs 不應存在(已搬至 server/tools)`)
        }
    })

    it('ST-002b 禁入判斷式負向對照: 各類禁入路徑必被標記; bin/manifest.json 與 test/、spec/、sgud/、docs/、toolg/ 等隨包項不被標記(dspec 原則 1: 不得斷言其不在)', function() {
        for (let p of ['src/a.exe', 'bin/tool.DLL', 'a/b.node', 'x.msi', 'pack.zip', 'a.7z', 'a.gz', 'a.tgz', 'bin/other.json', 'bin/sub/a.txt', 'CLAUDE.md', 'CLAUDE_settings.md', 'sgud/CLAUDE_x.md', 'tmp/a.txt', 'spec/tmp/a.txt', 'test/_tmp/a.json', '.env', 'srv/.env']) {
            assert.strict.equal(isForbiddenInPack(p), true, `${p} 應被標記為禁入`)
        }
        for (let p of ['bin/manifest.json', 'test/tools/dbHolder.mjs', 'test/unit-x.test.mjs', 'test/pics/a.png', 'spec/流程.md', 'spec/evidence/a.json', 'sgud/state/state.md', 'docs/dist/index.html', 'toolg/gDistRollup.mjs', 'script.txt', 'README.md', 'src/js/a.mjs', 'dist/w-web-perm.umd.js', 'test/_tmp2/a.json']) {
            assert.strict.equal(isForbiddenInPack(p), false, `${p} 依原則 1 隨包, 不應被標記為禁入`)
        }
    })

    for (let root of ROOTS) {
        it(`ST-003 ${root} 之相對 import 閉包內每個檔案皆在出貨清單內(不依賴被排除之檔案)、不在 test/ 與 spec/ 之下(test/tools 隨包出貨, 在清單內不足以擋), 且無法靜態解析之載入為 0`, function() {
            let seen = new Set()
            let queue = [root]
            while (queue.length > 0) {
                let f = queue.shift()
                if (seen.has(f)) {
                    continue
                }
                seen.add(f)
                //離線維運工具不得依賴 test/、spec/ 下的檔案: test/tools 依 dspec 原則 4 隨包出貨, 「在出貨清單內」已擋不住, 故明確斷言(工具核心須放 server/tools 或 src/js)
                assert.strict.ok(!isDevAsset(f), `${root} 的閉包含 ${f}: 離線維運工具不得依賴 test/ 或 spec/ 下的檔案(測試與規格文件資產; test/tools 雖隨包出貨, 工具仍不得依賴之, 核心須放 server/tools 或 src/js)`)
                assert.strict.ok(fs.existsSync(path.join(projRoot, f)), `${root} 的閉包含不存在之檔案 ${f}`)
                assert.strict.ok(list.has(f), `${root} 的閉包含不在出貨清單內之檔案 ${f}`)
                let { targets, dyn } = relImports(f)
                assert.strict.deepEqual(dyn, [], `${f} 含掃描器無法靜態解析之載入(非字面 import()、require、createRequire), 依賴可能被略過: ${JSON.stringify(dyn)}`)
                queue.push(...targets)
            }
            assert.strict.ok(seen.size > 1, '閉包至少含入口與一個相依檔(掃描器未空轉)')
        })
    }

    it('ST-004 掃描器負向對照: 字面靜態／字面動態／副作用 import 被收錄, 註解內者不收; 非字面 import()、require、createRequire 被標記', function() {
        let r = scanImports([
            `import a from './a.mjs'`,
            `import { b,`,
            `    c } from "../b.mjs"`,
            `import './side.mjs'`,
            `let d = (await import('./dyn.mjs')).default`,
            `export { e } from './re.mjs'`,
            `import pkg from 'w-serv-orm/src/x.mjs'`,
            `// import x from './comment-line.mjs'`,
            `/**`,
            ` * import y from './comment-block.mjs'`,
            ` */`,
            `let u = 'http://example.com/a.mjs' // import z from './trailing-comment.mjs'`,
        ].join('\n'))
        assert.strict.deepEqual(r.lits.sort(), ['../b.mjs', './a.mjs', './dyn.mjs', './re.mjs', './side.mjs'])
        assert.strict.deepEqual(r.dyn, [])
        let bad = scanImports([`let fp = './test/tools/x.mjs'`, `await import(fp)`, `await import(\`./\${n}.mjs\`)`, `let r = createRequire(import.meta.url)`, `r('./x.cjs')`, `let q = require('./q.cjs')`].join('\n'))
        assert.strict.ok(bad.dyn.some((s) => s.startsWith('import(fp')), JSON.stringify(bad.dyn))
        assert.strict.ok(bad.dyn.some((s) => s.startsWith('import(`')), JSON.stringify(bad.dyn))
        assert.strict.ok(bad.dyn.includes('createRequire') && bad.dyn.includes('require'), JSON.stringify(bad.dyn))
    })

    describe('入口判斷(isMain; 外審 sol #5)', function() {

        //建 junction 之夾具; 無法建立(權限)則略過. 清理只移除連結本身(fs.unlinkSync 對 junction 只刪連結, 不動目標), 連結未移除成功時不遞迴刪除
        let withJunction = (target, link, fn) => {
            fs.mkdirSync(path.dirname(link), { recursive: true })
            try {
                fs.symlinkSync(target, link, 'junction')
            }
            catch (err) {
                return false
            }
            try {
                fn()
            }
            finally {
                fs.unlinkSync(link)
            }
            return true
        }
        after(function() {
            if (fs.existsSync(dirTmp) && !fs.existsSync(path.join(dirTmp, 'inst', 'node_modules', 'w-web-perm')) && !fs.existsSync(path.join(dirTmp, 'link'))) {
                fs.rmSync(dirTmp, { recursive: true, force: true })
            }
        })

        it('ST-005a isMain(import.meta.url, argv1): 同檔(含經 junction 之別名路徑)→ true; 他檔、空字串、undefined、不存在路徑 → false', function() {
            let real = path.join(dirTmp, 'real')
            fs.mkdirSync(real, { recursive: true })
            fs.writeFileSync(path.join(real, 'a.mjs'), '', 'utf8')
            fs.writeFileSync(path.join(real, 'b.mjs'), '', 'utf8')
            let url = pathToFileURL(path.join(real, 'a.mjs')).href
            assert.strict.equal(isMain(url, path.join(real, 'a.mjs')), true)
            assert.strict.equal(isMain(url, path.join(real, 'b.mjs')), false)
            assert.strict.equal(isMain(url, ''), false)
            assert.strict.equal(isMain(url, undefined), false) //預設值 process.argv[1](mocha 入口)非本檔
            assert.strict.equal(isMain(url, path.join(real, 'missing.mjs')), false)
            let link = path.join(dirTmp, 'link')
            let ran = withJunction(real, link, () => {
                assert.strict.equal(isMain(url, path.join(link, 'a.mjs')), true, '別名路徑(junction)應視為同檔 — 修前以字串比對為 false')
                assert.strict.equal(isMain(url, path.join(link, 'b.mjs')), false)
            })
            if (!ran) {
                this.skip()
            }
        })

        it('ST-005b 套件以 junction 安裝(node_modules/w-web-perm → 專案根)時, 以該路徑執行兩個 CLI 皆有輸出(無參數印用法, 離開碼 2); 不因入口路徑與真實路徑不同而靜默無輸出', function() {
            let inst = path.join(dirTmp, 'inst')
            let link = path.join(inst, 'node_modules', 'w-web-perm')
            let outs = {}
            let ran = withJunction(projRoot, link, () => {
                for (let cli of ['nameDupReport', 'authRefsAudit']) {
                    let r = spawnSync(process.execPath, [path.join('node_modules', 'w-web-perm', 'server', 'tools', `${cli}.mjs`)], { cwd: inst, encoding: 'utf8', timeout: 30000, windowsHide: true })
                    outs[cli] = { status: r.status, stdout: r.stdout }
                }
            })
            if (!ran) {
                this.skip()
            }
            for (let cli of ['nameDupReport', 'authRefsAudit']) {
                assert.strict.equal(outs[cli].status, 2, `${cli} 離開碼: ${JSON.stringify(outs[cli])}`)
                assert.strict.ok(outs[cli].stdout.includes(`用法: node server/tools/${cli}.mjs`), `${cli} 應印用法: ${JSON.stringify(outs[cli])}`)
            }
            assert.strict.equal(fs.existsSync(path.join(projRoot, 'package.json')), true, '專案根未受清理影響')
        })

    })

})
