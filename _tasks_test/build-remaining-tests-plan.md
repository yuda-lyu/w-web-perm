# 任務：補齊 perm 剩 10 個 flow 的測試（使用者授權「全部依序做完」D→A→B→C）

## 總覽（2026-06-08 啟動）
已完成 2/12：e2e-users（後台使用者清單）+ getUserRules（演算法）。待建 10：

- **D 查詢 API 契約測試（無瀏覽器，優先）**：getPerm / getPermUserInfor / syncAndReplaceTabs
  → spec：流程_查詢使用者權限 / 查詢指定使用者權限 / 外部應用同步權限資料
  → 仿 sso api-*.test.mjs + api-setup.mjs，直接 woItems 斷言 DB
  → 可能含 E 基建：g.initialData.mjs refactor 成 export builders
- **A 後台 CRUD e2e**：targets / grups / pemis 清單（仿 e2e-users pilot + modal 模式）
  - [x] **targets 完成**：test/e2e-targets.test.mjs（10 cases × eng/cht = 20 baseline 全綠 byte-stable）+ spec 更新（E2E-001/002 方向、toast→modal）。
    - runtime 待確認點全部實證通過：checkAll(E2E-009 空 grid+targetAddEmpty modal)、toggle、copy 避重、cellHasWarn(E2E-007 紅三角+fail modal)。
    - **WDrawer 雙穩態徹底修復（重要，沿用至所有 e2e）**：複製/編輯產生較長 id（或切編輯模式/開 modal）觸發欄寬 reflow → autoSwitch 收合（cht 比 eng 易觸發，故部分 cht case 機率性 flake，不同 run 中不同 case）。**正解**：`waitNavExpanded` helper（e2e-setup.mjs，被動等 nav 標籤≥4 展開且穩定 1.2s，非遮蔽/非 drawer-force）已**加進 captureStable 起始**，對所有 e2e 自動生效。gen 一直是展開態（確定性），flake 僅在 verify 偶 capture 收合。
    - **合併驗證 42 passing（targets 20 + users 22 無退化）**，captureStable 共用改動安全。
    - 指令：產 `node test/e2e-targets.test.mjs --baseline`；驗 `npx mocha test/e2e-targets.test.mjs --reporter list --timeout 240000`；手術式 `--names E2E-004 --langs cht`。
  - [x] **grups 完成**：test/e2e-grups.test.mjs（10 cases × eng/cht = 20 baseline 全綠 byte-stable）+ spec 更新（toast→modal + trace 行號校正 + E2E-005 對齊）。
    - 特點：name 主鍵**前端**驗證（isError 引用 errItemsByName → 前端擋 errInNames modal，異於 targets 後端 ckKey）；E2E-006/007 斷言 cell 警告 + errInNames modal。**雙 relation-dialog**：E2E-008 belongUsers→VeGrupBlngUsers（grupBlngEditUsers）、E2E-009 cpemis→VeCpemis（grupEditCpemis），仿 users E2E-011。
    - WDrawer 防護（captureStable 內建）對 grups 也穩定，relation-dialog 對話框 byte-stable。
  - [x] **pemis 完成**：test/e2e-pemis.test.mjs（10 cases × eng/cht = 20 baseline 全綠）+ spec 更新（toast→modal + trace 校正 + E2E-001/002 方向 + E2E-004/005 對齊）。
    - name **前端**驗證（errInNames，同 grups）；**雙 relation-dialog**：E2E-008 crules→VeCrules（pemiEditCrules）、E2E-009 belongGrups→VePemiBlngGrups（pemiBlngEditGrups）。
- **A 全部完成（3/3：targets/grups/pemis，各 20 baseline 全綠）。**

