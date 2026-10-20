//迭代使用端傳入之物件(規則帳本 R-OBJ-ITER-01「迭代使用端傳入之物件」; 對應 wsemi CLAUDE_rulebook.md 同名規則)
//
//受測: src/js/eachOwn.mjs 之 eachOwn(真陣列索引迴圈、一般物件自有可列舉字串鍵、其餘不迭代; callback 回 false 跳出, 同 lodash each)
//EO-0xx: 函數契約(與 lodash each 對「無 length 鍵之物件與真陣列」逐項等價; 對帶 length 鍵之物件改走自有鍵, 與 length 之值無關).
//SITE-OI-0xx: 站點不變式(規則帳本 R-OBJ-ITER-01 站點全集之可執行版): 已套站點不再以 lodash 走訪客戶端物件, 且 server／src 內不得新增 `each(kp…)` 類走訪.
//跑法: npx mocha --no-parallel test/unit-eachOwn.test.mjs --timeout 60000
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import each from 'lodash-es/each.js'
import eachOwn from '../src/js/eachOwn.mjs'
import { sourceLines } from './tools/srcScan.mjs'
import { runChild, fileUrl, describeChild } from './tools/runChild.mjs'


const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

//visit: 記錄走訪序列 [[k, v], …]
let visit = (fn, o) => {
    let out = []
    fn(o, (v, k) => {
        out.push([k, v])
    })
    return out
}


