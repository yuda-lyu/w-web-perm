```js
        sysFuncsPublic: ['[sys:getFuncList]'],
const PROTOS = ['new', 'body', 'old', 'empty']
```

### F1 | 中 | test/api-sysFuncs.test.mjs:65 | 型別、封裝與名稱變體 → 不在 84 格內，無對應斷言 | 建議補以下邊界格

目前矩陣固定使用字串 token、完整函數封裝及新的有效 clientId；在這些限制下，`expectOf` 與讀到的處理流程相符，但尚未涵蓋下列分支。

| 缺的軸／格（標頭均為有效系統管理者，除非另註） | 程式碼所示的實際處理／輸出 | 應補的預期 |
|---|---|---|
| `__sysToken__` 為 `null`、數字、物件、陣列，特別是 `['sys']` | 一般函數與輪詢分別在 `WServWebdataServerExec.mjs:319`、`genPollingGate.mjs:43` 經 `cstr`，沒有直接拒絕非字串型別 | 驗證實際轉換值及轉換後的反查結果，不能一律預期拒絕。快照未含 `wsemi/src/cstr.mjs`；`['sys']` 是否轉成 `'sys'` 仍屬推測，不能據此宣稱已確認繞過 |
| 輪詢的 `clientId` 缺失、`''`、`null`、數字、物件、陣列；以及 `input` 本身為 `null`、純量或陣列 | `WServBroadcastServer.mjs:211` 先取 clientId，無效者回 `[sys:polling] invalid clientId`，不進 token 反查，也不發輪詢 error 事件 | 應斷言此回應，並驗證反查次數為零；不能套用 `[sys:polling] permission denied` |
| 過長 clientId，例如一百萬個 `x` | `WServBroadcastServer.mjs:213` 只檢查非空字串，沒有長度上限；有效系統管理者可建立該識別的在線狀態及佇列 | 定義長度契約並測邊界；目前測試完全避開此資源邊界 |
| 一般系統函數只有 `{__sysToken__:'sys'}`，或 `__sysInputArgs__` 為 `null`、字串、物件 | `WServWebdataServerExec.mjs:322`、`:329` 回 `{state:'error',msg:'invalid input'}`，先於反查 | 應測缺鍵與錯誤型別，並斷言不反查 |
| 大小寫、前後空白、未知 `[sys:xxx]` | 名稱精確比對。例如 `[sys:Polling]` 配輪詢形狀會先得到 `invalid input`；補齊參數陣列後才得到 `invalid func[`＋名稱＋`]`（`WServWebdataServerExec.mjs:305`、`:384`） | 應按封裝與檢查順序分格，不能預期所有未知系統名稱都得到同一錯誤 |
| 同一請求不同位置各有 token，例如 `input.__sysToken__='sys'`，而參數內另有 `__sysToken__='nope-invalid'` | 只使用前者；`getTableTags` 不使用該多餘參數，仍可成功（`WServWebdataServerExec.mjs:319`、`WServWebdataServer.mjs:535`） | 明確斷言身分來源。相同物件的重複鍵另須手工建構線上封包；目前 JS 物件 helper 無法保留重名鍵，解碼器的選值行為也未附於快照 |
| 反查同步 `throw 'X'`、非同步 `reject('X')`，以及 `throw/reject(null)` | 一般函數由 `WServWebdataServerExec.mjs:340` 攔截；輪詢由 `WServBroadcastServer.mjs:149` 吸收拒絕。兩者均拒絕，但回應及事件格式不同 | 應驗證公開函數亦拒絕、沒有副作用，以及缺 token 鍵為零次反查、帶鍵為一次反查 |

`Authorization` 大小寫、Tab、其他方案已有 `test/api-callerMatrix.test.mjs:662` 的共用連線閘測試；重複標頭及傳輸正規化後的實際值仍未涵蓋，需以保留原始標頭的 HTTP 用例驗證，不能只由正規表示式推定。