### 待續：B 關聯編輯 e2e + C shell
- **B 關聯編輯 e2e**（3 flow，act 在對話框「內」操作關聯後存檔）：
  - [x] **使用者群組關聯 完成**：test/e2e-rela-user-grup.test.mjs（6 cases × eng/cht = 12 baseline 全綠）。
    - **兩編輯器行為不同**：VeCgrups（users 頁 cgrups 欄，Cxxx-resolve 型）Save **resolve cgrups 字串回 parent 前端暫存、無 modal**（E2E-002 斷言前端 cgrups 文字 1→2，不期待 success modal）；E2E-003 Close 取消。VeGrupBlngUsers（grups 頁 belongUsers 欄，own-save 型）Save **自己 $fapi.updateUsers 寫 DB + showCheckYes modal**（E2E-005 斷言 modal + store users[mary].cgrups 含 M1）。
    - **Save/Close 鈕**：WDialog header WButtonCircle（mdiCheckCircle save **僅 isModified=true 才渲染**、mdiClose close）。
    - **loading 修正（modal 改動漏修的補修）**：VeGrupBlngUsers.saveUsers / VePemiBlngGrups.saveGrups 先前未在 showCheckYes 前關 loading（clickSave 包裝層有 loading），導致「Processing...」loading bar（JS 驅動進度，captureStable 凍不到）疊在 modal 後 → E2E-005 cht 微 flake（147px）。修＝showCheckYes 前 updateLoading(false)（比照 LayoutContent）。
  - [x] **群組權限關聯 完成**：test/e2e-rela-grup-pemi.test.mjs（5 cases × eng/cht = 10 baseline 全綠）。VeCpemis（grups 頁 cpemis 欄 resolve）+ VePemiBlngGrups（pemis 頁 belongGrups 欄 own-save）→ 皆改 grups.cpemis。E2E-002 對話框 resolve **後再點群組頁工具列存檔→DB+modal**；E2E-005 唯讀檢視（關編輯模式→對話框 disabled、無 Save 鈕）。title 鍵 grupEditCpemis/pemiBlngEditGrups。
  - [x] **權限規則關聯 完成**：test/e2e-rela-pemi-rule.test.mjs（5 cases × eng/cht = 10 baseline 全綠）。**單一編輯器 VeCrules**（resolve 型）；crules 結構 key=target id/value='y'|'n' 純字串（無 mode 欄，異於 cpemis 的 {mode,isActive}）；grid=targets 列+enable checkbox。E2E-004 對話框 Save resolve→權限頁工具列存檔→pemiSavePemisSuccess modal + DB P1.crules。title 鍵 pemiEditCrules。
- **B 全部完成（3/3：使用者群組/群組權限/權限規則關聯）。**

### ✅ C shell e2e + users spec 補 完成
- **C 完成**：test/e2e-startup.test.mjs（5 cases × eng/cht = 10 baseline 全綠）。測 LayoutState 連線狀態畫面 + 登入分流。openRaw helper（不等 csLogin）+ `$vo.$ui.updateConnState` 操控狀態。E2E-001 csIng / E2E-002 登入成功四頁籤 / E2E-003 csErrLogin（**改 forceConnState 避開 ?token=error 的重導 navigation**）/ E2E-004 csErrConn / E2E-005 語言切換。csIng 連線動畫圖由 captureStable 自動遮 animate-img。
- **users spec 補完成**：流程_後台使用者清單.md 結果呈現 toast→modal（i18n 表 + trace + 規則摘要 + E2E 描述）。

## 🎉 全部完成：12/12 flow 測試 + 演算法 unit
測試覆蓋 12 份流程文件全部：A 後台 CRUD(targets/grups/pemis/users) + B 關聯編輯(使用者群組/群組權限/權限規則) + C shell(應用啟動與登入) + D 查詢 API(getPerm/getPermUserInfor/syncAndReplaceTabs) + getUserRules unit。
**本 session 9 commits**（875a721 modal、f627df8 D API、cbfd4d5 targets、7c1a343 grups、6640cfb pemis、5287974 rela-user-grup+loading 修、e721b09 rela-grup-pemi、02810ee rela-pemi-rule、+startup 待 commit）。
  - 對話框已在 A 的 relation-dialog case 驗證可開啟。
- **C shell e2e**：流程_應用啟動與登入（登入委派 w-ui-loginout，pilot 已間接覆蓋；優先序最低）。
- **users spec 結果呈現待補**（modal 已實作 875a721，但 users spec 未改 toast→modal）。
  - [ ] grups、pemis（待 targets 完成後比照）
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
