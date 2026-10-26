# perm-run01 修前紅證據(2026-10-24)

修前＝尚未套用 `server/WWebPerm.mjs`／`server/procCore.mjs`／`server/tools/authRefsAudit.mjs` 之修正(測試先於修正撰寫並實跑)。指令皆經 `node C:/opensrcOper/tools/quiet-run.mjs --lock`。

## 範圍一 `test/api-adminOnly.test.mjs`(真後端)

- 指令: `npx mocha --no-parallel test/api-adminOnly.test.mjs --timeout 300000`(11:02 實跑, 完整輸出於 `tmp/quiet-run/20261024-110213-perm-run01-ao-red.log`, 已隨 `./tmp/` 清理, 摘要如下)
- 結果: **7 passing／25 failing**。
- 失敗項(皆為「一般使用者〔TOKEN_MEMBER: perm 列 isAdmin n 且啟用, 部署方放行〕應被拒卻成功」): AO-A1 × 13 個入口(RPC `getWebInfor`／`getStaEvent`／`getStaEventTable`、表 `select` ×4、系統函數 `[sys:getFuncList]`／`[sys:getTableTags]`、寫入 ×4〔寫入原被 `requireAdmin` 拒為 `userNotAdmin`, 現期望連線閘 `permission denied`〕)、AO-A2 後段(降級後仍可連)、AO-A5(無 `verifyConn-error`)、AO-A6 × 5(上傳下載路由回應≠無效 token)、AO-B1(本體 token 為一般使用者仍執行)、AO-C1／C2／C4(登入檢查回 success)。
- 實測外洩樣態(修前): 一般使用者 `users.select` 回全部使用者列(含 `admin@example.com` 等)、`grups.select`／`pemis.select`／`targets.select` 回全表、`getWebInfor`／`getStaEventTable` 成功。
- 修前即綠者(7): AO-A3(停用系統管理者)、AO-A4(P／X／B 角色)、AO-B2、AO-B3(部分)、AO-C3、AO-D1～D3——為「不變」契約之對照(`/api/getPerm`、應用路由、其餘角色之既有鍵)。

## 範圍二 `test/unit-procCore-writeValidate.test.mjs` WV-DUPID

- 指令: `npx mocha --no-parallel test/unit-procCore-writeValidate.test.mjs --grep WV-DUPID --reporter dot --timeout 30000`
- 結果: **12 passing／5 failing**; 失敗: WV-DUPID-001[users]、002[users]、004[users]、005[users, pickKeysOnly]、006(users srLog) — 皆回 `{ ok:true, v:'saveTabItemsSuccess' }`(同批兩列同 id 被併成一列、靜默遺失其一)。grups／pemis／targets 之 001～004 與 users 對照組 003 修前即綠(三表原已拒收, 作回歸守護)。

## 範圍三 `test/unit-refAudit.test.mjs` RA-037

- **未改碼重跑(原則 9 / 派工守則 15)**: `node tmp/perm-run01/loopRun.mjs 8 ra-base -- npx mocha --no-parallel test/unit-refAudit.test.mjs`: **8 次中 1 次失敗(12.5%)**——第 7 次 `RA-037 對照組` 第 961 行 `assert.strictEqual(r2.status, 0, r2.stderr)`, stderr 為 `失敗: --clean-out 不得與輸入匯出檔為同一檔(會覆寫原匯出檔)`; 其餘 7 次 48 passing。
- 根因探測: `tmp/perm-run01/inoProbe2.mjs`(批量建立／刪除 6000 檔): 293 對不同檔之 `fs.statSync().ino`(Number)相同而 BigInt 不同(例 `12384898979555387` 與 `…388`), 全部 ino > 2**53(見 R-TOOL-SAMEFILE-01)。
- 新增測試修前紅: `npx mocha test/unit-refAudit.test.mjs --grep RA-037` → 1 passing／**2 failing**(RA-037b: `不同檔(精確 inode 不同)不得判為同一檔 true !== false`; RA-037c: 真實檔案系統上以相鄰檔對跑 CLI, 離開碼 `2 !== 0`, stderr 同上述偶發失敗)。
