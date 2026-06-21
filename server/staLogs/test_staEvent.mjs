// import staEvent from './staEvent.mjs' //一般版
import staEvent from './staEvent.callWorker.mjs' //worker 版

async function main() {
    let rs = await staEvent(7, 'hr')
    console.log(JSON.stringify(rs, null, 2))
}
main()
// [
//   {
//     "time": "2026-06-21T12",
//     "data": {
//       "count": 50,
//       "verifyConn-success": 42,
//       "updatePemis-success": 5,
//       "api/getPerm-success": 3
//     }
//   },
//   ...
// ]

//node server/staLogs/test_staEvent.mjs
