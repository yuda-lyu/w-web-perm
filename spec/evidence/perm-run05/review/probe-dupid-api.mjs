// 探測(外審 #3, 真後端): updateUsers 整表含同 id 兩列(不同 name／email)
import { startApi, callRpc, TOKEN_ADMIN, readTables, restoreTables, selectAllRows } from '../../test/tools/api-setup.mjs'

await startApi()
const BASE = await readTables()
try {
    const cur = (await selectAllRows('users')).slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map((v) => JSON.parse(JSON.stringify(v)))
    const mk = (name, email) => ({ id: 'probe-dup-U', order: 99, name, email, description: '', from: '', cgrups: '{}', isAdmin: 'n', isActive: 'y' })
    const r = await callRpc('updateUsers', [[...cur, mk('probeA', 'probeA@example.com'), mk('probeB', 'probeB@example.com')]], TOKEN_ADMIN)
    console.log('RESULT', JSON.stringify({ ok: r.ok, msg: r.msg }))
    const after = (await selectAllRows('users')).filter((v) => v.id === 'probe-dup-U')
    console.log('AFTER', JSON.stringify(after.map((v) => [v.id, v.name, v.email])))
}
finally {
    await restoreTables(BASE)
}
process.exit(0)
