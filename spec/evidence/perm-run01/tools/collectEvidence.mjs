//整理證據至 spec/evidence/perm-run01/ (專案內固定證據落點); 可重複執行(覆寫)
import fs from 'fs'
import path from 'path'

const root = path.resolve('.')
const dest = path.join(root, 'spec', 'evidence', 'perm-run01')
fs.mkdirSync(dest, { recursive: true })
const cp = (from, to) => {
    const p = path.join(root, from)
    if (fs.existsSync(p)) {
        fs.copyFileSync(p, path.join(dest, to))
        return true
    }
    console.log('skip(缺):', from)
    return false
}

//1 外審原文
cp('tmp/perm-run01/review/sol/sol-out.md', 'review-round1-sol.md')
cp('tmp/perm-run01/review/beam/stdout.log', 'review-round1-beam.md')
cp('tmp/perm-run01/review2/sol/out.md', 'review-round2-sol.md')
cp('tmp/perm-run01/review/prompt-body.md', 'review-prompt-body.md')

//2 單元層變異驗證(副本 tmp/perm-run01/mutrepo, 逐一變異後 sha256 回驗還原)
const names = ['rank', 'nullEquiv', 'savedRowsClient', 'savedRowsServer', 'editorDraft', 'subject', 'dialogRebuild', 'legacyDowngrade']
const qdir = path.join(root, 'tmp/perm-run01/mutrepo/tmp/quiet-run')
const rows = []
for (const n of names) {
    const f = fs.existsSync(qdir) ? fs.readdirSync(qdir).filter((x) => x.endsWith(`mutu-${n}.log`)).sort().pop() : null
    if (!f) {
        rows.push({ mutation: n, error: '無 log' })
        continue
    }
    const s = fs.readFileSync(path.join(qdir, f), 'utf8')
    const i = s.indexOf('{\n "mutation"')
    if (i < 0) {
        rows.push({ mutation: n, error: '無 JSON' })
        continue
    }
    rows.push(JSON.parse(s.slice(i, s.indexOf('\n}', i) + 2)))
}
fs.writeFileSync(path.join(dest, 'mutation-unit.json'), JSON.stringify(rows, null, 1), 'utf8')

//3 摘要檔(quiet-run summary)
const qroot = path.join(root, 'tmp/quiet-run')
const pick = (re, to, dir = qroot) => {
    if (!fs.existsSync(dir)) {
        return
    }
    const f = fs.readdirSync(dir).filter((x) => re.test(x)).sort().pop()
    if (f) {
        fs.copyFileSync(path.join(dir, f), path.join(dest, to))
    }
    else {
        console.log('skip(缺 summary):', re)
    }
}
pick(/ce-flake\.summary\.txt$/, 'e2e-012-targets-repeat-before-fix.summary.txt')
pick(/ce-flake2\.summary\.txt$/, 'e2e-012-targets-repeat-after-fix.summary.txt')
pick(/ce-ab-full\.summary\.txt$/, 'api-baseline-e2e-first-run-contaminated.summary.txt')
pick(/ce-ab-full2\.summary\.txt$/, 'api-baseline-e2e-rerun.summary.txt')
pick(/unit-all\.summary\.txt$/, 'unit-all-first.summary.txt')
pick(/unit-final\.summary\.txt$/, 'unit-final.summary.txt')
pick(/red-ext\.summary\.txt$/, 'red-before-externalRows.summary.txt')
pick(/red-eu305\.summary\.txt$/, 'red-before-eu305.summary.txt', qdir)

//4 網頁鏈狀態
cp('tmp/perm-run01/chain-logs/status.json', 'chain-status.json')
console.log('evidence ->', dest, fs.readdirSync(dest).join(', '))
