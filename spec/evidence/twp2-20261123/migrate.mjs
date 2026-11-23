//批次改檔(排程第 603 項 twp2): 本地 describeShape／describeErr → wsemi getDiagShape／getDiagBriefErr
//  只處理: ①匯入行(自 describeShape.mjs 或 maskLog.mjs 匯入之名稱) ②呼叫處 describeShape( → getDiagShape(、describeErr( → getDiagBriefErr(
//  註解中之字樣、maskLog.mjs 本身、文件另行手改
//用法: node ./tmp/twp2/migrate.mjs  (cwd 為 repo 根)
import fs from 'fs'
import path from 'path'

const root = process.cwd()
const files = [
    'src/App.vue', 'src/main.js', 'src/plugins/mUI.mjs', 'src/js/cellEditing.mjs', 'src/js/getCascadePreview.mjs',
    'src/components/LayoutContentGrups.vue', 'src/components/LayoutContentPemis.vue', 'src/components/LayoutContentStaInfor.vue',
    'src/components/LayoutContentTargets.vue', 'src/components/LayoutContentUsers.vue',
    'src/components/VeCgrups.vue', 'src/components/VeCpemis.vue', 'src/components/VeCrules.vue',
    'src/components/VeGrupBlngUsers.vue', 'src/components/VePemiBlngGrups.vue',
    'server/WWebPerm.mjs', 'srv.mjs',
]
const IMP = {
    describeShape: "import getDiagShape from 'wsemi/src/getDiagShape.mjs'",
    describeErr: "import getDiagBriefErr from 'wsemi/src/getDiagBriefErr.mjs'",
}
let report = []
for (let f of files) {
    let fp = path.join(root, f)
    let raw = fs.readFileSync(fp, 'utf8')
    let eol = raw.includes('\r\n') ? '\r\n' : '\n'
    let lines = raw.split(/\r?\n/)
    let nImp = 0
    let nCall = 0
    let out = []
    for (let ln of lines) {
        //匯入行: import { a, b } from '<任意相對路徑>/describeShape.mjs' 或 './maskLog.mjs'(WWebPerm、srv)
        let m = /^import \{ ([^}]+) \} from '((?:\.{1,2}\/)+(?:[\w/]*\/)?(describeShape|maskLog)\.mjs)'$/.exec(ln)
        if (m) {
            let names = m[1].split(',').map((s) => s.trim())
            let isMask = m[3] === 'maskLog'
            let keep = isMask ? names.filter((n) => n !== 'describeShape' && n !== 'describeErr') : []
            let drop = names.filter((n) => n === 'describeShape' || n === 'describeErr')
            if (drop.length === 0) {
                out.push(ln)
                continue
            }
            if (!isMask && names.length !== drop.length) {
                throw new Error(`${f}: 匯入含 describeShape／describeErr 以外之名稱: ${ln}`)
            }
            if (keep.length > 0) {
                out.push(`import { ${keep.join(', ')} } from '${m[2]}'`)
            }
            for (let n of drop.sort((a, b) => (a === 'describeShape' ? -1 : 1) - (b === 'describeShape' ? -1 : 1))) {
                out.push(IMP[n])
            }
            nImp++
            continue
        }
        let t = ln
        //呼叫處(含註解行內之 describeX( 一併改, 註解另行檢視)
        t = t.replace(/\bdescribeShape\(/g, () => {
            nCall++
            return 'getDiagShape('
        })
        t = t.replace(/\bdescribeErr\(/g, () => {
            nCall++
            return 'getDiagBriefErr('
        })
        out.push(t)
    }
    fs.writeFileSync(fp, out.join(eol), 'utf8')
    report.push(`${f}: 匯入行 ${nImp}, 呼叫 ${nCall}`)
}
console.log(report.join('\n'))
