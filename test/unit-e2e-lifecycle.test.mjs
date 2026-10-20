//e2e 檔之 DB 收尾對稱與 base seed 守門(規則帳本 R-E2E-ISO-01; 第 89 項: 單一 mocha 行程全跑時 e2e-users 24 案失敗)
//
//根因: npm test 把全部測試檔放在同一個 mocha 行程, 各 e2e 檔共用同一個後端與 ./db(逐檔隔離 runner 每檔重種, 故看不到).
//  e2e-rela-user-grup 最後一案 E2E-010 以 updateUsers 加入同名使用者 mary-dup, 其還原只靠「下一案前的 resetDb」, 檔案最後一案之後無人還原;
//  下一個動 users 表的檔 e2e-users 於 before 以 captureBaseSeedOnce('users') 擷取到 5 筆, 把遺留凍結成 base seed → 截圖多一列、「DB 仍為 4 筆」等 24 案失敗.
//修法: ①每個以 resetDb 還原 DB 的 e2e 檔, 其每個語系 describe 之 after 以 restoreDbOnce(key, BASE_SEED) 把該表還原為檔首 base seed(生命週期對稱);
//  ②captureBaseSeedOnce 擷取後以 assertPristineSeed 守門(主鍵集合須等於種子), 遺留於檔案起點即以可讀訊息失敗.
//本檔: LC-001~ 為站點不變式(靜態盤點: 以括號配對解出每個語系 describe 之區塊與其 after 本體, 要求 after 的頂層敘述含無條件之 await restoreDbOnce(同一表, BASE_SEED);
//  新增 e2e 檔若用 resetDb 卻漏收尾、或把收尾包在條件內即紅); BS-001~ 為 assertPristineSeed 之函數契約.
//跑法: npx mocha test/unit-e2e-lifecycle.test.mjs --timeout 30000
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { BASE_SEED_COUNT, assertPristineSeed, getSeedIds } from './tools/baseSeed.mjs'
import { sourceLines } from './tools/srcScan.mjs'

const fdTest = path.dirname(fileURLToPath(import.meta.url))


//takeBlock: src[iOpen] 為 '{', 回傳與之配對之 '}' 的索引(略過 ' " ` 字串內之括號; 未配對回 -1)
function takeBlock(src, iOpen) {
    let depth = 0
    for (let i = iOpen; i < src.length; i++) {
        let c = src[i]
        if (c === '\'' || c === '"' || c === '`') {
            let q = c
            for (i++; i < src.length && src[i] !== q; i++) {
                if (src[i] === '\\') {
                    i++
                }
            }
            continue
        }
        if (c === '{') {
            depth++
        }
        else if (c === '}') {
            depth--
            if (depth === 0) {
                return i
            }
        }
    }
    return -1
}

//topLevel: 區塊本體之頂層文字(深度 0; 巢狀 { } 內容移除)
function topLevel(body) {
    let out = ''
    let depth = 0
    for (let i = 0; i < body.length; i++) {
        let c = body[i]
        if (c === '\'' || c === '"' || c === '`') {
            let q = c
            let j = i
            for (i++; i < body.length && body[i] !== q; i++) {
                if (body[i] === '\\') {
                    i++
                }
            }
            if (depth === 0) {
                out += body.slice(j, i + 1)
            }
            continue
        }
        if (c === '{') {
            depth++
        }
        else if (c === '}') {
            depth--
        }
        else if (depth === 0) {
            out += c
        }
    }
    return out
}