### F2 | 中 | test/api-sysFuncs.test.mjs:202 | 「clientId 綁定」案例缺 token 即先被拒 → 即使移除所有權檢查也可通過 | 建議加入有效身分之間的狀態轉換

第二次請求缺 `__sysToken__`，在 `genPollingGate.mjs:55` 就因空身分被拒，尚未到 `:60` 的綁定檢查。矩陣又為各呼叫者產生不同 clientId，因此沒有測到「另一位有效使用者重用同一 clientId」。

具體缺格為：

- 先以 `sys` 輪詢 clientId `c`，再以有效 AS token 輪詢 `c` → 第二次實際拒絕；但同一 AS token 呼叫 `[sys:getTableTags]` 可成功。`expectOf` 的 new／body 放行規則只適用尚未綁定或同身分的 clientId。
- `sys` 換成 AUA token → 兩者反查為同一 userId，應持續放行。
- 不同 userId 在綁定解除前／後重用、同時首次輪詢 → 應分別驗證所有權及先到先綁。

此外，`:213` 的「零副作用」只由之後能綁定系統管理者推論，沒有檢查在線名單、佇列、廣播是否被取走或在線期限是否刷新。應直接觀察這些狀態；資料庫零寫入也不能代替廣播狀態斷言。

### F3 | 高 | node_modules/w-serv-webdata/src/WServWebdataServer.mjs:529 | 延後送達的舊 clientLeave → 可能解除已重新在線的身分綁定，讓另一身分取得該佇列 | 建議以在線世代識別解除綁定

**推測，尚未實測事件交錯。** 讀碼可見以下窗口：

1. A 的 clientId `c` 逾時；`WServBroadcastServer.mjs:130` 刪除佇列，`:136` 排程發出 `clientLeave`。事件經 `genEeEmit.mjs:88` 延後派發。
2. 舊 leave 尚未送達時，A 成功輪詢 `c`，重新建立在線狀態及佇列。
3. 舊 leave 送達，`WServWebdataServer.mjs:530` 無條件 `gate.release(c)`，未判斷 `c` 是否已重新在線。
4. B 此時輪詢 `c`，可因 Map 已無綁定而成為新擁有者，取走重新建立之佇列內容；應有結果是拒絕 B。

驗證方式：以可控計時安排「leave 已排程 → A 重入 → 廣播入列 → 舊 leave 派發 → B 輪詢」，斷言 B 被拒且 A 的廣播未被取走。解除應對應特定在線世代，或與佇列離線處理同步完成。

### F4 | 中 | src/main.js:39 | 已啟動後清空 token／再次登入失敗 → 輪詢仍持續，沒有回到等待狀態 | 建議保存實體並接上登入生命週期

`WServHapiClient.mjs:376` 的等待只發生於首次 `startSync()` 前；啟動後，`WServBroadcastClient.mjs:160` 即使取得空 token，仍送出輪詢。

`src/App.vue:89` 清空 token 時沒有停止同步；`src/main.js:39` 也沒有保存回傳實體供停止。因而「已成功登入 → token 清空，或再次進入 loginError」會持續發出失敗請求，與「目前沒有 token 就不呼叫資料通道」的擴大解讀不符。首次從空 token 啟動的路徑則確實有等待。

應在登出、清空身分或登入失敗時呼叫 `clearBroadcast()` 與 `clearSync()`，之後以新實體等待下一次登入，並加入啟動後清空 token 的案例。

### F5 | 中 | test/unit-sysFuncsSite.test.mjs:69 | 靜態文字存在即可通過 → 未證明實際前端使用該設定及 token 回傳值 | 建議讓測試使用實際前端設定

例如將 `src/main.js:48` 的 `return token` 改成 `return ''`：讀 store、`useWaitToken:true` 等文字仍存在，SFS-002 可通過；API 測試自行建立 `bootClient`，也不使用這個回調。實際頁面卻永遠無法啟動。

