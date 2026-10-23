### 發現(依嚴重度由高到低)

**#1 [高] [src/js/refIdentity.mjs:195](C:/opensrc/開源-JS-411-8-w-web-perm/w-web-perm/tmp/perm-run02/review/repo/src/js/refIdentity.mjs:195) — 不同列的同名選取會互相覆蓋快照，讓先前授權被新實體接管**

- **情境**：
  1. 庫內沒有使用者引用群組 `G(id=g1)`。在使用者清單替 U1 選取 G，回填後尚未存檔。
  2. 他人刪除 G，再建立 `G(id=g2)`，等待 store 更新。因為 G 尚無持久引用，引用連帶不會改動 users，原基準仍有效。
  3. 再替 U2 開啟編輯器，選取新的 G 並回填。
  4. 儲存整張使用者清單。
- **後果**：U2 的選取把 U1 保存的 `g1` 快照覆蓋為 `g2`。兩列都以新 id 宣告，通過前後端檢查；U1 原本選取的授權被同名新群組接管。群組頁指派權限也有相同問題。
- **依據**：清單頁各列都把同一個 `vo.refPicks` 傳給 `recordPicks`；該函式只以名稱為鍵，直接覆寫：
  ```js
  picks.set(n, (snap instanceof Map && snap.has(n)) ? snap.get(n) : [])
  ```
  `buildRefDecl` 第 220～223 行將跨列名稱去重，再取這份最新記錄，因此最後只有 `{name:'G', ids:['g2']}`。伺服端第 414 行收到的宣告既完整又符合現況，無法還原 U1 的舊快照。RI-7 第 442 行的測試只涵蓋同一列取消後重選；新增 E2E 未涵蓋兩列在不同身分版本下選取同名實體。
- **把握度**：`確定`。
- **建議**：以「列 id＋引用名稱」保存選取快照，組宣告時若仍有效的同名新增引用具有不同快照，就拒存；補上上述兩列案例。

**#2 [中] [test/unit-procCore-identity.test.mjs:480](C:/opensrc/開源-JS-411-8-w-web-perm/w-web-perm/tmp/perm-run02/review/repo/test/unit-procCore-identity.test.mjs:480) — IDN-113 容許錯誤拒收鍵，守不住 pemis 帶 subject 的格式契約**

- **情境**：若移除 `procCore.mjs:170` 的 `|| refTarget.table === 'targets'`，合法形狀的 `pemis + subject` 就會進入 targets 鎖並讀庫，最後由主體檢查拒收。
- **後果**：應在任何讀寫之前回 `saveIdentityFormat` 的請求，改成讀庫後回 `saveSubjectChanged`，這條測試仍會通過。
- **依據**：
  ```js
  A.ok(['saveSubjectChanged', 'saveIdentityFormat'].includes(r.v), ...)
  ```
  此案例也沒有斷言零讀取或 `format` log。API 測試的 pemis 格式案例只測 refs，沒有補守這一格。
- **把握度**：`確定`。
- **建議**：改用既有 `expectIdentityReject`，固定要求 `saveIdentityFormat / format / n=0`，並啟用 `zeroIO: true`。

**#3 [中] [test/api-identity.test.mjs:378](C:/opensrc/開源-JS-411-8-w-web-perm/w-web-perm/tmp/perm-run02/review/repo/test/api-identity.test.mjs:378) — API 並發案例沒有證明檢查與寫入之間真的發生交錯**

- **情境**：六輪請求雖以 `Promise.all` 等待，但後端可能每次都在另一請求進入前完成整個操作；0／4／12 ms 的客戶端啟動間隔不保證伺服端交錯。
- **後果**：即使拿掉被引用表鎖，只要本輪實際依序處理，兩種合法終態仍成立，API 並發案例可以全綠，無法證明真 RPC 路徑符合原則 4。
- **依據**：
  ```js
  pB = sleep(gap).then(() => write(ref, rowsB))
  ...
  A.equal(nOk + nRej, 6)
  ```
  每輪必然進入成功或失敗分支並加一，最後的總數斷言沒有增加鑑別力；也沒有伺服端閘門或事件序斷言。單元 IDN-510 另有人工延遲，此問題限於 API 並發測試。
- **把握度**：`推演`；未實測六輪實際排程。
- **建議**：在伺服端讀取後設測試閘門，確認另一請求已到達，再放行並斷言寫入事件順序。

**#4 [低] [sgud/rule/rulebook_concurrent.md:93](C:/opensrc/開源-JS-411-8-w-web-perm/w-web-perm/tmp/perm-run02/review/repo/sgud/rule/rulebook_concurrent.md:93) —「非字串名稱不計」漏寫 crules 的屬性鍵轉型例外**

- **情境**：外部呼叫端依文件，對新加入的 `crules='[{"name":5,"isActive":"y"}]'` 送出 `refs:[]`，認為數字名稱不需宣告。
- **後果**：實作會把名稱轉成 `'5'`，要求宣告；呼叫端因此漏報並收到 `saveRefChanged`。這是文件錯誤，實作符合題定契約。
- **依據**：規則第 93 行寫「非字串名稱不計」，`refIdentity.mjs:54` 也有相同描述；但 `refCascade.mjs:25–26` 對 `rule` 呼叫 `getPropKey`，RI-2 第 150 行亦明確期待數字名稱得到 `['5']`。
- **把握度**：`確定`。
- **建議**：將排除非字串名稱的說明限定於 cgrups／cpemis，並同步修正 `activeNames` 註解。

### 已檢視而未發現問題的範圍

- `procCore.updateTabItems`：被引用表持鎖範圍、subject 先於基準、refs 驗證位置、零寫入拒收路徑。
- `keyCheck.withTabLocks`、`lockSave`、`WWebPerm.syncAndReplaceTabs`、`cascadeWrite`：所讀服務入口均沿階層取鎖，未見新增逆序或同表重入。
- `pickClientOpt`、`parseSubject`、`parseRefDecl`：客戶端設定隔離、null／undefined 相容、格式與筆數上限、原型名稱處理。
- `activeNames`／`collectNewNames`／`idsOfName`：解碼口徑、啟用差集、歷史同名、多種 crules 名稱、mode 與停用項判準。
- 兩反向對話框：存檔流程持有原 subject，並隨 RPC 傳送；未見新增接線缺陷。
- E2E-025～036：主要拒收案例會核對送出次數、宣告與庫內結果；正常案例有驗證新增項確實啟用。
- README、ADR-037、規則帳本主要鎖與相容性描述，以及所列主要符號錨。

### 未檢視或無法判定的範圍

- 依要求僅唯讀查檔，未修改檔案、執行測試或啟動服務；文件所載 passing 數與實際並發排程未經本次實測確認。
- 新增測試未見宣告搭配伺服端 `pickKeysOnly`、外部列指派、外部同步交錯，以及讀寫故障後重取被引用表鎖的交叉案例；讀碼未發現這些路徑的確定新增缺陷。
- E2E-001～024 與其他既有測試未逐案全面重審，因此不能提供全部 perm-run01 行為的回歸保證。
- 共用核心僅對照鎖介面與呼叫方式，未獨立審核其互斥器及實際 ORM 後端。