//以 resetDb(browser, '<key>', …) 在每案前還原 DB 的 e2e 檔(可執行碼, 略過註解)
function e2eFilesUsingResetDb() {
    let out = []
    for (let fn of fs.readdirSync(fdTest).filter((f) => /^e2e-.*\.test\.mjs$/.test(f)).sort()) {
        let src = sourceLines(path.join(fdTest, fn), 'code').map((l) => l.text).join('\n')
        let keys = [...src.matchAll(/resetDb\(browser,\s*'(\w+)'/g)].map((m) => m[1])
        if (keys.length > 0) {
            out.push({ fn, src, keys: [...new Set(keys)] })
        }
    }
    return out
}

//檔內每個語系 describe(`e2e-xxx (${lang})`, function() { … }) 之區塊本體
function langDescribeBodies(src) {
    let out = []
    for (let m of src.matchAll(/describe\(`[^`]*\$\{lang\}[^`]*`,\s*function\(\)\s*\{/g)) {
        let iOpen = m.index + m[0].length - 1
        let iEnd = takeBlock(src, iOpen)
        out.push(iEnd < 0 ? null : src.slice(iOpen + 1, iEnd))
    }
    return out
}

//語系 describe 本體內之 after(async function() { … }) 的頂層文字
function afterTopLevel(body) {
    let m = /\bafter\(async function\(\)\s*\{/.exec(body)
    if (!m) {
        return null
    }
    let iOpen = m.index + m[0].length - 1
    let iEnd = takeBlock(body, iOpen)
    return iEnd < 0 ? null : topLevel(body.slice(iOpen + 1, iEnd))
}


describe('unit-e2e-lifecycle (e2e 檔 DB 收尾對稱, R-E2E-ISO-01)', function() {

    it('LC-001 盤點: 用 resetDb 的 e2e 檔為 7 個(grups／pemis／targets／users／rela-grup-pemi／rela-pemi-rule／rela-user-grup)', function() {
        let fns = e2eFilesUsingResetDb().map((v) => v.fn)
        assert.strict.deepEqual(fns, ['e2e-grups.test.mjs', 'e2e-pemis.test.mjs', 'e2e-rela-grup-pemi.test.mjs', 'e2e-rela-pemi-rule.test.mjs', 'e2e-rela-user-grup.test.mjs', 'e2e-targets.test.mjs', 'e2e-users.test.mjs'])
    })

    it('LC-002 站點不變式: 每個用 resetDb 的 e2e 檔, 其語系 describe 之 after 本體頂層有「獨立一行」的無條件 await restoreDbOnce(同一表, BASE_SEED)', function() {
        let bad = []
        for (let { fn, src, keys } of e2eFilesUsingResetDb()) {
            let bodies = langDescribeBodies(src)
            if (bodies.length < 1 || bodies.some((b) => b === null)) {
                bad.push(`${fn}: 找不到可解析之語系 describe(${bodies.length} 個)`)
                continue
            }
            for (let body of bodies) {
                let top = afterTopLevel(body)
                if (top === null) {
                    bad.push(`${fn}: 語系 describe 內沒有 after(async function() { … })`)
                    continue
                }
                for (let key of keys) {
                    let re = new RegExp(`(^|\\n)[ \\t]*await restoreDbOnce\\('${key}',\\s*BASE_SEED\\)[ \\t]*(\\n|$)`)
                    if (!re.test(top)) {
                        bad.push(`${fn}: after 頂層缺少無條件之 await restoreDbOnce('${key}', BASE_SEED)`)
                    }
                }
            }
        }
        assert.strict.deepEqual(bad, [], bad.join('\n'))
    })

    it('LC-002b LC-002 的判定器本身: 條件包覆、單行 if、缺 after、不同表鍵、移到 describe 之外 皆被判為不合格; 正規寫法合格', function() {
        let mk = (afterBody) => `describe(\`e2e-x (\${lang})\`, function() {\n    before(async function() {})\n    ${afterBody}\n})`
        let ok = (afterBody, key = 'users') => {
            let bodies = langDescribeBodies(mk(afterBody))
            let top = bodies.length === 1 && bodies[0] !== null ? afterTopLevel(bodies[0]) : null
            return top !== null && new RegExp(`(^|\\n)[ \\t]*await restoreDbOnce\\('${key}',\\s*BASE_SEED\\)[ \\t]*(\\n|$)`).test(top)
        }
        assert.strict.equal(ok(`after(async function() {\n        this.timeout(1)\n        await restoreDbOnce('users', BASE_SEED)\n    })`), true)
        assert.strict.equal(ok(`after(async function() {\n        if (flag) {\n            await restoreDbOnce('users', BASE_SEED)\n        }\n    })`), false, '包在 if 區塊')
        assert.strict.equal(ok(`after(async function() {\n        if (flag) await restoreDbOnce('users', BASE_SEED)\n    })`), false, '單行 if')
        assert.strict.equal(ok(`after(async function() {\n        await restoreDbOnce('grups', BASE_SEED)\n    })`), false, '不同表鍵')
        assert.strict.equal(ok(`after(async function() {\n        this.timeout(1)\n    })`), false, 'after 無收尾')
        assert.strict.equal(ok(`it('x', function() {})`), false, '無 after')
        let outside = `describe(\`e2e-x (\${lang})\`, function() {\n    it('x', function() {})\n})\nafter(async function() {\n    await restoreDbOnce('users', BASE_SEED)\n})`
        let bodies = langDescribeBodies(outside)
        assert.strict.equal(afterTopLevel(bodies[0]), null, 'after 在 describe 之外')
    })

    it('LC-003 站點不變式: captureBaseSeedOnce 擷取後以 assertPristineSeed 守門(守門只在 e2e-setup 一處, 各檔共用)', function() {
        let src = sourceLines(path.join(fdTest, 'tools', 'e2e-setup.mjs'), 'code').map((l) => l.text).join('\n')
        let m = src.match(/export async function captureBaseSeedOnce\(key\) \{[\s\S]*?\n\}/)
        assert.strict.ok(m, '找不到 captureBaseSeedOnce')
        assert.strict.ok(/assertPristineSeed\(key,/.test(m[0]), 'captureBaseSeedOnce 須以 assertPristineSeed 守門')
    })

    //以真種子 id 組出 seed(列只需 id／name)
    let mkSeed = (key) => getSeedIds(key).map((id) => ({ id, name: id.replace(/^id-for-/, '') }))

    it('BS-001 主鍵集合與種子一致 → 回傳原 seed; 筆數常數與種子主鍵數相符', function() {
        for (let key of Object.keys(BASE_SEED_COUNT)) {
            let seed = mkSeed(key)
            assert.strict.equal(seed.length, BASE_SEED_COUNT[key], key)
            assert.strict.equal(assertPristineSeed(key, seed), seed)
        }
        assert.strict.deepEqual(BASE_SEED_COUNT, { users: 4, grups: 4, pemis: 4, targets: 22 })
        assert.strict.deepEqual(getSeedIds('users'), ['id-for-admin', 'id-for-john', 'id-for-mary', 'id-for-peter'])
    })

    it('BS-002 users 多一筆(e2e-rela-user-grup E2E-010 遺留之同名使用者) → 拋出可讀訊息, 含實得／應為筆數與多出之主鍵與各列名稱', function() {
        let seed = [...mkSeed('users'), { id: 'id-for-mary-dup', name: 'mary' }]
        assert.strict.throws(() => assertPristineSeed('users', seed), (err) => {
            assert.strict.ok(/captureBaseSeedOnce\(users\)/.test(err.message), err.message)
            assert.strict.ok(/實得 5 筆/.test(err.message) && /應為 4 筆/.test(err.message), err.message)
            assert.strict.ok(/多出主鍵 \[id-for-mary-dup\]/.test(err.message), err.message)
            assert.strict.ok(/缺少主鍵 \[\]/.test(err.message), err.message)
            return true
        })
    })

    it('BS-003 筆數相同但主鍵集合不同(換一列; 外審 minimax#4、sol#1) → 拋出並點名多出與缺少之主鍵', function() {
        let seed = mkSeed('users').filter((v) => v.id !== 'id-for-john')
        seed.push({ id: 'id-for-intruder', name: 'intruder' })
        assert.strict.equal(seed.length, 4)
        assert.strict.throws(() => assertPristineSeed('users', seed), (err) => {
            assert.strict.ok(/多出主鍵 \[id-for-intruder\]/.test(err.message) && /缺少主鍵 \[id-for-john\]/.test(err.message), err.message)
            return true
        })
    })

    it('BS-004 筆數少一筆、非陣列、未知表名 → 皆拋出; 內容(同主鍵之欄位值)改變不在守門範圍(由各檔檔尾還原防止)', function() {
        assert.strict.throws(() => assertPristineSeed('targets', mkSeed('targets').slice(1)), /實得 21 筆, 應為 22 筆/)
        assert.strict.throws(() => assertPristineSeed('users', null), /非陣列/)
        assert.strict.throws(() => assertPristineSeed('nope', []), /未知的表名/)
        let changed = mkSeed('users').map((v) => ({ ...v, cgrups: '{"x":1}' }))
        assert.strict.equal(assertPristineSeed('users', changed), changed)
    })

})
