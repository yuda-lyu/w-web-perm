//範圍三根因探測(二): 批量建立再批量刪除(使 MFT 記錄成批重用), 找 Number 相同而 BigInt 不同之檔對(authRefsAudit 之 a.ino === b.ino 誤判條件)
import fs from 'fs'
import path from 'path'

let ROUNDS = Number(process.argv[2] || 20)
let PER = Number(process.argv[3] || 300)
let dir = path.resolve('./tmp/perm-run01/inoScratch2')
fs.mkdirSync(dir, { recursive: true })
let totalFiles = 0
let nCollidePairs = 0
let nSameBig = 0
let ex = null
for (let r = 0; r < ROUNDS; r++) {
    let kp = new Map() //Number ino → [{name, big}]
    for (let i = 0; i < PER; i++) {
        let p = path.join(dir, `f${i}.json`)
        fs.writeFileSync(p, `r${r}-${i}`)
        let sn = fs.statSync(p)
        let sb = fs.statSync(p, { bigint: true })
        totalFiles++
        let key = `${sn.dev}:${sn.ino}`
        let arr = kp.get(key) || []
        arr.push({ p, big: sb.ino })
        kp.set(key, arr)
    }
    for (let [k, arr] of kp) {
        if (arr.length > 1) {
            for (let x = 1; x < arr.length; x++) {
                if (arr[x].big !== arr[0].big) {
                    nCollidePairs++
                    if (ex === null) {
                        ex = { round: r, a: path.basename(arr[0].p), b: path.basename(arr[x].p), bigA: String(arr[0].big), bigB: String(arr[x].big), num: k }
                    }
                }
                else {
                    nSameBig++
                }
            }
        }
    }
    for (let i = 0; i < PER; i++) {
        fs.rmSync(path.join(dir, `f${i}.json`))
    }
}
fs.rmSync(dir, { recursive: true, force: true })
console.log(JSON.stringify({ ROUNDS, PER, totalFiles, nCollidePairs, nSameBig, ex }))
