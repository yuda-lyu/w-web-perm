//授權與資料歸屬之查值不得把使用端的 id／名稱當 lodash 路徑(規則帳本 R-AUTH-PATH-01; ADR-029 Update)
//
//受測: src/js/getOwn.mjs 之 getOwn(o, k, def)(自有屬性才取值, 不解析路徑、不取繼承屬性).
//GO-0xx: 函數契約(對照 lodash get 的差異). SITE-GO-0xx: 站點不變式(規則帳本站點 25、26、27、28)的可執行版——
//  授權查值與歸屬比對站點皆用 getOwn、以使用者資料為鍵之容器為無原型; server／src 內不得新增以 kp 類變數為首參、以非字面值為鍵之 lodash get.
//行為案例: unit-getUserRules(UNIT-AP-*)、unit-perm-active(PA-*)、unit-procCore-mergePickKeysOnly(UNIT-PK-AP-*)、unit-procCore-updateTabItems(UNIT-UTI-011)、api-getPermUserInfor(API-getPermUserInfor-008).
//跑法: npx mocha --no-parallel test/unit-getOwn.test.mjs --timeout 60000
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import get from 'lodash-es/get.js'
import JSON5 from 'json5'
import getOwn from '../src/js/getOwn.mjs'
import getRuleEnable from '../src/js/getRuleEnable.mjs'
import { sourceLines } from './tools/srcScan.mjs'


const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

//codeOf: 檔案可執行碼(略過註解)串成一字串
let codeOf = (rel) => sourceLines(path.join(projRoot, rel), 'code').map((l) => l.text).join('\n')


