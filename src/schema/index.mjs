import grups from './tables/grups.mjs'
import pemis from './tables/pemis.mjs'
import targets from './tables/targets.mjs'
import users from './tables/users.mjs'
import build from 'w-data-collector/src/build.mjs'


let cs = {
    grups,
    pemis,
    targets,
    users,
}

//ds
let ds = {}
for (let k in cs) {
    ds[k] = build(cs[k], { useCreateStorage: false })
}


export default ds
