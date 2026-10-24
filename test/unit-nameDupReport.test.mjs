//名稱重複與對應鍵稽核工具之單元測試(F-02／F-14; 規則帳本 R-NAME-UNIQ-03). 受測: server/tools/nameDupReport.mjs(唯讀稽核; 輸入 { users, grups, pemis, targets }).
//
//述語:
//  ND-1 grups／pemis 同名組(精確 ===)逐組列出各筆 id／from／isActive／order, 單一名稱不列; 大小寫或空白不同不算同名;
//  ND-2 被引用者: grups 同名 ← users.cgrups(物件形式、陣列形式、帶 mode／isActive)、pemis 同名 ← grups.cpemis; 只計名稱出現之引用; 壞 JSON 容錯(不拋、列入壞 JSON 清單);
//  ND-3 users 對應鍵(--mapping-by): 預設 email 與 name 皆報告, 指定時只報該鍵; 只計 isActive==='y'; 空／空白／非字串與值重複(精確 ===)分列; id 只報缺漏;
//  ND-4 唯讀(不改輸入檔), CLI 兩種寫法(位置參數／--audit)、--json、參數錯誤離開碼 2.
//跑法: npx mocha test/unit-nameDupReport.test.mjs --reporter list --timeout 30000
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { execFileSync, spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import { buildReport, formatReport, decodeRefs } from '../server/tools/nameDupReport.mjs'


const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOOL = path.join(projRoot, 'server', 'tools', 'nameDupReport.mjs')
const TMP = path.join(projRoot, 'test', '_tmp', 'nameDupReport')


function fixture() {
    return {
        users: [
            { id: 'u1', name: 'admin', email: 'a@x.com', from: '', isActive: 'y', cgrups: `{ 'G1': { mode: 'OR', isActive: 'y' }, 'G2': { mode: 'AND', isActive: 'y' } }` },
            { id: 'u2', name: 'peter', email: 'a@x.com', from: 'app', isActive: 'y', cgrups: JSON.stringify([{ name: 'G1', mode: 'AND', isActive: 'n' }]) },
            { id: 'u3', name: 'peter', email: '  ', from: 'app', isActive: 'y', cgrups: '{oops' }, //空白 email、壞 JSON
            { id: 'u4', name: 'mary', email: '', from: '', isActive: 'n', cgrups: '' }, //inactive: 不報
            { id: 'u5', name: 'john', email: 'J@x.com', from: '', isActive: 'y', cgrups: '{}' },
            { id: 'u6', name: 'john2', email: 'j@x.com', from: '', isActive: 'y', cgrups: '{}' }, //僅大小寫不同: 不算重複
        ],
        grups: [
            { id: 'g1', name: 'G1', from: '', isActive: 'y', order: 1, cpemis: `{ 'P1': { mode: 'OR', isActive: 'y' } }` },
            { id: 'g2', name: 'G1', from: 'app', isActive: 'n', order: 2, cpemis: JSON.stringify([{ name: 'P1', mode: 'OR', isActive: 'y' }, { name: 'P2', mode: 'OR', isActive: 'y' }]) },
            { id: 'g3', name: 'G2', from: '', isActive: 'y', order: 3, cpemis: '[[[bad' },
            { id: 'g4', name: 'g1', from: '', isActive: 'y', order: 4, cpemis: '{}' }, //僅大小寫不同: 不算同名
        ],
        pemis: [
            { id: 'p1', name: 'P1', from: '', isActive: 'y', order: 1, crules: '{}' },
            { id: 'p2', name: 'P1', from: 'app', isActive: 'y', order: 2, crules: '{}' },
            { id: 'p3', name: 'P2', from: '', isActive: 'y', order: 3, crules: '{}' },
            { id: 'p4', name: 'P1 ', from: '', isActive: 'y', order: 4, crules: '{}' }, //前後空白不同: 不算同名
        ],
        targets: [{ id: 'T1' }],
    }
}

let sha1 = (fp) => crypto.createHash('sha1').update(fs.readFileSync(fp)).digest('hex')


describe('unit-nameDupReport (名稱重複與對應鍵稽核工具)', function() {

    before(function() {
        fs.mkdirSync(TMP, { recursive: true })
    })

    after(function() {
        fs.rmSync(TMP, { recursive: true, force: true })
    })


    it('ND-001 同名組逐組列出各筆 id／from／isActive／order; 單一名稱、僅大小寫或空白不同者不列', function() {
        let rp = buildReport(fixture())
        assert.strict.deepEqual(rp.counts, { users: 6, grups: 4, pemis: 4, targets: 1 })
        assert.strict.deepEqual(rp.grups.map((g) => g.name), ['G1'])
        assert.strict.deepEqual(rp.grups[0].rows, [
            { id: 'g1', from: '', isActive: 'y', order: 1 },
            { id: 'g2', from: 'app', isActive: 'n', order: 2 },
        ])
        assert.strict.deepEqual(rp.pemis.map((g) => g.name), ['P1'])
        assert.strict.deepEqual(rp.pemis[0].rows.map((r) => r.id), ['p1', 'p2'])
    })

    it('ND-002 被引用者: 群組名 ← users.cgrups(物件／陣列形式, 含 mode／isActive); 權限名 ← grups.cpemis; 壞 JSON 容錯並列入清單', function() {
        let rp = buildReport(fixture())
        assert.strict.deepEqual(rp.grups[0].refs, [
            { id: 'u1', name: 'admin', mode: 'OR', isActive: 'y' },
            { id: 'u2', name: 'peter', mode: 'AND', isActive: 'n' },
        ])
        assert.strict.deepEqual(rp.pemis[0].refs, [
            { id: 'g1', name: 'G1', mode: 'OR', isActive: 'y' },
            { id: 'g2', name: 'G1', mode: 'OR', isActive: 'y' },
        ])
        assert.strict.deepEqual(rp.badJson.sort((a, b) => (a.table + a.id).localeCompare(b.table + b.id)), [{ table: 'grups', id: 'g3' }, { table: 'users', id: 'u3' }])
    })

    it('ND-003 decodeRefs: 空字串／空白為無內容、壞 JSON 回 null、非字串回無內容', function() {
        assert.strict.deepEqual(decodeRefs(''), [])
        assert.strict.deepEqual(decodeRefs('   '), [])
        assert.strict.equal(decodeRefs('{oops'), null)
        assert.strict.deepEqual(decodeRefs(undefined), [])
        assert.strict.deepEqual(decodeRefs(`{ 'A': 'y' }`), [{ name: 'A', mode: undefined, isActive: 'y' }])
    })

    it('ND-004 users 對應鍵預設報 email 與 name: 只計 active; 空／空白與重複分列; 僅大小寫不同不算重複', function() {
        let rp = buildReport(fixture())
        assert.strict.deepEqual(Object.keys(rp.mapKey).sort(), ['email', 'name'])
        assert.strict.deepEqual(rp.mapKey.email.empty.map((u) => u.id), ['u3'], 'u4 為 inactive 不報')
        assert.strict.deepEqual(rp.mapKey.email.dup.map((g) => [g.value, g.rows.map((u) => u.id)]), [['a@x.com', ['u1', 'u2']]])
        assert.strict.deepEqual(rp.mapKey.name.empty, [])
        assert.strict.deepEqual(rp.mapKey.name.dup.map((g) => [g.value, g.rows.map((u) => u.id)]), [['peter', ['u2', 'u3']]])
    })

    it('ND-005b mappingBy=id 報「登入識別撞值」(perm-run05, R-MAPKEY-05): 不論 isActive、含他來源; 兩後台列與同來源兩外部列不報; 外部列之內部 id 不是登入識別; 舊外部列(無 srcKey)以 id 參與; 文字報告含撞值段', function() {
        let u = (o) => ({ name: o.id, email: `${o.id}@x.com`, from: '', isActive: 'y', cgrups: '{}', ...o })
        let d = {
            users: [
                u({ id: 'b-k' }), //後台列 k(登入識別 b-k)
                u({ id: 'sys-1', srcKey: 'b-k', from: 'appA', isActive: 'n' }), //停用之外部列 srcKey 等於後台列 id → 撞(adminId)
                u({ id: 'sys-2', srcKey: 'dup', from: 'appA' }), u({ id: 'sys-3', srcKey: 'dup', from: 'appB', isActive: 'n' }), //他來源同 srcKey, 一停用 → 撞(otherFrom)
                u({ id: 'sys-4', srcKey: 'same', from: 'appA' }), u({ id: 'sys-5', srcKey: 'same', from: 'appA', isActive: 'n' }), //同來源同 srcKey(其一停用): 登入命中兩筆即拒、同步回 srcKeyConflict → 須列出(scope sameSource; 外審 sol 第一輪#5)
                u({ id: 'old-2', from: 'appE' }), u({ id: 'sys-10', srcKey: 'old-2', from: 'appE' }), //同來源一為舊形(無 srcKey, 登入識別為其 id)、一有 srcKey 等於該 id(claimTwice 形) → 跨來源撞值組合(crossSource)
                u({ id: 'old-1', from: 'appC' }), u({ id: 'sys-6', srcKey: 'old-1', from: 'appD' }), //舊外部列(無 srcKey)以 id 參與 → 撞
                u({ id: 'sys-7', srcKey: 'guid-7', from: 'appA' }), u({ id: 'guid-7x', from: '' }), //外部列內部 id 與他列無關
                u({ id: 'sys-8', srcKey: 'sys-9', from: 'appA' }), u({ id: 'sys-9', srcKey: 'guid-9', from: 'appB' }), //外部列 sys-8 之 srcKey 等於另一外部列的內部 id: 內部 id 不是登入識別 → 不撞
            ],
        }
        let rp = buildReport(d, { mappingBy: 'id' })
        assert.strict.deepEqual(Object.keys(rp.mapKey), ['id'])
        assert.strict.deepEqual(rp.mapKey.id.empty, [])
        let got = rp.mapKey.id.dup.map((g) => [g.value, g.scope, g.rows.map((r) => `${r.id}:${r.isActive}`).sort()]).sort((a, b) => (a[0] < b[0] ? -1 : 1))
        assert.strict.deepEqual(got, [
            ['b-k', 'crossSource', ['b-k:y', 'sys-1:n']],
            ['dup', 'crossSource', ['sys-2:y', 'sys-3:n']],
            ['old-1', 'crossSource', ['old-1:y', 'sys-6:y']],
            ['old-2', 'crossSource', ['old-2:y', 'sys-10:y']],
            ['same', 'sameSource', ['sys-4:y', 'sys-5:n']],
        ])
        let txt = formatReport(rp)
        for (let s of ['對應鍵 id', '撞值 5 組', '跨來源撞值「b-k」2 筆', '同來源重複「same」2 筆', 'isActive="n"']) {
            assert.strict.ok(txt.includes(s), `報告應含「${s}」: ${txt}`)
        }
        //mappingBy 為 email／name 時不受影響(不含 id 段)
        assert.strict.deepEqual(Object.keys(buildReport(d, { mappingBy: 'email' }).mapKey), ['email'])
    })

    it('ND-005 --mapping-by 指定時只報該鍵; id 報缺漏與登入識別撞值(無撞值時 dup 為空)', function() {
        assert.strict.deepEqual(Object.keys(buildReport(fixture(), { mappingBy: 'email' }).mapKey), ['email'])
        assert.strict.deepEqual(Object.keys(buildReport(fixture(), { mappingBy: 'name' }).mapKey), ['name'])
        let d = fixture()
        d.users.push({ id: '', name: 'noid', email: 'n@x.com', from: '', isActive: 'y', cgrups: '{}' })
        let rp = buildReport(d, { mappingBy: 'id' })
        assert.strict.deepEqual(Object.keys(rp.mapKey), ['id'])
        assert.strict.deepEqual(rp.mapKey.id.empty.map((u) => u.name), ['noid'])
        assert.strict.deepEqual(rp.mapKey.id.dup, [])
    })

    it('ND-006 空資料／缺表不拋錯', function() {
        let rp = buildReport({})
        assert.strict.deepEqual(rp.counts, { users: 0, grups: 0, pemis: 0, targets: 0 })
        assert.strict.deepEqual(rp.grups, [])
        assert.strict.ok(formatReport(rp).includes('同名組: 0 組'))
        assert.strict.doesNotThrow(() => buildReport(null))
    })

    it('ND-007 文字報告含同名組、引用者、對應鍵重複與壞 JSON 段', function() {
        let txt = formatReport(buildReport(fixture()))
        for (let s of ['群組(grups)同名組: 1 組', '「G1」2 筆', 'user id=u1', '權限(pemis)同名組: 1 組', '重複「a@x.com」2 筆', '壞 JSON']) {
            assert.strict.ok(txt.includes(s), `報告應含「${s}」`)
        }
    })

    it('ND-008 CLI: 位置參數與 --audit 兩種寫法輸出相同; --json 為合法 JSON; 輸入檔不被修改(唯讀)', function() {
        let fp = path.join(TMP, 'in.json')
        fs.writeFileSync(fp, JSON.stringify(fixture()))
        let h0 = sha1(fp)
        let a = execFileSync(process.execPath, [TOOL, fp, '--mapping-by', 'email'], { encoding: 'utf8' })
        let b = execFileSync(process.execPath, [TOOL, '--audit', fp, '--mapping-by', 'email'], { encoding: 'utf8' })
        assert.strict.equal(a, b)
        assert.strict.ok(a.includes('同名組') && a.includes('對應鍵 email') && !a.includes('對應鍵 name'))
        let j = JSON.parse(execFileSync(process.execPath, [TOOL, fp, '--json'], { encoding: 'utf8' }))
        assert.strict.deepEqual(Object.keys(j.mapKey).sort(), ['email', 'name'])
        assert.strict.equal(sha1(fp), h0, '輸入檔須不變')
    })

    it('ND-010 非字串引用名不報成引用者(外審 sol R8): 伺服端 arrFinder 以 === 比對, cgrups 內 name 為數字 1 或 [\'1\'] 者不對應名為 \'1\' 的群組', function() {
        let data = {
            users: [
                { id: 'u1', name: 'a', email: 'a@x', isActive: 'y', cgrups: JSON.stringify([{ name: 1, mode: 'OR', isActive: 'y' }]) },
                { id: 'u2', name: 'b', email: 'b@x', isActive: 'y', cgrups: JSON.stringify([{ name: ['1'], mode: 'OR', isActive: 'y' }]) },
                { id: 'u3', name: 'c', email: 'c@x', isActive: 'y', cgrups: JSON.stringify([{ name: '1', mode: 'OR', isActive: 'y' }]) },
            ],
            grups: [{ id: 'g1', name: '1', cpemis: '{}' }, { id: 'g2', name: '1', cpemis: '{}' }],
            pemis: [],
            targets: [],
        }
        let rp = buildReport(data)
        assert.strict.equal(rp.grups.length, 1)
        assert.strict.deepEqual(rp.grups[0].refs.map((r) => r.id), ['u3'], '只有字串名稱 \'1\' 的引用算數')
    })

    it('ND-011 壞 JSON 全表掃描(外審 sol R9): 沒有任何同名組時,壞的 users.cgrups／grups.cpemis 仍列入', function() {
        let data = {
            users: [{ id: 'bad', name: 'x', email: 'x@x', isActive: 'y', cgrups: '{oops' }, { id: 'ok', name: 'y', email: 'y@x', isActive: 'y', cgrups: '{}' }],
            grups: [{ id: 'g', name: 'G', cpemis: '{oops' }],
            pemis: [{ id: 'p', name: 'P', crules: '{}' }],
            targets: [],
        }
        let rp = buildReport(data)
        assert.strict.deepEqual(rp.grups, [])
        assert.strict.deepEqual(rp.badJson.map((b) => `${b.table}:${b.id}`).sort(), ['grups:g', 'users:bad'])
    })

    it('ND-009 CLI: 缺檔名或 --mapping-by 值非法 → 離開碼 2 並印用法', function() {
        let r1 = spawnSync(process.execPath, [TOOL], { encoding: 'utf8' })
        assert.strict.equal(r1.status, 2)
        assert.strict.ok(r1.stdout.includes('用法'))
        let fp = path.join(TMP, 'in2.json')
        fs.writeFileSync(fp, JSON.stringify(fixture()))
        let r2 = spawnSync(process.execPath, [TOOL, fp, '--mapping-by', 'phone'], { encoding: 'utf8' })
        assert.strict.equal(r2.status, 2)
    })

})
