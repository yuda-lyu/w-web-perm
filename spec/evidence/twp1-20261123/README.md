# 證據: 2026-11-23 twp1(排程第 301、598、570、275、206 項)

本資料夾只放「實測原始輸出」與重現腳本; 判讀與規則見 `sgud/rule/`(`rulebook_mechanism.md` 〈統計之 timeLength 入口檢測〉、`rulebook_security.md` R-BEARER-01 與 R-ORM-01、`rulebook_test.md` 〈e2e 基礎設施核對〉)與 `spec/設計要點與取捨.md` ADR-040 Update(twp1)、ADR-028 Update、ADR-050.

| 檔 | 內容 | 重跑 |
|---|---|---|
| `repro301-prefix.jsonl` | 修前之 `genPlan` 對各種 `timeLength`(`hang: true` ＝6 秒逾時視為同步無窮迴圈或過慢) | `node repro301-run.mjs <修前之 staLogsCore.mjs 路徑> 6000` |
| `repro301-postfix.jsonl` | 修後同一組候選: 無效者為 `errTimeLengthInvalid`, 有效者照常 | 同上, 路徑換成現行 `server/staLogs/staLogsCore.mjs` |
| `repro301-sister-sso-readonly.jsonl` | 姊妹套件 w-web-sso 之同名核心(唯讀核對, 未改): 同形缺陷 | 同上, 路徑為該套件之核心 |
| `repro301-run.mjs`、`repro301-child.mjs` | 重現腳本(父行程以 `spawnSync` 之逾時保護終止無窮迴圈之子行程) | 於專案根執行; 子行程檔案路徑寫在父腳本內, 依實際位置調整 |
| `measure598.log`、`measure598.mjs` | 修前碼(`git daddd01^`: 以 `strdelleft(authorization, 7)` 取權杖)對各種 `Authorization` 前綴之連線閘行為: 7 字元前綴通過、6 字元前綴被拒 | 以 `git archive daddd01^ -- server src srv.mjs settings.json 'g_*.mjs' db package.json` 解到專案樹內之暫存夾, 改其 `settings.json` 之 `serverPort`, 再執行腳本 |
| `measure570.log`、`measure570.mjs` | w-serv-orm 1.1.52 對 NaN、±Infinity、布林、物件主鍵: `insert`／`save` 整批 reject(`invalid id: data[1]`)、零寫入; `validateRowsBeforeWrite` 對 NaN、±Infinity 判為未給; JSON 往返為 null | 於專案根以 `node` 執行 |

證據不含金鑰、權杖(只有開發用權杖 `sys`)、內網位址或帳號資訊.
