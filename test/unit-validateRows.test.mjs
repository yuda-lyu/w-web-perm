//寫入前驗證之判準(規則帳本 R-ORM-01; spec/設計要點與取捨.md ADR-026)
//
//受測: server/validateRows.mjs 之 validateRowsBeforeWrite(單一職責之純函數; procCore.updateTabItems 與 WWebPerm.syncAndReplaceTabs 於第一個破壞步驟前呼叫).
//VR-0xx: 判準全表(主鍵型別／長度／批內重複、rowsIdOnly 只參與重複判定、任一字串欄位之標記、非字串欄位不驗、回傳第一個違規).
//VR-EQ-001: 與上游等價——同一語料經真 procOrm(w-serv-orm getMapOrm → getProc, 真 adjustData / clearXSS)寫入, 「本判準拒絕」⇔「上游會拒絕或改寫」.
//  判準複製自上游之前提: 全樹只有一份 wsemi(VR-EQ-002 以 npm ls 守護); 語料取 clearXSS 之邊界(白名單標籤、< 後接字母／數字／空白、註解、實體).
//跑法: npx mocha test/unit-validateRows.test.mjs --timeout 60000
import assert from 'assert'
import { execSync } from 'child_process'
import ds from '../src/schema/index.mjs'
import validateRowsBeforeWrite, { maxIdBytes } from '../server/validateRows.mjs'
import { mkTable, mkProcOrm } from './tools/unitOrm.mjs'
import { runChild, fileUrl, describeChild } from './tools/runChild.mjs'


//clearXSS 之邊界語料(wsemi 1.9.15: 只轉義構成標籤起點之 <——後接字母、/、!、? 或位於結尾; 白名單標籤原樣)
const CORPUS = [
    'plain', '專案A/頁A/區塊A', 'a < b', 'x > y', 'a<1', 'a <= b', '1<2<3', '<b>粗體</b>', '<i>x</i>', 'p</b>',
    'a<b', 'g<b', 'T1<x', '<script>x', '<img src=x onerror=alert(1)>', '<!-- c -->', '<?php', 'a<', '<', 'x</y',
    '&lt;b', 'a&amp;b', '<B>大寫</B>', '<a href="javascript:x">y</a>', '<a href="https://example.com">y</a>',
]