describe('unit-getOwn (R-AUTH-PATH-01)', function() {

    it('GO-001 自有屬性: 取值(含 0、空字串、null、false、undefined 之自有值); 不存在回預設值', function() {
        let o = { a: 'y', z: 0, e: '', n: null, f: false, u: undefined }
        assert.strict.equal(getOwn(o, 'a', 'D'), 'y')
        assert.strict.equal(getOwn(o, 'z', 'D'), 0)
        assert.strict.equal(getOwn(o, 'e', 'D'), '')
        assert.strict.equal(getOwn(o, 'n', 'D'), null)
        assert.strict.equal(getOwn(o, 'f', 'D'), false)
        assert.strict.equal(getOwn(o, 'u', 'D'), undefined, '自有值為 undefined 時回該值(自有屬性存在)')
        assert.strict.equal(getOwn(o, 'nope', 'D'), 'D')
        assert.strict.equal(getOwn(o, 'nope'), undefined, '未給預設值回 undefined')
    })

    it('GO-002 不解析路徑: 含 . 或 [ 之鍵只視為完整鍵名(lodash get 會逐段取值: A.0 得 y、A.length 得 1)', function() {
        let o = { A: 'y', B: { c: 'deep' }, arr: ['x'] }
        assert.strict.equal(get(o, 'A.0', 'D'), 'y', '對照: lodash 以路徑取字串索引')
        assert.strict.equal(get(o, 'A.length', 'D'), 1, '對照: lodash 取字串 length')
        assert.strict.equal(getOwn(o, 'A.0', 'D'), 'D')
        assert.strict.equal(getOwn(o, 'A[0]', 'D'), 'D')
        assert.strict.equal(getOwn(o, 'A.length', 'D'), 'D')
        assert.strict.equal(getOwn(o, 'B.c', 'D'), 'D')
        assert.strict.equal(getOwn(o, 'arr[0]', 'D'), 'D')
        //精確鍵(整串即鍵名)照常
        let p = { 'A.0': 'v1', 'B[0]': 'v2', 'x.y.z': 'v3' }
        assert.strict.deepEqual(['A.0', 'B[0]', 'x.y.z'].map((k) => getOwn(p, k, 'D')), ['v1', 'v2', 'v3'])
        assert.strict.equal(getOwn(p, 'x.y', 'D'), 'D')
    })

    it('GO-003 不取繼承屬性: constructor、toString、__proto__、hasOwnProperty 等原型鍵名未自有時回預設值; 自有時(含 defineProperty 設之 __proto__)回自有值', function() {
        let o = { A: 'y' }
        for (let k of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
            assert.strict.equal(getOwn(o, k, 'D'), 'D', k)
        }
        assert.strict.equal(typeof get(o, 'toString', 'D'), 'function', '對照: lodash get 取到繼承函數')
        let q = { constructor: 'own-c', toString: 'own-t' }
        Object.defineProperty(q, '__proto__', { value: 'own-p', enumerable: true, writable: true, configurable: true })
        assert.strict.deepEqual(['constructor', 'toString', '__proto__'].map((k) => getOwn(q, k, 'D')), ['own-c', 'own-t', 'own-p'])
        //無原型物件
        let n = Object.create(null)
        n.a = 1
        n['__proto__'] = 2
        assert.strict.deepEqual([getOwn(n, 'a', 'D'), getOwn(n, '__proto__', 'D'), getOwn(n, 'b', 'D')], [1, 2, 'D'])
    })

    it('GO-004 非物件輸入(null、undefined、字串、數字、布林): 一律回預設值(lodash get 對字串取 length 得 3)', function() {
        for (let v of [null, undefined, 'abc', '', 5, 0, true, false]) {
            assert.strict.equal(getOwn(v, 'length', 'D'), 'D', String(v))
            assert.strict.equal(getOwn(v, 'a', 'D'), 'D', String(v))
        }
        assert.strict.equal(get('abc', 'length', 'D'), 3, '對照: lodash')
    })

    it('GO-005 陣列: 以索引字串取自有元素; 不解析路徑', function() {
        assert.strict.equal(getOwn(['x', 'y'], '1', 'D'), 'y')
        assert.strict.equal(getOwn(['x', 'y'], '5', 'D'), 'D')
        assert.strict.equal(getOwn(['x'], '[0]', 'D'), 'D')
    })


    //外審 sol(run03)#2: 編輯對話框(VeCrules)與 getUserRules 對 crules 值之解碼須一致——物件形式之值(如 { isActive: 'y' })取 isActive,
    //修前編輯器只認字串 'y', 物件值被顯示為 n, 存檔即把有效授權靜默改成 n
    it('RE-001 getRuleEnable: 與 getUserRules 同一解碼——字串值依 y／n; 物件值取 isActive; 缺漏、非字串、無 isActive 之物件皆 n', function() {
        let kp = { A: 'y', B: 'n', C: { isActive: 'y' }, D: { isActive: 'n' }, E: {}, F: 1, G: null, H: ['y'], I: { mode: 'OR' } }
        assert.strict.deepEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'Z'].map((k) => getRuleEnable(kp, k)), ['y', 'n', 'y', 'n', 'n', 'n', 'n', 'n', 'n', 'n'])
    })

    it('RE-002 getRuleEnable: 名稱是資料不是路徑、不取繼承屬性; 原型鍵名自有時依其值(含 __proto__)', function() {
        assert.strict.deepEqual(['A.0', 'A[0]', 'A.length', 'toString', 'constructor', '__proto__'].map((k) => getRuleEnable({ A: 'y' }, k)), ['n', 'n', 'n', 'n', 'n', 'n'])
        let kp = JSON5.parse('{"__proto__":"y","constructor":{"isActive":"y"},"A.0":"y"}')
        assert.strict.deepEqual(['__proto__', 'constructor', 'A.0', 'A'].map((k) => getRuleEnable(kp, k)), ['y', 'y', 'y', 'n'])
        assert.strict.equal(getRuleEnable(null, 'A'), 'n')
        assert.strict.equal(getRuleEnable('abc', 'length'), 'n')
    })


    // ===== 站點不變式(規則帳本 R-AUTH-PATH-01 站點 25、26、27、28) =====

    it('SITE-GO-001 授權查值與歸屬比對站點逐站使用 getOwn(預期呼叫開頭), 且不再以 lodash get 解析使用端鍵', function() {
        let sites = {
            'src/plugins/mShare.mjs': { heads: ["getOwn(kp, t.id, 'n')"], forbid: [/\bget\(\s*kp\s*,\s*t\.id/], imp: /import getOwn from '\.\.\/js\/getOwn\.mjs'/ },
            'src/perm.mjs': { heads: ["getOwn(_kpRule, key, '')"], forbid: [/\bget\(\s*_kpRule\b/], imp: /import getOwn from '\.\/js\/getOwn\.mjs'/ },
            'server/procCore.mjs': { heads: ['getOwn(kpIn, v, null)'], forbid: [/\bget\(\s*kpIn\b/], imp: /import getOwn from '\.\.\/src\/js\/getOwn\.mjs'/ },
            'src/components/VeCrules.vue': { heads: ['getRuleEnable(kpRule, v.id)'], forbid: [/\bget\(\s*kpRule\s*,\s*v\.id/], imp: /import getRuleEnable from '\.\.\/js\/getRuleEnable\.mjs'/ },
            'src/js/getRuleEnable.mjs': { heads: ['getOwn(kp, name, \'\')'], forbid: [/\bget\(\s*kp\s*,\s*name/], imp: /import getOwn from '\.\/getOwn\.mjs'/ },
            'src/components/VeCgrups.vue': { heads: ['getOwn(kpGrup, v.name, null)'], forbid: [/\bget\(\s*kpGrup\s*,\s*v\.name/], imp: /import getOwn from '\.\.\/js\/getOwn\.mjs'/ },
            'src/components/VeCpemis.vue': { heads: ['getOwn(kpPemi, v.name, null)'], forbid: [/\bget\(\s*kpPemi\s*,\s*v\.name/], imp: /import getOwn from '\.\.\/js\/getOwn\.mjs'/ },
        }
        for (let [rel, s] of Object.entries(sites)) {
            let c = codeOf(rel)
            assert.strict.ok(s.imp.test(c), `${rel} 應 import 自有屬性查值函數(${s.imp})`)
            for (let h of s.heads) {
                assert.strict.equal(c.split(h).length - 1, 1, `${rel} 應有 1 處「${h}」`)
            }
            for (let re of s.forbid) {
                assert.strict.ok(!re.test(c), `${rel} 不得以 lodash get 解析使用端鍵: ${re}`)
            }
        }
    })

    it('SITE-GO-002 以使用者資料為鍵之容器為無原型(R-KEY-01): mShare 之權限合併與展開、procCore 之 kpIdOld; perm.mjs 以 defineProperty 設自有屬性', function() {
        let ms = codeOf('src/plugins/mShare.mjs')
        assert.strict.ok(!/\blet kp(Rule)? = \{\}/.test(ms), 'mShare 之 kp／kpRule 容器不得為一般物件')
        assert.strict.ok(!/cloneDeep\(obj1\)/.test(ms), 'objAND 不得以 cloneDeep 複製(會把無原型物件複製成一般物件)')
        assert.strict.ok(/let kpRule = Object\.create\(null\)/.test(ms) && /let kp = Object\.create\(null\)/.test(ms), 'mShare 應以 Object.create(null) 建立容器')
        let pc = codeOf('server/procCore.mjs')
        assert.strict.ok(/let kpIdOld = Object\.create\(null\)/.test(pc) && !/let kpIdOld = \{\}/.test(pc), 'procCore 之 kpIdOld 應為無原型容器')
        let pm = codeOf('src/perm.mjs')
        assert.strict.ok(/Object\.defineProperty\(kpRule, name,/.test(pm), 'perm.mjs 應以 defineProperty 設規則名(__proto__ 亦為自有屬性), _kpRule 維持一般物件以保留 getKpRule() 之型別')
        //編輯對話框寫出端(外審 minimax#1): 存檔用之 JSON 容器 kpRule／kpGrup／kpPemi／kpGrupNew／kpPemiNew 為無原型容器,
        //否則名稱為 __proto__ 之標的／群組／權限在介面顯示已啟用、存檔卻被靜默丟棄(字串指派被忽略, 物件指派改了容器的原型)
        //2026-10-21 run03(R-REL-PARSE-01): 兩個關聯對話框各 +3(genItems／revRows／doSave 之 `try { kpGrup|kpPemi = cvKpToObj(JSON5.parse(…)) }` 前之空容器初值, 解碼失敗時沿用), 基線 1 → 4
        let vues = { 'src/components/VeCrules.vue': 2, 'src/components/VeCgrups.vue': 2, 'src/components/VeCpemis.vue': 2, 'src/components/VeGrupBlngUsers.vue': 4, 'src/components/VePemiBlngGrups.vue': 4 }
        for (let [rel, n] of Object.entries(vues)) {
            let c = codeOf(rel)
            assert.strict.ok(!/let (kpRule|kpGrup|kpPemi|kpGrupNew|kpPemiNew) = \{\}/.test(c), `${rel} 之 JSON 容器不得為一般物件`)
            assert.strict.equal((c.match(/let (kpRule|kpGrup|kpPemi|kpGrupNew|kpPemiNew) = Object\.create\(null\)/g) || []).length, n, `${rel} 應有 ${n} 處無原型 JSON 容器`)
        }
    })

    it('SITE-GO-003 server／src 內不得新增「以 kp 類變數為首參、以非字面值為鍵」之 lodash get／has／set(新增者須先判斷鍵是否為使用端 id／名稱, 是則改 getOwn)', function() {
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
        //首參: kp*／_kp*／cgrups*／cpemis*／crules*／parsed* 之解析或對照物件; 鍵: 不是引號字串字面值
        let re = /\b(get|has|hasIn|set|unset|update)\(\s*([\w.]*\b(?:kp|cgrups|cpemis|crules|parsed)\w*)\s*,\s*([^'"`\s][^,)]*)/g
        //允許清單(逐「檔案::首參」; 規則帳本站點 30): 語系與圖示字典, 鍵為程式碼常數或伺服端(procLang)給定之語系鍵, 非使用端 id／名稱, 亦非授權或資料歸屬
        let allow = new Set(['src/plugins/mUI.mjs::kpLang', 'src/plugins/mUI.mjs::kpText', 'src/plugins/mUI.mjs::kpIcon'])
        let bad = []
        for (let fp of files) {
            for (let l of sourceLines(fp, 'code')) {
                let m = null
                re.lastIndex = 0
                while ((m = re.exec(l.text)) !== null) {
                    let rel = path.relative(projRoot, fp).split(path.sep).join('/')
                    if (!allow.has(`${rel}::${m[2]}`)) {
                        bad.push(`${rel}:${l.no}: ${m[1]}(${m[2]}, ${m[3]}…)`)
                    }
                }
            }
        }
        assert.strict.deepEqual(bad, [], `未改 getOwn 之動態鍵查值:\n${bad.join('\n')}`)
    })

})