指定九個變異的讀碼推演如下，並非本次執行結果：

| 變異 | api-sysFuncs | unit-sysFuncsSite |
|---|---|---|
| ① 拿掉設定 | 會抓到：有效標頭之 old 輪詢放行 | 會，SFS-001 |
| ② 加 polling | 會，同上 | 會，SFS-001 |
| ③ 加 getTableTags | 不會，反查仍 fail-closed | 會，SFS-001 |
| ④ 空陣列 | 不會，現有成功者均有身分 | 會，SFS-001 |
| ⑤ 鍵名打錯 | 會，退回預設的 old 輪詢放行 | 會，SFS-001 |
| ⑥ 明列三者 | 會，同① | 會，SFS-001 |
| ⑦ 空 token 回空字串 | 會，getFuncList 的 body／N 等格誤放行 | 不會直接抓到 |
| ⑧ useWaitToken 改 false | 不會；fixture 自己固定 true | 會，SFS-002 |
| ⑨ 範圍退回 ^1.1.7 | 不會；仍使用已安裝版本 | 會，SFS-003 |

九項合併均有攔截點，但部分依賴文字檢查。單引號限制（`:36`）、指定 `let optWServHapiServer`（`:52`）、禁止任意另一個 `let opt…`（`:61`），以及所有系統函數字面值清單（`:105`），含有現狀指紋：改用雙引號、`const`，或新增診斷字串都可能誤紅；存在相同文字也未必代表有效設定。

應共用實際前端設定／回調作行為驗證；靜態站點檢查則解析語法及選項物件。這兩組測試也未驗證發布的 `dist`／UMD；快照未附產物，不能由它們證實重建結果。

### F6 | 中 | test/unit-sysFuncsSite.test.mjs:25 | 相依範圍 `<=1.1.8` 或 `^1.1.8 || ^1.1.7` → 被當成下限 1.1.8 而通過 | 建議使用 semver 範圍判定

`verOf` 刪掉開頭非數字後，只解析前三個數字。上述範圍都會得到 `[1,1,8]`，在 `:79` 通過，但實際允許低於 1.1.8。已安裝新版時，其他版本斷言與 API 測試也不會揭露此問題。

應驗證整個範圍是否允許不符合最低版本的解析結果，而非把範圍當成單一版本。

### F7 | 中 | test/api-sysFuncs.test.mjs:83 | 輪詢 success 外殼內放錯誤物件 → 被判成 allow；成功空資料也缺功能斷言 | 建議驗證回應內容與拒絕原因

例如回應：

```js
{ success: {
    func: '[sys:polling]',
    output: { state: 'error', msg: 'invalid token' }
} }
```

會被 `outcomeOf` 判為 `allow`，應判為不符合輪詢協定。`WServWebdataServerExec.mjs:307` 在停止廣播後就會產生此種內層錯誤形狀。

同樣地，`getTableTags` 若成功回空物件，`:87` 仍認為成功；前端 fixture 的 `recvData` 又是空函數（`:241`），沒有斷言四表完成同步。這可漏掉「開機成功但資料永不載入」。

拒絕分支 `:167` 只要求屬於任意語系鍵，也未確認例如一般使用者必須得到 `userNotAdmin`。應檢查輪詢陣列、函數名稱清單、同步時間戳內容、同步完成結果，以及各呼叫者對應的固定拒絕鍵。

### F8 | 中 | test/api-sysFuncs.test.mjs:228 | 固定等待與未回收計時器 → 可能假綠、偶發失敗及測試結束延遲 | 建議以可觀察事件等待並完整清理

