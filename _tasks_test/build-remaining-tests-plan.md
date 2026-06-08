# 任務：補齊 perm 剩 10 個 flow 的測試（使用者授權「全部依序做完」D→A→B→C）

## 總覽（2026-06-08 啟動）
已完成 2/12：e2e-users（後台使用者清單）+ getUserRules（演算法）。待建 10：

- **D 查詢 API 契約測試（無瀏覽器，優先）**：getPerm / getPermUserInfor / syncAndReplaceTabs
  → spec：流程_查詢使用者權限 / 查詢指定使用者權限 / 外部應用同步權限資料
  → 仿 sso api-*.test.mjs + api-setup.mjs，直接 woItems 斷言 DB
  → 可能含 E 基建：g.initialData.mjs refactor 成 export builders
- **A 後台 CRUD e2e**：targets / grups / pemis 清單（仿 e2e-users pilot + modal 模式）
- **B 關聯編輯 e2e**：使用者群組 / 群組權限 / 權限規則 關聯（VeCgrups+VeGrupBlngUsers / VeCpemis+VePemiBlngGrups / VeCrules，關聯 save 含 modal）
- **C Shell e2e**：應用啟動與登入

## 進行批次：D
- [x] 理解 workflow + 親讀 3 query spec（§6.1）+ 親讀 srv.mjs/g.mOrm.mjs 核驗。
- [x] discovery（tmp/api-discover.mjs 實機驗證）：token 鏈路 OK、woItems 跨進程唯讀 OK、真實 seed 確認。
- [x] 決策：DB reset 方案 B（複用 e2e seedDb，整庫 hermetic）；不做 E refactor；startServersOnce 加 backendOnly（API 免前端 webpack）。
- [x] 建 test/api-setup.mjs（startApi/cleanup/apiBaseUrl/TOKEN_*/url*/SEED/getWoItems lazy import）。
- [x] 建 + 審查 + 跑綠 3 支 api-*.test.mjs：**18 passing（getPerm 6 + getPermUserInfor 6 + sync 6），exit 0、lifecycle 乾淨**。
- [x] 清 tmp（api-discover.mjs / api-verify.log）。
- **D 完成**（除 2 個 spec-vs-impl discrepancy 待使用者定奪，見下；測試暫守護實測行為、it 名 -DISCREPANCY-pending-decision）。
- 指令：`npx mocha test/api-getPerm.test.mjs test/api-getPermUserInfor.test.mjs test/api-syncAndReplaceTabs.test.mjs --reporter list --timeout 200000`（序列勿 --parallel）。

### 實測確認的事實（建測據此，勿再猜）
- token：'sys'→id-for-admin(client+app 過)、'{token-for-application}'→id-for-application(app 過)、其他→{} 守門 reject。
- seed ids 確定性 'id-for-<name>'：admin(from='',M4,isAdmin=y)、peter/mary/john(from='teamA')；grups/pemis/targets from=''；targets 22 筆。
- getPerm('sys')→user.id=id-for-admin/grupsNames='權限群組M4'/22 rules（4 個 isActive=y）。
- reject 字串：無效 token→'can not get user data by url[...]'（後端 'can not find the user from token'）；缺佔位符→"no 'token={token}' in url"。
- woItems 跨進程**唯讀** select 可行；sync 寫 DB 一律走 backend HTTP、隔離 from='appTest'、自清 rows:[]。

### ✅ 2 個 spec-vs-impl 不符 — 使用者已定奪「改 spec 對齊現狀」（2026-06-08）
1. **getPermUserInfor 查不存在 userId**：改 spec（流程_查詢指定使用者權限.md E2E-005 + 規則摘要）為「resolve 空權限（fail-safe）」；測試 it 改名 `005-nonexistent-userId-empty-perms`。code 不動。
2. **sync 空 rows**：查 sso → sso 的 syncAndReplaceTabs/provideTabs 是**未完成 stub**（無先例）；保留 perm 的 isearr 安全閘，改 spec（流程_外部應用同步權限資料.md E2E-002 + 規則摘要）為「空 rows 被拒、不支援空集合清源」；測試 it 改名 `002-empty-rows-rejected`。code 不動。

### ✅ SDK debug log 已移除（使用者同意）
src/getPerm.mjs / src/getPermUserInfor.mjs 的 console.log(res/data/state/errTemp) 殘留已外科式移除，測試輸出乾淨、production 不再印雜訊。

**D 全數完成：18 passing、輸出乾淨、spec 對齊。**

## 慣例提醒
- e2e（A/B/C）：用 e2e-setup.mjs 的 startServersOnce/captureStable/saveAndWaitModal；標準圖 test/pics/<flow>/<flow>-{eng,cht}-E2E-NNN-name.png；§6.3 手術式重產 gate（前綴匹配）。
- API（D）：無瀏覽器、直接 woItems 斷言；lifecycle 對稱（startServers↔cleanup 兩觸發來源）。
- 每批完成 → 刪此檔對應段 / 更新狀態；逐項驗收回報使用者。