describe('unit-eachOwn (R-OBJ-ITER-01)', function() {

    it('EO-001 真陣列: 依索引由小到大、回呼參數為 (值, 索引, 陣列)、空洞視為 undefined、回傳原陣列', function() {
        let arr = [10, 20, 30]
        let args = []
        let r = eachOwn(arr, (v, k, o) => {
            args.push([v, k, o === arr])
        })
        assert.strict.equal(r, arr)
        assert.strict.deepEqual(args, [[10, 0, true], [20, 1, true], [30, 2, true]])
        //空洞: 與 lodash each 相同, 以 undefined 走訪
        assert.strict.deepEqual(visit(eachOwn, [1, , 3]), visit(each, [1, , 3])) // eslint-disable-line no-sparse-arrays
        assert.strict.deepEqual(visit(eachOwn, []), [])
    })

    it('EO-002 跳出: 只有回呼回傳 false 才跳出(undefined、true、0、null、空字串皆繼續); 物件與陣列皆然', function() {
        for (let ret of [undefined, true, 0, null, '']) {
            let n = 0
            eachOwn([1, 2, 3], () => {
                n++
                return ret
            })
            assert.strict.equal(n, 3, `回傳 ${JSON.stringify(ret)} 不得跳出`)
        }
        let seen = []
        eachOwn([1, 2, 3], (v) => {
            seen.push(v)
            return v === 2 ? false : true
        })
        assert.strict.deepEqual(seen, [1, 2])
        seen = []
        eachOwn({ a: 1, b: 2, c: 3 }, (v, k) => {
            seen.push(k)
            if (v === 2) {
                return false
            }
        })
        assert.strict.deepEqual(seen, ['a', 'b'])
    })

    it('EO-003 一般物件: 自有可列舉字串鍵, 順序同 Object.keys; 不含繼承鍵、不可列舉鍵、Symbol 鍵', function() {
        let proto = { inherited: 1 }
        let o = Object.create(proto)
        o.b = 2
        o[2] = 'two'
        o[1] = 'one'
        o.a = 3
        Object.defineProperty(o, 'hidden', { value: 9, enumerable: false })
        o[Symbol('s')] = 4
        assert.strict.deepEqual(visit(eachOwn, o).map((v) => v[0]), Object.keys(o))
        assert.strict.deepEqual(visit(eachOwn, o).map((v) => v[0]), ['1', '2', 'b', 'a'])
    })

    it('EO-004 與 lodash each 逐項等價(無 length 鍵之物件、真陣列、巢狀)', function() {
        let samples = [
            {}, { a: 1 }, { a: 1, b: [1, 2], c: { d: 1 } }, { 3: 'x', 1: 'y', z: 'w' }, { length: 'abc', a: 1 }, { length: -1, a: 1 }, { length: 1.5, a: 1 },
            { length: null, a: 1 }, { length: true, a: 1 }, { length: [], a: 1 }, { length: {}, a: 1 }, [], [1], [1, 2, 3], ['a', { b: 1 }, null, undefined],
        ]
        for (let s of samples) {
            assert.strict.deepEqual(visit(eachOwn, s), visit(each, s), JSON.stringify(s))
        }
    })

    it('EO-005 物件含合法 length 鍵(0、1、2、100): 依自有鍵走訪, length 為一般鍵(lodash each 在此改走索引 0..length-1)', function() {
        for (let n of [0, 1, 2, 100]) {
            let o = { id: 'a', length: n, name: 'x' }
            assert.strict.deepEqual(visit(eachOwn, o), [['id', 'a'], ['length', n], ['name', 'x']], `length:${n}`)
        }
        //與 lodash 之差異(留證): lodash 對 length:1 只走索引 0
        assert.strict.deepEqual(visit(each, { id: 'a', length: 1, name: 'x' }), [[0, undefined]])
    })

    it('EO-006 length 為 2**32-1、Number.MAX_SAFE_INTEGER、1e9 → 子行程毫秒內完成且只走自有鍵(成本只依實際鍵數)', function() {
        let code = `
            import eachOwn from ${fileUrl('src/js/eachOwn.mjs')}
            let out = []
            for (let n of [2 ** 32 - 1, Number.MAX_SAFE_INTEGER, 1e9]) {
                let ks = []
                eachOwn({ a: 1, length: n, b: 2 }, (v, k) => {
                    ks.push(k)
                })
                out.push(ks.join())
            }
            console.log(JSON.stringify(out))
        `
        let c = runChild(code, { timeoutMs: 20000 })
        assert.strict.ok(c.ok, `子行程應正常結束: ${describeChild(c)}`)
        assert.strict.deepEqual(c.result, Array(3).fill('a,length,b'))
    })

    it('EO-007 以 Symbol.toStringTag 偽稱 Array 之物件不是陣列: 依自有鍵走訪(不依其 length)', function() {
        let fake = Object.defineProperty({ 0: 'x', length: 3 }, Symbol.toStringTag, { value: 'Array' })
        assert.strict.deepEqual(visit(eachOwn, fake), [['0', 'x'], ['length', 3]])
        //巨大 length 之偽陣列: 子行程(若誤依 length 迭代會耗盡記憶體)
        let code = `
            import eachOwn from ${fileUrl('src/js/eachOwn.mjs')}
            let fake = Object.defineProperty({ 0: 'x', length: 2 ** 32 - 1 }, Symbol.toStringTag, { value: 'Array' })
            let ks = []
            eachOwn(fake, (v, k) => {
                ks.push(k)
            })
            console.log(JSON.stringify(ks))
        `
        let c = runChild(code, { timeoutMs: 20000 })
        assert.strict.ok(c.ok, `子行程應正常結束: ${describeChild(c)}`)
        assert.strict.deepEqual(c.result, ['0', 'length'])
    })

    //外審 sol#7: lodash each 於開始時取一次長度; 回呼改動陣列長度時走訪範圍不變
    it('EO-009 真陣列: 回呼增減陣列長度時, 走訪範圍與 lodash each 相同(長度於開始時取一次)', function() {
        let mk = (push) => {
            let a = [1, 2]
            let seen = []
            return { a, seen, fn: (v) => {
                seen.push(v)
                if (push && a.length < 5) {
                    a.push(9)
                }
                else if (!push) {
                    a.length = 1
                }
            } }
        }
        for (let push of [true, false]) {
            let x = mk(push)
            each(x.a, x.fn)
            let y = mk(push)
            eachOwn(y.a, y.fn)
            assert.strict.deepEqual(y.seen, x.seen, push ? '回呼 push' : '回呼縮短 length')
        }
    })

    it('EO-008 非物件(null、undefined、字串、數字、布林、函數、Symbol) → 不呼叫回呼、不拋錯、原樣回傳', function() {
        let f = () => {}
        for (let v of [null, undefined, 'abc', '', 5, 0, true, false, f, Symbol.iterator]) {
            let n = 0
            let r = eachOwn(v, () => {
                n++
            })
            assert.strict.equal(n, 0, String(v))
            assert.strict.equal(r, v)
        }
    })

    // ===== 站點不變式(R-OBJ-ITER-01 站點全集, 規則帳本) =====

    //站點檔案之可執行碼行(略過註解)
    let codeOf = (rel) => sourceLines(path.join(projRoot, rel), 'code').map((l) => l.text).join('\n')

    //輔助靜態檢查(實際行為由 unit-validateRows／unit-getUserRules／unit-procCore-* 之行為案例保證; 前端元件由 e2e-grups／pemis／users／rela-* 覆蓋): 逐站列舉「預期之呼叫開頭」,
    //並要求同一檔不得出現對應之 lodash 呼叫——誤把參數寫成他物(如 eachOwn({}, …))或改回 each(…) 皆會失敗
    it('SITE-OI-001 已套站點: validateRows／mShare／procCore／前端 5 個元件逐站以 eachOwn(預期參數) 或 Array.isArray 守門, 不再以 lodash 走訪客戶端物件', function() {
        let has = (code, head, n) => {
            let cnt = code.split(head).length - 1
            assert.strict.equal(cnt, n, `應有 ${n} 處「${head}」, 實得 ${cnt}`)
        }

        //server/validateRows.mjs: 不 import lodash 之陣列樣走訪函數(僅 get), 四處走訪皆 eachOwn
        let vr = codeOf('server/validateRows.mjs')
        assert.strict.ok(!/lodash-es\/(each|forEach|map|filter|size|keys)\.js/.test(vr), 'validateRows 不得 import lodash 之 each/forEach/map/filter/size/keys')
        has(vr, 'eachOwn(rows, (v, k) =>', 2) //主鍵檢查與欄位標記檢查
        has(vr, 'eachOwn(rowsIdOnly, (v) =>', 1)
        has(vr, 'eachOwn(v, (vv, kk) =>', 1) //列物件之欄位
        assert.strict.ok(/Array\.isArray\(rows\)/.test(vr) && /Array\.isArray\(rowsIdOnly\)/.test(vr), 'rows／rowsIdOnly 以 Array.isArray 判真陣列(不用 isarr)')
        assert.strict.ok(!/\bisarr\(|\biseobj\(/.test(vr), '不用依 toString 判型之 isarr／iseobj')

        //src/plugins/mShare.mjs: getUserRules 內走訪 JSON5 解析物件與合併用 kpRule 物件之 4 處改 eachOwn
        let ms = codeOf('src/plugins/mShare.mjs')
        for (let name of ['kp', 'obj', 'kpRuleFin']) {
            assert.strict.ok(!new RegExp(`\\beach\\(\\s*${name}\\s*,`).test(ms), `mShare 不得 each(${name}, …)`)
        }
        has(ms, 'eachOwn(kp, (v, k) =>', 0) //cvKpToArr 已抽至 src/js/cvKpToArr.mjs(R-AUTH-DECODE-01), 見下
        has(ms, 'eachOwn(obj, (v, k) =>', 2) //objOR、objAND
        has(ms, 'eachOwn(kpRuleFin, (v, k) =>', 1) //rulesFin
        assert.strict.ok(/import cvKpToArr from '\.\.\/js\/cvKpToArr\.mjs'/.test(ms), 'mShare 應 import 共用之 cvKpToArr')

        //src/js/cvKpToArr.mjs(伺服端與編輯器共用之授權資料解碼): 走訪 JSON5 解析物件改 eachOwn; cvKpToObj 走訪其輸出(真陣列)亦 eachOwn
        let ca = codeOf('src/js/cvKpToArr.mjs')
        assert.strict.ok(!/lodash-es/.test(ca), 'cvKpToArr 不得 import lodash')
        has(ca, 'eachOwn(kp, (v, k) =>', 1)
        let co = codeOf('src/js/cvKpToObj.mjs')
        assert.strict.ok(!/lodash-es/.test(co), 'cvKpToObj 不得 import lodash')
        has(co, 'eachOwn(kp, (v, k) =>', 1) //物件形式
        has(co, 'eachOwn(arr, (r) =>', 1) //陣列形式(crules)
        has(co, 'eachOwn(arr, (r, i) =>', 1) //陣列形式(帶 mode; 位置 i 供鍵序: 有效啟用元素首次出現之序)
        has(co, 'eachOwn(names, (name) =>', 1)
        has(co, 'eachOwn(g.acts, (a) =>', 1)
        assert.strict.ok(!/\beach\(/.test(co), 'cvKpToObj 不得用 lodash each')
        //R-AUTH-ORDER-01／R-AUTH-LOSSY-01 之新模組(2026-10-20 run02): 走訪使用端物件一律 eachOwn, 不 import lodash
        let ko = codeOf('src/js/keepKeyOrder.mjs')
        assert.strict.ok(!/lodash-es/.test(ko) && !/\beach\(/.test(ko), 'keepKeyOrder 不得用 lodash')
        has(ko, 'eachOwn(kpRef, (v, k) =>', 1)
        has(ko, 'eachOwn(kpNew, (v, k) =>', 1)
        let kl = codeOf('src/js/getKpLossy.mjs')
        assert.strict.ok(!/lodash-es/.test(kl) && !/\beach\(/.test(kl), 'getKpLossy 不得用 lodash')
        has(kl, 'eachOwn(cvKpToArr(kp), (r) =>', 1)
        has(kl, 'eachOwn(kpModes, (ms, n) =>', 1)

        //server/procCore.mjs: mergePickKeysOnly 與 updateTabItems 對 rows 守門
        let pc = codeOf('server/procCore.mjs')
        assert.strict.ok(/if \(Array\.isArray\(rowsIn\)\) \{/.test(pc), 'mergePickKeysOnly 應以 Array.isArray(rowsIn) 才走訪')
        assert.strict.ok(/!Array\.isArray\(rows\) \|\| !rows\.every\(isRowObj\)/.test(pc), 'updateTabItems 應於入口拒絕非陣列或含非物件／空物件之列')

        //前端 5 個元件: 11 站皆 eachOwn(預期參數)
        let vues = {
            'src/components/LayoutContentGrups.vue': ['eachOwn(u.kpGrup, (v, k) =>', 'eachOwn(kp, (v, k) =>', 'eachOwn(kpPemi, (v, k) =>'],
            'src/components/LayoutContentPemis.vue': ['eachOwn(g.kpPemi, (v, k) =>', 'eachOwn(kp, (v, k) =>', 'eachOwn(kpRule, (v, k) =>'],
            'src/components/LayoutContentUsers.vue': ['eachOwn(kpGrup, (v, k) =>'],
            'src/components/VeGrupBlngUsers.vue': ['eachOwn(kp, (v, k) =>', 'eachOwn(kpGrup, (v, k) =>'],
            'src/components/VePemiBlngGrups.vue': ['eachOwn(kp, (v, k) =>', 'eachOwn(kpPemi, (v, k) =>'],
        }
        for (let [rel, heads] of Object.entries(vues)) {
            let c = codeOf(rel)
            assert.strict.ok(/import eachOwn from '\.\.\/js\/eachOwn\.mjs'/.test(c), `${rel} 應 import eachOwn`)
            for (let h of heads) {
                has(c, h, 1)
            }
            assert.strict.equal((c.match(/\beachOwn\(/g) || []).length, heads.length, `${rel} 之 eachOwn 站數`)
        }
    })

    //SITE-OI-002: 全域掃描——server／src 內以 lodash 陣列樣函數走訪「kp 開頭之變數」(JSON5 解析物件或鍵值對照物件)者, 須在允許清單
    //允許清單(站點 12、18, 逐「檔案::變數」): 本程式自建之 map(值為陣列／物件、不為數字)——vo.kpGrupUser(LayoutContentGrups)、vo.kpPemiGrup(LayoutContentPemis)、kpRunning(submitGuard);
    //procLang 之 kp 為語系字典常數(鍵為語系鍵、值為各語系文字物件)
    it('SITE-OI-002 server／src 內 each(kp…) 類走訪僅限允許清單(新增者須先判斷是否為使用端物件, 是則改 eachOwn)', function() {
        let files = []
        let walk = (dir) => {
            for (let ent of fs.readdirSync(dir, { withFileTypes: true })) {
                let fp = path.join(dir, ent.name)
                if (ent.isDirectory()) {
                    walk(fp)
                }
                else if (/\.(mjs|vue|js)$/.test(ent.name)) {
                    files.push(fp)
                }
            }
        }
        walk(path.join(projRoot, 'server'))
        walk(path.join(projRoot, 'src'))
        assert.strict.ok(files.length > 30, `應掃到 server／src 全部檔案, 實得 ${files.length}`)
        let allow = new Set([
            'src/components/LayoutContentGrups.vue::vo.kpGrupUser',
            'src/components/LayoutContentPemis.vue::vo.kpPemiGrup',
            'src/plugins/submitGuard.mjs::kpRunning',
            'server/procLang.mjs::kp',
        ])
        //變數名涵蓋 JSON5／JSON 解析結果與鍵值對照物件之常見命名: kp*、cgrups*／cpemis*／crules*、parsed*
        let re = /\b(each|map|size|filter|forEach|find|some|every|reduce|sortBy|toArray|flatMap|groupBy|keyBy)\(\s*([\w.]*\b(?:kp|cgrups|cpemis|crules|parsed)\w*)\s*[,)]/g
        let bad = []
        for (let fp of files) {
            for (let l of sourceLines(fp, 'code')) {
                let m = null
                re.lastIndex = 0
                while ((m = re.exec(l.text)) !== null) {
                    let rel = path.relative(projRoot, fp).split(path.sep).join('/')
                    if (!allow.has(`${rel}::${m[2]}`)) {
                        bad.push(`${rel}:${l.no}: ${m[1]}(${m[2]}…)`)
                    }
                }
            }
        }
        assert.strict.deepEqual(bad, [], `未列入允許清單之走訪:\n${bad.join('\n')}`)
    })

})