- member 案例約六秒後停止，但 `bootClient` 的二十秒 timeout 只在成功取得函數時清除；`st.stop()` 沒有清掉它，會留下計時器。這不等於已確認 unhandled rejection，但會拖延行程結束。
- `:271` 等待 4.5 秒並不能證明完成兩輪輪詢；輪詢停止或請求仍在途時，也可能維持 `errs=[]`。
- `:264` 直接以尚未落檔的空 log 集合斷言沒有請求。`test/tools/api-setup.mjs:306` 已說明 srLog 非同步落檔，須等待落檔證據。

應在停止時清除開機 timeout，以請求／完成次數及有截止期限的事件等待取代固定 sleep，並用結束哨兵確保觀察窗口內的 log 已落檔。

### F9 | 低 | README.md:135 | 標頭與本體同為無效 token → 回一般 permission denied、沒有輪詢 error 事件，與文件無條件描述不符 | 建議限定已通過連線閘的情況

具體輸入為 `Authorization: Bearer nope-invalid`，本體 `{clientId:'c',__sysToken__:'nope-invalid'}`。`verifyConn` 回 false，`WConverhpServer.mjs:1278` 直接回 `permission denied`；此路徑不進輪詢鉤子，也不發文件所述的輪詢 error 事件，只有套件的拒絕 log。

通過標頭及 clientId 檢核後才有以下區別：

- 缺 token 鍵：不反查，事件為 `{msg:'[sys:polling] permission denied',err:'empty userId'}`。
- 本體空／無效 token 導致反查 reject：事件的 `msg` 為 `[sys:polling] verifyPolling error`。
- 前端兩者皆收到固定的 `[sys:polling] permission denied`。

文件應加上前置條件，並修正 `README.md:111`「每輪反查」的無條件表述；缺鍵及 clientId 無效的輪詢都是零次反查。

### F10 | 中 | node_modules/w-serv-webdata/package.json:6 | 相依解析保留 broadcast 1.1.11 → 仍符合宣告，未保證要求的 1.1.12 下限 | 建議在相依鏈明確提高下限

實際宣告為：

`w-serv-hapi ^1.1.8 → w-serv-webdata ^1.1.16 → w-serv-broadcast ^1.1.11`。

因此既有解析結果可以合法保留 broadcast 1.1.11。工作目錄目前安裝 1.1.12，以及 SFS-003 檢查目前安裝值，不能保證使用方的解析結果也至少為 1.1.12；`README.md:138` 的版本敘述省略了這個差異。

若 1.1.12 是必要下限，應先在相依套件提高該下限，再更新本套件需求，並區分文件中的「本次建置版本」與「宣告保證的最低版本」。

### F11 | 中 | node_modules/w-serv-webdata/src/WServWebdataClient.mjs:406 | 已帶 token 的既有 SDK 僅換使用者、不換 clientId → 有效身分仍暫時失去輪詢，恢復時未重新取時間戳 | 建議補身分切換與恢復同步契約

這個相容性影響不限於缺 token 的舊建置檔。例如同一 clientId 先用 `sys`，再改用有效 AS token：標頭、本體都有效，輪詢仍因不同 userId 被拒至舊綁定解除；一般函數此時已可成功。更換為同 userId 的 AUA token 則不受此限制。

恢復輪詢時，`WServBroadcastClient.mjs:198` 不再發 `openOnce`；取得完整時間戳的流程僅掛於 `WServWebdataClient.mjs:406` 的 `openOnce`，沒有恢復連線時的補取路徑。空窗中的推播不補送，可能留下舊資料。**持續顯示舊表的最終結果屬推測**，因快照未附 `w-sync-webdata`；應以「切換身分期間修改表，恢復後不再修改」驗證是否會自行追上。

另外，`README.md:136` 將已開啟分頁一律描述為停在「Logged in」並未載入資料，並不涵蓋升版前已 ready 的分頁：`src/main.js` 沒有監聽實體錯誤，後者會繼續顯示既有畫面及舊資料。

應在使用者身分改變時重建前端實體，恢復連線時重新比對時間戳；升級說明也應涵蓋已 ready 的分頁及自訂 SDK 的身分切換流程。