describe('unit-validateRows (寫入前驗證之判準, ADR-026)', function() {

    it('VR-001 合法列(無主鍵、字串主鍵、數字主鍵、白名單標籤與不構成標記之 < >) → null', function() {
        assert.strict.equal(validateRowsBeforeWrite([]), null)
        assert.strict.equal(validateRowsBeforeWrite([{ name: 'a' }, { id: '', name: 'b' }, { id: null }]), null, '未給主鍵且非必填 → 通過(由 ORM 自動產生)')
        assert.strict.equal(validateRowsBeforeWrite([{ id: 'T1', description: '<b>x</b> a < b x > y a<1' }, { id: 2 }]), null)
    })

    it('VR-002 非陣列 → rowsInvalid', function() {
        assert.strict.deepEqual(validateRowsBeforeWrite({ id: 'x' }), { reason: 'rowsInvalid', k: -1, field: '' })
    })

    it('VR-003 主鍵型別錯誤(物件、布林) → idInvalid; idRequired 時未給 → idInvalid', function() {
        assert.strict.deepEqual(validateRowsBeforeWrite([{ id: 'a' }, { id: { x: 1 } }]), { reason: 'idInvalid', k: 1, field: 'id' })
        assert.strict.deepEqual(validateRowsBeforeWrite([{ id: true }]), { reason: 'idInvalid', k: 0, field: 'id' })
        assert.strict.deepEqual(validateRowsBeforeWrite([{ name: 'a' }], { idRequired: true }), { reason: 'idInvalid', k: 0, field: 'id' })
    })

    it('VR-004 主鍵 UTF-8 位元組: 1978 通過、1979 拒(含多位元組字元)', function() {
        assert.strict.equal(maxIdBytes, 1978)
        assert.strict.equal(validateRowsBeforeWrite([{ id: 'x'.repeat(1978) }]), null)
        assert.strict.deepEqual(validateRowsBeforeWrite([{ id: 'x'.repeat(1979) }]), { reason: 'idTooLong', k: 0, field: 'id' })
        //'專' 為 3 B: 659 × 3 + 1 = 1978 通過; 660 × 3 = 1980 拒
        assert.strict.equal(validateRowsBeforeWrite([{ id: '專'.repeat(659) + 'x' }]), null)
        assert.strict.deepEqual(validateRowsBeforeWrite([{ id: '專'.repeat(660) }]), { reason: 'idTooLong', k: 0, field: 'id' })
    })

    it('VR-005 批內主鍵重複(字串與數字同值亦屬重複) → idDuplicate; rowsIdOnly 參與重複判定', function() {
        assert.strict.deepEqual(validateRowsBeforeWrite([{ id: 'a' }, { id: 'a' }]), { reason: 'idDuplicate', k: 1, field: 'id' })
        assert.strict.deepEqual(validateRowsBeforeWrite([{ id: '1' }, { id: 1 }]), { reason: 'idDuplicate', k: 1, field: 'id' })
        assert.strict.deepEqual(validateRowsBeforeWrite([{ id: 'a' }], { rowsIdOnly: [{ id: 'a' }] }), { reason: 'idDuplicate', k: -1, field: 'id' })
    })

    it('VR-006 rowsIdOnly 之列不驗欄位標記(未寫入之舊資料不阻擋)', function() {
        assert.strict.equal(validateRowsBeforeWrite([{ id: 'a', d: 'ok' }], { rowsIdOnly: [{ id: 'b', d: 'legacy<x' }] }), null)
    })

    it('VR-007 任一字串欄位含會被 clearXSS 改寫之標記 → htmlMarkup(回第一個違規之列與欄); 非字串欄位不驗', function() {
        assert.strict.deepEqual(validateRowsBeforeWrite([{ id: 'a', name: 'ok' }, { id: 'b', name: 'n', description: 'x<y' }]), { reason: 'htmlMarkup', k: 1, field: 'description' })
        assert.strict.deepEqual(validateRowsBeforeWrite([{ id: 'T1<x' }]), { reason: 'htmlMarkup', k: 0, field: 'id' })
        assert.strict.equal(validateRowsBeforeWrite([{ id: 'a', order: 1, flag: true, obj: { x: '<b' } }]), null, '數字、布林、物件欄位不驗(schema 欄位皆為字串或數字)')
    })

    it('VR-008 原型鍵名之主鍵不誤判重複(查表容器無原型, R-KEY-01)', function() {
        assert.strict.equal(validateRowsBeforeWrite([{ id: 'constructor' }, { id: 'toString' }, { id: '__proto__' }, { id: 'hasOwnProperty' }]), null)
    })

    //R-ORM-01(run05): NaN、±Infinity 與未給同視為未給(w-serv-orm 1.1.11 對之補值); idRequired 時即 idInvalid
    it('VR-009 主鍵為 NaN、±Infinity → 視為未給(不拒、不參與重複); idRequired 時 → idInvalid', function() {
        assert.strict.equal(validateRowsBeforeWrite([{ id: NaN }, { id: NaN }, { id: Infinity }, { id: -Infinity }]), null)
        assert.strict.equal(validateRowsBeforeWrite([{ id: 'Infinity' }, { id: Infinity }]), null, 'Infinity 不等於其字串形式之主鍵')
        assert.strict.deepEqual(validateRowsBeforeWrite([{ id: NaN }], { idRequired: true }), { reason: 'idInvalid', k: 0, field: 'id' })
        assert.strict.deepEqual(validateRowsBeforeWrite([{ id: -Infinity }], { idRequired: true }), { reason: 'idInvalid', k: 0, field: 'id' })
    })

    //上游等價: 同一語料經真 procOrm insert → 上游拒絕(主鍵) 或 存值≠送入值(非主鍵) ⇔ 本判準拒絕
    it('VR-EQ-001 與真 procOrm(w-serv-orm 1.1.10 + wsemi clearXSS)逐筆等價(主鍵與非主鍵欄位)', async function() {
        let bad = []
        for (let s of CORPUS) {
            //非主鍵欄位: targets.description
            {
                let woItems = { targets: mkTable([]), pemis: mkTable([]), grups: mkTable([]), users: mkTable([]) }
                let procOrm = mkProcOrm(ds, woItems)
                await procOrm('id-u', 'targets', 'insert', [{ id: 'T-eq', description: s }])
                let stored = woItems.targets.get('T-eq').description
                let upstreamChanges = stored !== s
                let mineRejects = validateRowsBeforeWrite([{ id: 'T-eq', description: s }]) !== null
                if (upstreamChanges !== mineRejects) {
                    bad.push(`description ${JSON.stringify(s)}: 上游${upstreamChanges ? '改寫為 ' + JSON.stringify(stored) : '原樣'}, 本判準${mineRejects ? '拒' : '過'}`)
                }
            }
            //主鍵: targets.id
            {
                let woItems = { targets: mkTable([]), pemis: mkTable([]), grups: mkTable([]), users: mkTable([]) }
                let procOrm = mkProcOrm(ds, woItems)
                let upstreamRejects = false
                try {
                    await procOrm('id-u', 'targets', 'insert', [{ id: s, description: 'd' }])
                    upstreamRejects = !woItems.targets.has(s)
                }
                catch (err) {
                    upstreamRejects = true
                }
                let mineRejects = validateRowsBeforeWrite([{ id: s, description: 'd' }]) !== null
                if (upstreamRejects !== mineRejects) {
                    bad.push(`id ${JSON.stringify(s)}: 上游${upstreamRejects ? '拒' : '過'}, 本判準${mineRejects ? '拒' : '過'}`)
                }
            }
        }
        assert.strict.deepEqual(bad, [], bad.join('\n'))
    })

    //R-ORM-04: 數字主鍵於上游(w-serv-orm 1.1.11 起)存為其字串形式並回報字串 ⇔ 本判準通過(不拒、不改寫); 數字與其字串形式本判準判為重複(VR-005)
    //(依 w-serv-orm 主責 agent 之建議書 3.5-2; 數字不混入 VR-EQ-001 之字串語料, 因其以 woItems.targets.has(s) 判定上游是否拒絕)
    it('VR-EQ-003 數字主鍵與真 procOrm 等價: 上游存為其字串形式且回報字串, 本判準通過', async function() {
        for (let n of [123, 0, -5, 1.5]) {
            let woItems = { targets: mkTable([]), pemis: mkTable([]), grups: mkTable([]), users: mkTable([]) }
            let procOrm = mkProcOrm(ds, woItems)
            let r = await procOrm('id-u', 'users', 'insert', [{ id: n, name: 'u', email: 'u@example.com' }])
            assert.strict.deepEqual(r, [{ id: String(n) }], `回報之 id 為字串(${n})`)
            assert.strict.ok(woItems.users.has(String(n)) && !woItems.users.has(n), `以字串為鍵存放(${n})`)
            assert.strict.equal(validateRowsBeforeWrite([{ id: n, name: 'u' }]), null, `本判準通過(${n})`)
        }
    })

    //判準複製自上游之前提: 全樹只有一份 wsemi(否則 w-serv-orm 用之 clearXSS 可能與本套件不同版)
    it('VR-EQ-002 全樹只有一份 wsemi', function() {
        let out = execSync('npm ls wsemi --all --parseable', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
        let paths = [...new Set(out.split(/\r?\n/).filter((l) => /[\\/]wsemi$/.test(l.trim())))]
        assert.strict.equal(paths.length, 1, `wsemi 應只有一份, 實得 ${paths.join(', ')}`)
    })


    // ===== R-OBJ-ITER-01: 列物件含數字 length 欄位時, 字串欄位仍須逐一檢查(lodash each 會把物件當陣列樣迭代而漏檢) =====
    //建議書 建議w-web-perm修正.md §1: `{id:'a',length:1,name:'<script>x</script>'}` 與 `length:0` 修正前回 null(通過).
    //本函數的承諾(檔頭 JSDoc 第 2 點)為「任一字串欄位之值會被 clearXSS 改寫者即拒絕」, 與列內是否有名為 length 之欄位無關.

    it('VR-OI-001 列含數字 length 欄位(0、1、2、100) 且字串欄位含標記 → htmlMarkup(回該列與欄)', function() {
        for (let n of [0, 1, 2, 100]) {
            assert.strict.deepEqual(
                validateRowsBeforeWrite([{ id: 'a', length: n, name: '<script>x</script>' }]),
                { reason: 'htmlMarkup', k: 0, field: 'name' },
                `length:${n}`
            )
        }
        //標記在主鍵、在第 2 列、在 length 之後的欄位
        assert.strict.deepEqual(validateRowsBeforeWrite([{ id: 'T1<x', length: 0 }]), { reason: 'htmlMarkup', k: 0, field: 'id' })
        assert.strict.deepEqual(
            validateRowsBeforeWrite([{ id: 'a', length: 0, name: 'ok' }, { id: 'b', length: 1, name: 'n', description: 'x<y' }]),
            { reason: 'htmlMarkup', k: 1, field: 'description' }
        )
        //回報第一個違規之欄位(依鍵順序): length 在中間不影響順序
        assert.strict.deepEqual(
            validateRowsBeforeWrite([{ id: 'a', length: 0, name: 'a<b', description: 'c<d' }]),
            { reason: 'htmlMarkup', k: 0, field: 'name' }
        )
    })

    it('VR-OI-002 巨大 length(2**32-1、Number.MAX_SAFE_INTEGER、1e9) → 仍檢出標記且毫秒內完成(成本只依實際鍵數, 與 length 之值無關)', function() {
        //子行程: 修前 lodash 對 length: 2**32-1 空轉約 80 秒(MAX_SAFE_INTEGER 為實質無窮迴圈), mocha 逾時無法中斷同步迴圈
        let code = `
            import validateRowsBeforeWrite from ${fileUrl('server/validateRows.mjs')}
            let out = []
            for (let n of [2 ** 32 - 1, Number.MAX_SAFE_INTEGER, 1e9]) {
                out.push(validateRowsBeforeWrite([{ id: 'a', length: n, name: '<script>x</script>' }]))
            }
            //無標記之合法列帶巨大 length → 通過(不誤拒)
            out.push(validateRowsBeforeWrite([{ id: 'a', length: 2 ** 32 - 1, name: 'ok' }]))
            console.log(JSON.stringify(out))
        `
        let c = runChild(code, { timeoutMs: 20000 })
        assert.strict.ok(c.ok, `子行程應正常結束(修前逾時): ${describeChild(c)}`)
        assert.strict.deepEqual(c.result, [...Array(3).fill({ reason: 'htmlMarkup', k: 0, field: 'name' }), null])
        assert.strict.ok(c.ms < 15000, `應快速完成, 實得 ${c.ms} ms`)
    })

    it('VR-OI-003 length 不是合法長度(負數、小數、字串、null、布林、物件、陣列、2**53) 時仍檢出標記(迴歸: 這些值修前即不走陣列樣迭代)', function() {
        for (let n of [-1, 1.5, '3', null, true, { a: 1 }, [1], 2 ** 53]) {
            assert.strict.deepEqual(
                validateRowsBeforeWrite([{ id: 'a', length: n, name: 'x<y' }]),
                { reason: 'htmlMarkup', k: 0, field: 'name' },
                `length:${JSON.stringify(n)}`
            )
        }
    })

    it('VR-OI-004 length 欄位本身是字串且含標記 → 回報欄位 length; 無標記之列帶 length(數字或字串) → null(不誤拒)', function() {
        assert.strict.deepEqual(validateRowsBeforeWrite([{ id: 'a', length: 'a<b' }]), { reason: 'htmlMarkup', k: 0, field: 'length' })
        assert.strict.equal(validateRowsBeforeWrite([{ id: 'a', length: 0, name: 'ok' }, { id: 'b', length: 5, description: '<b>x</b> a < b' }, { id: 'c', length: 'abc' }]), null)
    })

    it('VR-OI-005 rowsIdOnly 之列帶 length: 仍參與主鍵重複判定, 欄位標記仍不驗', function() {
        assert.strict.deepEqual(
            validateRowsBeforeWrite([{ id: 'a' }], { rowsIdOnly: [{ id: 'a', length: 0, d: 'x<y' }] }),
            { reason: 'idDuplicate', k: -1, field: 'id' }
        )
        assert.strict.equal(validateRowsBeforeWrite([{ id: 'a', d: 'ok' }], { rowsIdOnly: [{ id: 'b', length: 1, d: 'legacy<x' }] }), null)
    })

    it('VR-OI-006 以 Symbol.toStringTag 偽稱 Array 之物件不是陣列: rows → rowsInvalid、rowsIdOnly → 視為未給(不依其 length 迭代)', function() {
        let fake = (len) => Object.defineProperty({ 0: { id: 'a', name: 'x<y' }, length: len }, Symbol.toStringTag, { value: 'Array' })
        assert.strict.deepEqual(validateRowsBeforeWrite(fake(1)), { reason: 'rowsInvalid', k: -1, field: '' })
        assert.strict.deepEqual(validateRowsBeforeWrite(fake(0)), { reason: 'rowsInvalid', k: -1, field: '' })
        assert.strict.equal(validateRowsBeforeWrite([{ id: 'a' }], { rowsIdOnly: fake(1) }), null, '偽陣列之 rowsIdOnly 不參與重複判定')
        //巨大 length 之偽陣列: 子行程驗毫秒內回應(修前依 length 迭代而空轉)
        let code = `
            import validateRowsBeforeWrite from ${fileUrl('server/validateRows.mjs')}
            let fake = Object.defineProperty({ 0: { id: 'a' }, length: 2 ** 32 - 1 }, Symbol.toStringTag, { value: 'Array' })
            console.log(JSON.stringify([validateRowsBeforeWrite(fake), validateRowsBeforeWrite([{ id: 'a' }], { rowsIdOnly: fake })]))
        `
        let c = runChild(code, { timeoutMs: 20000 })
        assert.strict.ok(c.ok, `子行程應正常結束(修前逾時): ${describeChild(c)}`)
        assert.strict.deepEqual(c.result, [{ reason: 'rowsInvalid', k: -1, field: '' }, null])
    })

    //外審 sol#8: 列物件本身以 Symbol.toStringTag 偽稱 Array 時, 依 toString 判型之 iseobj 會略過其全部欄位; 列只要是物件(非 null、非真陣列)就逐欄檢查
    it('VR-OI-007 列物件以 Symbol.toStringTag 偽稱 Array(自有鍵仍為 id／name) → 仍逐欄檢查(htmlMarkup); 真陣列元素與 null、原始值之列不檢欄位', function() {
        let spoof = Object.defineProperty({ id: 'spoof', name: 'x<y' }, Symbol.toStringTag, { value: 'Array' })
        assert.strict.deepEqual(validateRowsBeforeWrite([spoof]), { reason: 'htmlMarkup', k: 0, field: 'name' })
        //列為陣列、null、字串、數字: 不是物件列, 不檢欄位(主鍵檢查另行: 無 id 視為未給)
        assert.strict.equal(validateRowsBeforeWrite([['a<b'], null, 'x<y', 5]), null)
    })

})
