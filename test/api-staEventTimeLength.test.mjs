//資料通道 getStaEvent 之 timeLength 入口檢測(排程第 301 項; 規則帳本 R-STA-TIMELENGTH-01; 規格〈輸入參數之檢測機制〉: 遠端入口依該套件之錯誤契約——語系鍵、不回顯值)
//真後端(非 mock; 統計走真實掃描路徑)經 POST /api/main 之 RPC 呼叫 getStaEvent, 檢查遠端唯一入口(kpFunExt getStaEvent → psi.getStaEvent)之行為:
//  API-STL-001 無效 timeLength(JSON 可傳者: 字串、null、負數、小數、超過上限、極大值、物件、陣列、布林)一律 reject 固定鍵 errTimeLengthInvalid, 於數秒內回應(修前: 'abc'、{}、1e20 使後端同步無窮迴圈而整個伺服器停止回應), 回應不含所傳之值
//  API-STL-002 hostile 呼叫之後後端仍存活: 有效 timeLength(7、'7'、0)照常回傳陣列; 另一無關函數(getWebInfor)亦照常
//  API-STL-003 srLog 記 getStaEvent-error 且 msg 為固定鍵 errTimeLengthInvalid(不含所傳之值)
//JSON 無法傳 NaN、±Infinity(序列化為 null, 以 null 代表); 其餘於 TL-002(unit-staLogs-timeLength)涵蓋.
//跑法(需測試鎖): node C:/opensrcOper/tools/quiet-run.mjs --name tstl --lock --timeout 600 -- npx mocha test/api-staEventTimeLength.test.mjs --timeout 300000
import assert from 'assert'
import { startApi, callRpc, TOKEN_ADMIN, markSrLog, readSrLogSince } from './tools/api-setup.mjs'

const A = assert.strict
const KEY = 'errTimeLengthInvalid'
let sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

//within: callRpc 無 fetch 逾時, 後端若同步無窮迴圈(修前)則請求永不回應; 以競賽在 ms 內未回即拋明確訊息(不等 mocha 之 300 秒逾時)
let within = (ms, label, p) => Promise.race([p, new Promise((resolve, reject) => setTimeout(() => reject(new Error(`${label}: ${ms} ms 內後端未回應(疑似同步無窮迴圈, 後端已卡死)`)), ms))])

//含不可混淆之標記字串, 供檢查回應不回顯
const MARK = 'ZZ-tl-marker-7743'
const INVALID = [
    ['字串 abc', 'abc'],
    ['含標記之字串', MARK],
    ['空字串', ''],
    ['null(NaN／Infinity 經 JSON 之形式)', null],
    ['負數', -1],
    ['極大負數', -1e9],
    ['小數', 1.5],
    ['超過上限 3651', 3651],
    ['過大之有效數字 100000(修前建數百萬筆 kpTime)', 100000],
    ['極大數 1e20', 1e20],
    ['數字字串之小數', '7.5'],
    ['十六進位字串', '0x10'],
    ['物件', { a: MARK }],
    ['陣列', [7]],
    ['布林 true', true],
]


describe('api-staEventTimeLength (資料通道 getStaEvent 之 timeLength 入口檢測, 排程第 301 項, 真後端)', function() {
    this.timeout(300000)

    before(async function() {
        this.timeout(300000)
        await startApi()
    })

    it('API-STL-001 無效 timeLength 一律 reject 固定鍵 errTimeLengthInvalid, 數秒內回應, 不回顯值', async function() {
        for (let [nm, v] of INVALID) {
            let t0 = Date.now()
            let r = await within(8000, nm, callRpc('getStaEvent', [v, 'hr'], TOKEN_ADMIN))
            let ms = Date.now() - t0
            A.equal(r.ok, false, `${nm}: 應被拒, 實得 ${JSON.stringify(r).slice(0, 200)}`)
            A.ok(String(r.msg).includes(KEY), `${nm}: 應為固定鍵 ${KEY}, 實得 ${String(r.msg).slice(0, 120)}`)
            A.ok(!String(r.raw).includes(MARK), `${nm}: 回應不得回顯所傳之值`)
            A.ok(ms < 8000, `${nm}: 應數秒內回應(同步無窮迴圈會使其逾時), 實得 ${ms} ms`)
        }
    })

    it('API-STL-002 hostile 呼叫之後後端仍存活: 有效 timeLength 照常回傳陣列, 無關函數亦照常', async function() {
        for (let v of [7, '7', ' 7 ', 0]) {
            let r = await callRpc('getStaEvent', [v, 'hr'], TOKEN_ADMIN)
            A.equal(r.ok, true, `timeLength ${JSON.stringify(v)} 應成功: ${JSON.stringify(r).slice(0, 200)}`)
            A.ok(Array.isArray(r.output), `timeLength ${JSON.stringify(v)} 應回陣列`)
            A.ok(r.output.length >= 1, '至少含現在所屬桶')
        }
        //未給 timeLength(參數陣列為空 → undefined → 預設 7 天; 注意 [undefined] 經 JSON 為 [null], 屬無效輸入)
        let rd = await callRpc('getStaEvent', [], TOKEN_ADMIN)
        A.equal(rd.ok, true, `未給 timeLength 應成功(預設 7 天): ${JSON.stringify(rd).slice(0, 200)}`)
        let w = await callRpc('getWebInfor', [], TOKEN_ADMIN)
        A.equal(w.ok, true, 'getWebInfor 照常')
    })

    it('API-STL-003 srLog 記 getStaEvent-error, msg 為固定鍵 errTimeLengthInvalid, 不含所傳之值', async function() {
        let mark = await markSrLog()
        let r = await callRpc('getStaEvent', [MARK, 'hr'], TOKEN_ADMIN)
        A.equal(r.ok, false)
        let hit = null
        let lines = []
        let tEnd = Date.now() + 20000
        while (Date.now() < tEnd) {
            lines = readSrLogSince(mark)
            hit = lines.find((l) => l.event === 'getStaEvent-error' && l.msg === KEY)
            if (hit) {
                break
            }
            await sleep(150)
        }
        A.ok(hit, `應見 getStaEvent-error msg=${KEY}; 實得事件 ${JSON.stringify(lines.map((l) => l.event)).slice(0, 300)}`)
        A.ok(!JSON.stringify(lines).includes(MARK), 'srLog 不得含所傳之值')
    })
})
