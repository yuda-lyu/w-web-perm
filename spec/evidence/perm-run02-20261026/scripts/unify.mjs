//角色用詞統一(perm-run02, 使用者 2026-10-26 裁示): 指系統管理者角色之詞一律為「系統管理者」
//  K1 「系統」+舊稱 → 系統管理者; K2 單獨舊稱 → 系統管理者; K3 單獨「管理＋者」(前一字串非「系統」) → 系統管理者
//用法: node tmp/perm-run02/unify.mjs <dry|apply> [清單 tsv 輸出路徑]
//以拆開之片段組出舊稱, 本腳本自身不含舊稱字面值.
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

let [mode, tsvPath] = process.argv.slice(2)
const SYS = '系統'
const OLD = '管理' + '員'
const ZE = '管理' + '者'
const NEW = SYS + ZE
const reK1 = new RegExp(SYS + OLD, 'g')
const reK2 = new RegExp(`(?<!${SYS})${OLD}`, 'g')
const reK3 = new RegExp(`(?<!${SYS})${ZE}`, 'g')
const reAny = new RegExp(`${OLD}|(?<!${SYS})${ZE}`)

//K4 「(系統)舊稱者」(如「非系統舊稱者」之「員者」連用) → 系統管理者, 避免產生疊字「者者」
const reK4 = new RegExp(`(?:${SYS})?${OLD}者`, 'g')
let fix = (s) => s.replace(reK4, NEW).replace(reK1, NEW).replace(new RegExp(OLD, 'g'), NEW).replace(reK3, NEW)
let lat = (t) => Buffer.from(t, 'utf8').toString('latin1')
let fixLatin1 = (s) => {
    let k4 = new RegExp(`(?:${lat(SYS)})?${lat(OLD + '者')}`, 'g')
    s = s.replace(k4, lat(NEW))
    let k1 = new RegExp(lat(SYS + OLD), 'g')
    let k2 = new RegExp(lat(OLD), 'g')
    let k3 = new RegExp(`(?<!${lat(SYS)})${lat(ZE)}`, 'g')
    return s.replace(k1, lat(NEW)).replace(k2, lat(NEW)).replace(k3, lat(NEW))
}

let files = execFileSync('git', ['ls-files', '-z'], { encoding: 'buffer', maxBuffer: 1 << 28 }).toString('utf8').split('\0').filter((s) => s)
//UNIFY_EXTRA: 以逗號分隔之額外路徑(未被 git 追蹤者, 如被 .gitignore 忽略之證據 log), 同規則處理
if (process.env.UNIFY_EXTRA) {
    files.push(...process.env.UNIFY_EXTRA.split(',').filter((s) => s))
}
let rows = []
let perFile = []
let tot = { K1: 0, K2: 0, K3: 0 }
let changed = 0
let pre = { sysdup: 0, zedup: 0 }
let post = { sysdup: 0, zedup: 0 }
for (let f of files) {
    if (/^(db|node_modules|test\/pics)\//.test(f)) {
        continue
    }
    let b
    try {
        b = fs.readFileSync(f)
    }
    catch (e) {
        continue //已刪除而尚未提交者
    }
    let isNul = b.includes(0)
    let s = b.toString('utf8')
    let useLatin = isNul || !Buffer.from(s, 'utf8').equals(b)
    if (useLatin) {
        s = b.toString('latin1')
    }
    let ss = useLatin ? [SYS, OLD, ZE, NEW].map(lat) : [SYS, OLD, ZE, NEW]
    let [kSys, kOld, kZe, kNew] = ss
    let c1 = (s.match(new RegExp(kSys + kOld, 'g')) || []).length
    let c2 = (s.match(new RegExp(`(?<!${kSys})${kOld}`, 'g')) || []).length
    let c3 = (s.match(new RegExp(`(?<!${kSys})${kZe}`, 'g')) || []).length
    pre.sysdup += (s.match(new RegExp(kSys + kSys, 'g')) || []).length
    pre.zedup += (s.match(new RegExp(kZe + '者', 'g')) || []).length
    if (c1 + c2 + c3 === 0) {
        continue
    }
    tot.K1 += c1
    tot.K2 += c2
    tot.K3 += c3
    perFile.push({ f, K1: c1, K2: c2, K3: c3, enc: useLatin ? 'latin1' : 'utf8' })
    let ns = useLatin ? fixLatin1(s) : fix(s)
    post.sysdup += (ns.match(new RegExp(kSys + kSys, 'g')) || []).length
    post.zedup += (ns.match(new RegExp(kZe + '者', 'g')) || []).length
    //清單: 逐行記錄(舊→新: 只記新形, 不含舊稱字面值)
    if (!useLatin) {
        let la = s.split('\n')
        let lb = ns.split('\n')
        la.forEach((ln, i) => {
            if (!reAny.test(ln) && !ln.includes(SYS + OLD)) {
                return
            }
            let k = []
            let n1 = (ln.match(reK1) || []).length
            let n2 = (ln.match(reK2) || []).length
            let n3 = (ln.match(reK3) || []).length
            if (n1) k.push('K1x' + n1)
            if (n2) k.push('K2x' + n2)
            if (n3) k.push('K3x' + n3)
            rows.push([f, i + 1, k.join('+'), lb[i].replace(/\r$/, '').trim().slice(0, 140).replace(/\t/g, ' ')].join('\t'))
        })
    }
    if (mode === 'apply') {
        if (useLatin) {
            fs.writeFileSync(f, Buffer.from(ns, 'latin1'))
        }
        else {
            fs.writeFileSync(f, ns, 'utf8')
        }
        changed++
    }
}
console.log(`mode=${mode} 檔案數 ${perFile.length}, K1(系統+舊稱)=${tot.K1}, K2(單獨舊稱)=${tot.K2}, K3(單獨管理＋者)=${tot.K3}, 合計 ${tot.K1 + tot.K2 + tot.K3}; 已寫入 ${changed} 檔`)
console.log(`疊字(連續兩個「系統」／連續兩個「者」)——改前(全檔計): ${pre.sysdup}／${pre.zedup}; 改後(僅變更檔): ${post.sysdup}／${post.zedup}`)
let byTop = {}
for (let p of perFile) {
    let t = p.f.split('/')[0] + (p.f.startsWith('spec/evidence/') ? '(evidence)' : '')
    byTop[t] = (byTop[t] || 0) + p.K1 + p.K2 + p.K3
}
console.log('依頂層目錄:', JSON.stringify(byTop))
if (tsvPath) {
    fs.mkdirSync(path.dirname(tsvPath), { recursive: true })
    fs.writeFileSync(tsvPath, ['file\tline\tkinds\tafter(新形, 截 140 字)', ...rows].join('\n') + '\n')
    fs.writeFileSync(tsvPath.replace(/\.tsv$/, '.per-file.json'), JSON.stringify(perFile, null, 1))
    console.log('清單', tsvPath, rows.length, '行')
}
