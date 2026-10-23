//建變異驗證用副本(perm-run01): 單元層之變異在副本跑, 不碰正本 src／server(正本有 e2e 在跑時 webpack 讀工作樹, 就地變異會污染)
//  副本 = tmp/perm-run01/mutrepo/{server,src,test,package.json,settings.json} + node_modules 目錄連結(junction → 正本 node_modules, 唯讀使用)
//  清理: node tmp/perm-run01/mkmutrepo.mjs --clean (先 rmdirSync 連結本身, 驗正本 node_modules 仍在, 再刪副本其餘)
import fs from 'fs'
import path from 'path'

const root = path.resolve('.')
const dest = path.resolve('./tmp/perm-run01/mutrepo')
const nm = path.join(dest, 'node_modules')

const clean = () => {
    if (fs.existsSync(nm)) {
        fs.rmdirSync(nm) //連結本身(junction); 不遞迴進正本
    }
    if (!fs.existsSync(path.join(root, 'node_modules', 'mocha'))) {
        throw new Error('!!! 正本 node_modules 受損, 立即停止')
    }
    fs.rmSync(dest, { recursive: true, force: true })
}

if (process.argv.includes('--clean')) {
    clean()
    console.log('cleaned; 正本 node_modules/mocha 仍在:', fs.existsSync(path.join(root, 'node_modules', 'mocha')))
    process.exit(0)
}

if (fs.existsSync(dest)) {
    clean()
}
fs.mkdirSync(dest, { recursive: true })
const SKIP = (src) => !/(^|[\\/])(pics|_tmp|testPending)([\\/]|$)/.test(path.relative(root, src))
for (const d of ['server', 'src', 'test']) {
    fs.cpSync(path.join(root, d), path.join(dest, d), { recursive: true, filter: SKIP })
}
for (const f of ['package.json', 'settings.json']) {
    if (fs.existsSync(path.join(root, f))) {
        fs.copyFileSync(path.join(root, f), path.join(dest, f))
    }
}
fs.symlinkSync(path.join(root, 'node_modules'), nm, 'junction')
console.log('mutrepo ready', dest, 'node_modules ->', fs.realpathSync(nm))
