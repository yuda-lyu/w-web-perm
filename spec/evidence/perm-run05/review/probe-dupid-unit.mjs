// 探測(外審 #3): 後台整表寫入 users 同 id 兩列(不同 email／name)是否被拒
import cloneDeep from 'lodash-es/cloneDeep.js'
import cacheSt from 'wsemi/src/cacheSt.mjs'
import ds from '../../src/schema/index.mjs'
import proc from '../../server/procCore.mjs'
import { autoDecl } from '../../test/tools/declHelper.mjs'
import createLockSave from '../../server/lockSave.mjs'
import { mkTable, mkCore, mkSrLog } from '../../test/tools/unitOrm.mjs'

const T0 = '2026-01-01T00:00:00.000+08:00'
const AUDIT = { userId: 'id-seed', timeCreate: T0, userIdUpdate: 'id-seed', timeUpdate: T0 }
let mkUser = (id, o = {}) => ({ ...ds.users.funNew(), ...AUDIT, id, name: id, email: `${id}@x.test`, cgrups: '{}', isAdmin: 'n', isActive: 'y', from: '', description: '', ...o })
let seed = [mkUser('b1')].map((r, k) => ({ ...r, order: k + 1 }))
let mk = (table, o) => ({ ...ds[table].funNew(), ...AUDIT, ...o })
let woItems = {
    users: mkTable(seed),
    grups: mkTable([mk('grups', { id: 'id-g1', order: 1, name: 'G1', cpemis: '{}', from: '' })]),
    pemis: mkTable([mk('pemis', { id: 'id-p1', order: 1, name: 'P1', crules: '{}', from: '' })]),
    targets: mkTable([mk('targets', { id: 'T1', order: 1, description: 'd1' })]),
}
let { srLog, logs } = mkSrLog()
let cst = cacheSt()
let core = mkCore(ds, woItems)
let pc = autoDecl(proc(woItems, core.procOrm, { srLog, ...core.lock, lockSave: createLockSave(cst), mappingBy: 'id' }), woItems)
let before = (await woItems.users.select()).map((v) => cloneDeep(v))
let rows = [...before, { ...mkUser('U', { name: 'A', email: 'a@x.test', order: 5 }), _isNew: true }, { ...mkUser('U', { name: 'B', email: 'b@x.test', order: 6 }), _isNew: true }]
let r = null
try {
    r = { ok: true, v: await pc.updateUsers('id-admin', rows) }
}
catch (e) {
    r = { ok: false, v: e }
}
console.log('NEW-flag:', JSON.stringify(r))
console.log('rows after:', JSON.stringify((await woItems.users.select()).map((v) => [v.id, v.name])))
//不帶 _isNew
let rows2 = [...before, mkUser('U2', { name: 'A', email: 'a2@x.test', order: 5 }), mkUser('U2', { name: 'B', email: 'b2@x.test', order: 6 })]
try {
    r = { ok: true, v: await pc.updateUsers('id-admin', rows2) }
}
catch (e) {
    r = { ok: false, v: e }
}
console.log('no-flag:', JSON.stringify(r))
console.log('rows after:', JSON.stringify((await woItems.users.select()).map((v) => [v.id, v.name])))
cst.clear()
