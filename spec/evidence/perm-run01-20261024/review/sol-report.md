# 一、輸入空間表挑戰

審查對象為 `review/repo`，下列位置均相對於該副本。全程唯讀，未執行測試、啟動服務、安裝依賴或呼叫探測函數，未修改副本。失敗情境是依實際控制流推導，沒有宣稱已在此環境重現。框架每條資料通道路由先呼叫 verifyConn、所有 main 函數（含系統函數）執行前反查本體 __sysToken__，均採使用者提供的已核對前提。

共 7 條發現：高 5、中 2。#1、#3–#7 涉及本輪沒有排除的既有路徑或邊界；#2 是新增「先保存角色判定」仍未保存完整身分的問題。這些結果不代表在唯一 id、沒有並發或回呼改寫時，一般 token 可以直接通過新增的三處系統管理者閘。

**原表缺少的獨立軸**

| 應補軸 | 遺漏的格與實際差異 | 依據 |
| --- | --- | --- |
| client/app 授權分開 | 「不在 perm」不等於 app；perm 一般使用者也可能另外獲 verifyAppUser 放行，perm 系統管理者也可能被它拒絕。 | `server/WWebPerm.mjs:542–575`、`959`、`1058` |
| mappingBy 與完整命中集合 | id 模式要分後台 id、外部 srcKey、舊外部列 id；另要分 0/1/多筆、有效/停用混合、跨來源同值。email/name 排除停用列，id 則計入，見 #1。 | `server/keyCheck.mjs:289–329` |
| 外部聲明 × perm 現值 | 外部 n／perm y 可以是系統管理者；外部 y／perm n 仍應拒。還有缺欄、非 y/n、繼承屬性，不只七種角色。 | `WWebPerm.mjs:401–425`、`487–505`；`server/adminCheck.mjs:11–16` |
| 標頭 token × 本體 token | 要包含 A/M、M/A、A/A2、缺失/非字串、不同人但都獲准等組合。本體 token 是驗證輸入，不是一個獨立入口。 | `WWebPerm.mjs:1127–1148`、`1184–1198`；`test/tools/api-setup.mjs:102–108` |
| 驗證值的生命週期 | 查得列、回呼收到的物件、回呼後傳回物件、二次讀庫的列，以及排隊前後角色，是不同的值或時間點。 | `WWebPerm.mjs:502–526`、`670–679`、`895–908`；`server/procCore.mjs:326–339` |
| 否定與例外原因 | 外部查無、欄位不全、查找歧義、停用、部署方 false/throw/reject、非系統管理者、ORM/I/O 拋錯不能統稱「無效 token」。 | `WWebPerm.mjs:401–526`、`1188–1191`；見 #5 |
| 回傳資料種類 | 除 RPC 結果，還有四表同步；寫入 returnRows:true 也可回整表及連帶修改表。下載 GET 的 query token 與標頭 token 應分開。 | `WWebPerm.mjs:1105–1110`、`1212`；`procCore.mjs:510–523`、`576–577`；`test/api-adminOnly.test.mjs:202–213` |
| 寫入模式與 id 形狀 | 整表 diff、users 的 for:grups、既有/新增/缺 id、有限數字/字串、有/無基準，是不同格。 | `procCore.mjs:182–299`、`341–350`、`398–410` |

**原表應補正的代表性格**

| 輸入 | 現況 |
| --- | --- |
| main：標頭 M、本體 A | 標頭先被拒，傳輸層 permission denied。`WWebPerm.mjs:1143` → `592` |
| main：標頭 A、本體 M | 本體反查拒 userNotAdmin，函數不執行。`WWebPerm.mjs:1186–1191` |
| main：標頭 A、本體 A2，兩者都獲准 | 以 A2 的 perm 內部 id 執行；不要求兩 token 相同，是明載的設計。`WWebPerm.mjs:1180–1182`、`1193–1198` |
| 有效系統管理者，但該 from 被部署方拒絕 | 不保證成功；回 userNoPermission，連線階段對外仍為 permission denied。`WWebPerm.mjs:508–517` |
| `/api/getPerm?token=M&userId=A` | 額外 userId 不參與選人，正常流程取 token 對應者；仍有 #2/#3 的值保持問題。`WWebPerm.mjs:883`、`895`、`908` |
| 不在 perm 的 app token，verifyAppUser=true | 可以查指定使用者及同步資料；在後台登入/main 被拒。因此不能把整個角色列都標成拒絕。`WWebPerm.mjs:959`、`985–1002`、`1058–1084` |
| perm 一般使用者，另外獲 verifyAppUser=true | 同樣可走 app 路由；這是刻意保留的服務身分信任邊界，並非由 isAdminRow 保護。原敘述「一般使用者只能查自己」必須限於 client 身分入口。 |
| 靜態檔，不帶 token | 公開前端是例外；靜態根為 dist，不是 repo 或 DB 根。`WWebPerm.mjs:772–799`、`1114–1118` |

#1 [嚴重度:高] email/name 登入先排除停用列，停用者的 token 可被解析成同鍵的另一位有效系統管理者。

- 位置：`server/keyCheck.mjs:312–318` 實際查找：

  ```js
  async function findLoginUsers(tabUsers, mappingBy, vSelf) {
      let key = mapKeyOf(mappingBy)
      if (key !== null) {
          return pickUniqueUser(await tabUsers.select({ [key]: vSelf, isActive: 'y' }))
      }
      let rsId = await tabUsers.select({ id: vSelf })
      let rsSrc = await tabUsers.select({ srcKey: vSelf })
  ```

  `server/WWebPerm.mjs:469` 採用結果：

  ```js
  let { user: userFind, count: countFind } = await findLoginUsers(woItems.users, mappingBy, vSelf)
  ```

  此形可由正常寫入產生：`server/keyCheck.mjs:192–253` 的 name 對應檢查只比較有效列；`server/syncCore.mjs:207` 也明確限定有效列：

  ```js
  let kOther = findKeyOtherFrom(rows, objs, from, keyOther, { onlyActive: keyTable === 'users' })
  ```

- 失敗情境：mappingBy=name；perm 有停用系統管理者 U1（id=u1、name=Alex、email=u1@example.com、isAdmin=y、isActive=n）及另一位有效系統管理者 U2（id=u2、name=Alex、email=u2@example.com、isAdmin=y、isActive=y）。U1 的外部 token 仍有效、外部 id=u1、name=Alex，部署方放行。U1 對 main 標頭與本體都用自己的 token → 預期停用者拒絕；實際只查見 U2，兩道系統管理者閘及 requireAdmin 都驗 U2，可用 U2 身分讀寫四表。email 模式亦可在匯入／歷史資料存在同鍵停用列時發生。這是既有對應政策的缺口，不是三處 helper 漏接。
- 建議：email/name 也先計入全部命中列；多筆拒 ambiguousUserFromPerm，恰一筆再驗 isActive，對齊 id 分支。寫入端避免新增此類碰撞，補「一有效、一停用、角色不同」的登入/main 測試。若仍採有效列唯一政策，須明示同鍵可換人的後果，不能保證原表「停用者必拒」。

#2 [嚴重度:高] 只保存角色布林值、未保存身分列，verifyClientUser 改寫 id 後會以另一人的 id 執行。

- 位置：`server/WWebPerm.mjs:502–511`：

  ```js
  let user = await getTokenUser(token)

  //isAdmin, 於交給部署方前判定(判準 adminCheck.isAdminRow, perm 列為權威)
  let isAdmin = isAdminRow(user)

  //verifyClientUser
  let b = verifyClientUser(user, from)
  if (ispm(b)) {
      b = await b
  }
  ```

  `server/WWebPerm.mjs:520–526` 仍回同一個可變物件：

  ```js
  //check admin, 一般使用者即使部署方放行亦拒絕(固定語系鍵 userNotAdmin; 只記 from, 不記 token 與使用者資料)
  if (adminOnly && !isAdmin) {
      srLog.error({ event: 'getAndVerifyAdminUser-error', msg: 'userNotAdmin', from })
      return Promise.reject(`userNotAdmin`)
  }

  return user
  ```

  消費端為 `server/WWebPerm.mjs:1193–1198` 的 get(user,'id','')／return userId。`server/dataChannel.mjs:20–32` 只驗 id 非空及 method=select，沒有再驗該 id 的角色。

- 失敗情境：A 是有效系統管理者，M 是一般使用者；部署方回呼有 `u.id='M'; return true`（例如資料轉換副作用），main 標頭與本體都帶 A 的 token。預期執行者維持已驗證的 A，或身分改變後拒絕；實際角色布林值來自 A，執行 id 卻是 M，users.select 仍獲准。登入回傳也可能出現「M 的 id、A 的角色與欄位」。觸發條件是伺服器回呼改寫物件，並非一般使用者能自行修改回呼；但現有註解宣稱已抵抗這類改寫。getPerm 同樣受影響。
- 建議：保存完整身分快照，回呼只收到複本，角色與後續 id 都取未改寫的快照。補真實回呼改寫 id/isAdmin/isActive 的行為測試；`test/unit-adminOnlySite.test.mjs:119–130` 現在只驗原始碼順序。

#3 [嚴重度:高] getPerm 驗證本人後又以 id 重讀，並發換主時會回別人的資料與權限樹。

- 位置：`server/WWebPerm.mjs:883`、`895`、`908` 依序為以下三個分別摘錄的呼叫：

  ```js
  let userSelf = await getAndVerifyClientUser(token, 'getPerm')
  ```

  ```js
  let userIdSelf = get(userSelf, 'id', '')
  ```

  ```js
  let userWithRulesSelf = await getGenUserAndRulesByUserId(userIdSelf)
  ```

  `server/WWebPerm.mjs:719–722` 第二參預設 undefined，因而重讀：

  ```js
  let getGenUserAndRulesByUserId = async (userId, userPre = undefined) => {

      //userFind, userPre 非 undefined 時(含 null＝查無)為呼叫端已解析之列, 直接採用不重讀(resolvePermUserId); 否則依 userId 讀取
      let userFind = (userPre !== undefined) ? userPre : await getGenUserByUserId(userId)
  ```

  `707` 再經 `651` 的 id 查詢，`763–765` 將該列展開回傳。相對地，app 查詢已於 `985–988` 傳入解析列：

  ```js
  let userPerm = await resolvePermUserId(userIdFind)

  //getGenUserAndRulesByUserId, 查找到的使用者與權限(已解析之列直接採用)
  let userWithRulesFind = await getGenUserAndRulesByUserId(userPerm.userId, userPerm.userFind)
  ```

- 失敗情境：mappingBy=email；Alice 的一般 token 命中內部 id=u、email=alice@example.com。在不改寫物件的非同步 verifyClientUser 等待期間，另一授權操作把 u 的登入 email 改為 bob@example.com 並賦予 Bob 的群組，或刪除 u 後同 id 重建另一人。Alice 通過後以 u 二次查找 → 預期回已驗證的 Alice 快照，或確認身分改變後拒絕；實際回 Bob 的 email、其他欄位及權限。無須 #2 的回呼改寫。
- 建議：使用既有第二參，改為 getGenUserAndRulesByUserId(userIdSelf,userSelf)，並完成 #2 的快照保護；若要最新權限，需在一致性範圍內重驗 token 對應與選人。補驗證後換 email／同 id 換人的並發測試，對齊 app 查詢已採的防護。

#4 [嚴重度:高] requireAdmin 在表鎖外檢查，排隊中的已降級系統管理者可用無基準舊整表把自己升回系統管理者。

- 位置：`server/WWebPerm.mjs:667–679` 讀列判定完即返回，四個 wrapper 在進 procCore 前呼叫；users 的 `1233–1238`：

  ```js
  await requireAdmin(userId, 'updateUsers')
  let opt = pickClientOpt(optClient)
  if (modeEditUsers === 'for:grups') {
      opt.pickKeysOnly = ['cgrups']
  }
  return await pc.updateUsers(userId, rows, opt)
  ```

  表鎖稍後才在 `server/procCore.mjs:326–339` 取得。分別摘錄 `330`、`336–339`：

  ```js
  read: () => woItems[keyTable].select(),
  ```

  ```js
  baseline: baseline === null ? undefined : baseline,
  contract: getContract(keyTable),

  write: async (ltdtOld) => {
  ```

  write 區塊 `339–555` 不再以 ltdtOld 驗操作者，`502` 直接儲存 diff：

  ```js
  await procOrm(userId, keyTable, 'save', r.diff, { mustExist: true })
  ```

- 失敗情境：預設整表 users 模式；系統管理者 B 帶舊全表（其中 B.isAdmin=y），省略 baseline。B 已過連線、執行身分及 requireAdmin，正等 users 鎖；先持鎖的 A 完成 B.isAdmin=n 的撤權後釋鎖。B 取得鎖時 ltdtOld 已含 B.isAdmin=n，仍把舊表的 y 當 diff 儲存 → 預期撤權後尚未提交的 B 寫入拒絕且零變更；實際 B 再成系統管理者並得成功回應。一般 UI 帶 baseline 通常會得 saveStale，但無基準是明確接受的入口（`procCore.mjs:332–336`），不能當成授權保證。
- 建議：至少 users 整表寫入須在 users 鎖內、任何變更前，以同份新鮮 ltdtOld 再驗操作者。其他表若要保證撤權後不再提交，授權讀取也需與 users 角色異動依既有鎖階層協調。補受控等待點的並發測試：B 過早期檢查 → A 完成降級 → B 恢復，驗拒絕且未升回。requireAdmin 只能補降級發生在其讀取之前的窗口；`test/api-callerIdentity.test.mjs:243–255` 現在特別斷言未走到 requireAdmin，未測此窗口。

**其他遠端入口：已檢查、未發現另設的未授權讀表入口。**

檢查範圍：`server/WWebPerm.mjs:579–596`、`807–1102`、`1105–1277`；`server/dataChannel.mjs:19–59`；`server/provideTabs.mjs:68–119`；`srv.mjs:26–115`；`g_mOrm.mjs:1–19`、`g_initialTestData.mjs:1–22`、`g_getSettings.mjs:6–15`；`src/main.js:37–80`、`src/schema/index.mjs:8–19`。

apis 只有所列四個自訂路由，kpFunExt 只有三個唯讀與四個寫入函數；選項未將呼叫端的 apis/kpFunExt 展開進去。表名確為四表，methodsExec 只有 select，另有 authorizeExec。provideTabs 是呼叫同步路由的用戶端 helper；g_*.mjs 持有本機 DB 能力但未註冊 HTTP。自訂事件監聽只有 srv 的 error，前端 recvData 只接收資料；未見自訂未驗證廣播 handler。

tableNamesSync 全開四表，故 polling 也屬回管理資料的格。依已知框架前提，[sys:polling] 每次仍受兩道 token 驗證；副本沒有框架實作，不能由 tableNamesSync 自行推論另有未驗證主動推播。本結論限已給前提及本套件原始碼。

# 二、對標與對稱

[Django AdminSite.has_permission](https://docs.djangoproject.com/en/6.0/ref/contrib/admin/#django.contrib.admin.AdminSite.has_permission) 預設要求啟用且具後台資格；[OWASP 授權指引](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) 要求每次請求在伺服端驗權，並依已認證身分限制可取資料。本套件分開後台、資料 API 及本人權限入口，方向相符。下表是依本套件程式作的比較，不表示上述系統保證所有提交時競態均已解決。

| 元素 | 實際處理 | 對稱性判斷 |
| --- | --- | --- |
| checkToken | getAndVerifyAdminUser(token,from)，`WWebPerm.mjs:589–594` | 所有 apiType 原樣傳 from，沒有略過系統管理者檢查的分支 |
| getUserIdByToken | getAndVerifyAdminUser(token,'main')，`1186`；回 perm 內 id | main 與連線閘對稱；兩 token 可為不同人是刻意契約 |
| /api/getUserByToken | getAndVerifyAdminUser(token,'getUserByToken')，`833` | 登入即拒非系統管理者，資料 API 仍另驗 |
| /api/getPerm | getAndVerifyClientUser(token,'getPerm')，`883` | 刻意允許一般使用者，但未保持解析出的列是 #3 缺陷 |
| /api/getPermUserInfor | getAndVerifyAppUser(tokenSelf,'getPermUserInfor')，`959`；目標另解析 | 刻意的服務授權，可查別人；呼叫者不須有 perm 列 |
| /syncAndReplaceTabs | getAndVerifyAppUser(token,'syncAndReplaceTabs')，`1058`；驗表名及 payload | 刻意的服務寫入入口，不在 perm 系統管理者判準內 |

五條資料通道的對應為 POST /api/ulctr → upload-controller、POST /api/slc → upload-slice、POST /api/dwgfn → download-get-filename、GET /api/dwgf → download-get-file、POST /api/dw → download（`server/WWebPerm.mjs:58`、`586`；`test/api-adminOnly.test.mjs:202–207`）。verifyConn 在 `1143` 將 apiType 原樣交給 checkToken，`592` 再原樣交給系統管理者 helper；main 的標頭與本體兩次部署驗證都用 main，登入用 getUserByToken、本人查詢用 getPerm。app 驗證則分別用 getPermUserInfor、syncAndReplaceTabs。未見 from 拼字或通道分流導致的角色閘遺漏。

成熟 RBAC 常另有逐模型／操作權限；本套件單一系統管理者可讀寫四表是明定政策，不因缺少更細的後台分權而列缺陷。app 例外也不能誤稱已由 perm 系統管理者資格保護；`srv.mjs:100–107` 範例以外部 isAdmin 判 app 使用者，顯示 app 授權確實是另一信任條件。

#5 [嚴重度:中] hapi 查詢入口未像執行身分入口一樣正規化 ORM 例外，會把原始錯誤訊息當 msg 回傳。

- 位置：`server/WWebPerm.mjs:469` 的 users 查詢沒有 catch；`651`、`722–734` 的使用者及三表讀取亦會上拋。登入 handler 的 `851–857`：

  ```js
  let r = await pm2resolve(core)() //w-ui-loginout接收已預設格式用pm2resolve轉過, 須另提取state進行判斷
  if (isErr(r.msg)) {
      r.msg = r.msg.message
  }
  // console.log('getUserByToken', r)

  return r
  ```

  getPerm 的 `928–934`、app 查詢的 `1006–1012` 同樣處理。對照 `1188–1191`：

  ```js
  catch (err) {
      let key = toOutKey(err, 'cannotFindUserId') //已知語系鍵原樣(cannotFindUserFromToken／cannotGetUserFromPerm／userNoPermission／userNotAdmin 等), 其餘(ORM／I/O 原文、Error)一律 cannotFindUserId, 不外送原文
      srLog.error({ event: 'getUserIdByToken-error', msg: key })
      return Promise.reject(key)
  }
  ```

- 失敗情境：有效 token 查登入時 users.select 因 DB/I/O 問題 reject Error('DB_READ_FAILED')；或一般使用者查 getPerm 時 grups.select 同類失敗 → 預期回已知語系鍵；實際 handler 對錯誤結果取 .message，回 DB_READ_FAILED 原文。驅動錯誤若含查詢值或路徑也會一起送出。wrapInjected 擋上游回呼例外，未涵蓋 ORM 例外。
- 建議：各 hapi 邊界的失敗 msg 統一套 toOutKey，未知值回固定鍵並記安全摘要。verifyConn 的 `1147–1148` 也把未知 err.message 放入 srLog.msg，應一併正規化，避免驅動例外帶個資。補 ORM 查詢失敗測試，不只測外部 getUserByToken/verify* 失敗。

**其餘對稱性：已檢查、未發現。** `WWebPerm.mjs:497–538`、`579–595`、`832–833`、`1120–1198` 顯示三處管理入口共用判準。上下載 apiType 均經 checkToken；執行身分的 main 與已給框架前提相符，未見「系統函數先執行、後反查 token」的註解／用法矛盾。`dataChannel.mjs:9`、`WWebPerm.mjs:1210` 尚寫舊 helper 名 getAndVerifyClientUser，實際控制流已改走系統管理者 helper，舊註解不構成繞路。

# 三、方案與步驟

**範圍一：判準、拒絕次序與前端已檢查、未發現本輪指定行為的實作錯誤；身分保持及競態例外見 #1–#4。**

`server/adminCheck.mjs:11–16` 排除 null、非物件、陣列，只認自有屬性及精確字串 y：

```js
let has = (k) => Object.prototype.hasOwnProperty.call(row, k)
return has('isActive') && has('isAdmin') && row.isActive === 'y' && row.isAdmin === 'y'
```

`server/WWebPerm.mjs:514–523` 先回部署否決 userNoPermission，再回角色否決 userNotAdmin。新角色拒絕的 srLog 只含 event/msg/from；執行身分拒絕只含 event/msg；requireAdmin 另記 funcName/userId。userId 是使用者識別紀錄，不能稱為完全沒有識別資料。

`server/wrapInjected.mjs:45–83` 不送上游原文，`server/maskLog.mjs:29–96` 遮罩 token 並去除 Referer query/fragment。上述正常拒絕路徑未見原始 token 或整列 user 進 srLog；ORM 異常見 #5。`WWebPerm.mjs:404–423`、`481`、`515` 還有直接印 user 的 console，故不能把結論擴張成所有主控台輸出都無使用者資料。

前端 `src/App.vue:84–106` 設 csErrNotAdmin、清 Vuex token，該錯誤直接 return，早於 urlRedirect 與 timer；`133–145` 的 ready 要求 csLogin。`src/components/LayoutState.vue:57–67` 有提示分支；`src/plugins/mUI.mjs:43–47`、`187–205` 有未載入後端字典時可用的雙語 fallback；`server/procLang.mjs:28–32`、`480–484` 文字一致。停留可顯示拒絕原因；部署方先拒的一般使用者仍得 userNoPermission，走舊 redirect 流程，是既定優先序的結果。localStorage 的處理由登入依賴負責，本副本未附該實作，不能把清 Vuex token 當作本次已實測 localStorage 清除。

**指定三種變異：均有能辨別的斷言（以下僅靜態推演）。**

| 單一變異 | 會失敗的關鍵測試 | 失敗原因與限制 |
| --- | --- | --- |
| checkToken 改回 getAndVerifyClientUser | `test/unit-adminOnlySite.test.mjs:84–88`（AOS-S1）、`105–116`（S4）；`test/api-adminOnly.test.mjs:135–151`（AO-A1）、`216–225`（AO-A6）；`test/api-callerIdentity.test.mjs:213–224`、`243–262` | main 還有本體閘，會回 userNotAdmin，與預期連線層 permission denied 不同；上下載則不再被此角色閘拒。不能錯稱此單一變異就讓 main 讀表成功。 |
| getUserIdByToken 改回 getAndVerifyClientUser | `unit-adminOnlySite.test.mjs:90–94`（S2）、`105–116`（S4）；`api-adminOnly.test.mjs:233–246`（AO-B1）、`259–266`（AO-B3） | 標頭 A／本體 M 時，getWebInfor、表 select、getFuncList 會成功，拒絕斷言失敗。AO-B1 第一個 updateGrups 仍可能被 requireAdmin 擋住；同測試的唯讀案例才揭露缺陷。 |
| /api/getUserByToken 改回 getAndVerifyClientUser | `unit-adminOnlySite.test.mjs:96–103`（S3）、`105–116`（S4）；`api-adminOnly.test.mjs:274–297`（AO-C1/C2）；`test/e2e-init.test.mjs:429–437`（E2E-007） | 登入收到 success 而非 userNotAdmin。資料通道兩閘仍在，會違反登入契約而非因此讀到四表；前端可能轉成連線失敗狀態。 |

另已讀 `api-adminOnly.test.mjs:154–168`、`249–256`、`288–297` 的 perm 升降級對照，`322–346` 的本人權限及 app 對照。E2E-007 的 `431–462` 有後端拒絕、雙語畫面、停留、不進殼層、localStorage token、未發 main 請求斷言；均未在本副本執行。動態系統函數入口表實際只列 getFuncList/getTableTags（`api-adminOnly.test.mjs:127–128`），polling 的授權結論依共用閘及已給前提。

AOS-S5/S6（`unit-adminOnlySite.test.mjs:119–142`）只釘角色判定先後及 wrapper 呼叫順序，沒有執行可改寫 id 的回呼，也沒有在表鎖排隊時完成降級的案例，不能視為 #2–#4 已有行為測試。

**範圍二：同批重複 id 已檢查、未發現遺漏的後台寫入路徑。**

檢查 `server/procCore.mjs:40–64`、`137–299`、`326–410`、`462–555`、`581–629`；`server/keyCheck.mjs:24–43`；`server/validateRows.mjs:38–119`；`server/cascadeWrite.mjs:23–31`、`48–101`；`server/syncCore.mjs:121–152`、`227–280`、`302–390`；`src/js/refCascade.mjs:450–495`。

| 輸入格 | 實作結果 |
| --- | --- |
| users/grups/pemis 既有或新增同字串 id | prepRows 在 diff 前 findDupIndex，整批 saveRowFieldDuplicate（`procCore.mjs:269–275`）。Set 不會誤判原型鍵名。 |
| 有限數字 7／字串 '7'，含 0／'0' | 先 String(id)，再判重複（`264–275`）。 |
| targets 重複字串 id | ckKey 先拒絕（`247–251`）。targets 數字／缺 id 本就不合法，先回 saveRowFieldInvalid，不能當成另三表的數字 id 契約。 |
| users for:grups 同 id，含數字／字串 | `291–297` 在 mergePickKeysOnly 前判重複；`344–348` 合併前也先正規化，未先被 kpIn[id] 覆蓋。 |
| users/grups/pemis 多筆缺 id、id=''／null | 不參與重複檢查，`404–407` 各自附入 r.add，不進 Map 的空鍵合併。非法 id 型別另由 validateRows 拒絕。 |
| for:grups 缺 id／不存在 id | 不採新增是明確契約；merge 用既有 DB 列為基底（`40–64`），不是把兩個新使用者併成一個。 |
| 裸表寫入、連帶改寫與同步 | main 只開 select；連帶變更由庫內列規劃且先 validate。同步拒外部 id，另驗 srcKey 唯一及配發 id 不撞號。 |

`procCore.mjs:404–407` 的關鍵片段：

```js
let withId = ltdtNew.filter((v) => isestr(get(v, 'id')))
let noId = ltdtNew.filter((v) => !isestr(get(v, 'id')))
r = ltdtDiffByKey(ltdtOld, withId, 'id')
r.add = [...r.add, ...noId]
```

純預檢先於 lockSave/guardWrite 及 del/insert/save，同批有效 id 重複不會進任何寫入。ltdtDiffByKey 與 mergePickKeysOnly 的覆蓋風險各有前置檢查；未再找到由公開 wrapper 避過檢查的路徑。本機持有 raw ORM 的維運程式屬不同信任邊界。

測試已讀但未執行：`test/unit-procCore-writeValidate.test.mjs:462–551`（WV-DUPID-001～006，四表既有／新增 id、唯一對照、三表數字／字串、for:grups 預檢）；`test/api-batchIdDup.test.mjs:76–127`（四表 RPC 零變更與 for:grups）；`test/unit-procCore-idless.test.mjs:148–192`、`202–242`、`288–310`（多筆缺 id 不併列、targets 拒收）。

#6 [嚴重度:中] isSameFile 在所有平台先轉小寫，會把大小寫敏感檔案系統上的不同檔誤判為同檔。

- 位置：`server/tools/authRefsAudit.mjs:144–146`：

  ```js
  function isSameFile(fpA, fpB, statFn = fs.statSync) {
      let same = path.resolve(fpA).toLowerCase() === path.resolve(fpB).toLowerCase()
      if (!same && fs.existsSync(fpB) && fs.existsSync(fpA)) {
  ```

  `168–170` 遇 true 即拒絕輸出。同型工具 `server/tools/isMain.mjs:23` 至少區分平台：

  ```js
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
  ```

- 失敗情境：大小寫敏感檔案系統有有效 in.json 與不同的 IN.json；執行 `node server/tools/authRefsAudit.mjs in.json --clean-out IN.json` → 預期判不同檔、正常輸出且輸入不變；實際第一行 true，跳過 bigint stat，以同檔錯誤離開碼 2 拒絕。輸出未存在但僅大小寫不同也會誤拒。本輪 bigint 修正未覆蓋既有短路判斷。
- 建議：不要用轉小寫直接證明同檔；字串完全相等可先判，其餘存在檔以實際 realpath／BigInt 檔案識別判斷。這比僅依 process.platform 推論檔案系統準確（[Node 官方指引](https://nodejs.org/learn/manipulating-files/working-with-different-filesystems#filesystem-behavior)）。補大小寫敏感環境的不同檔對照；`test/unit-refAudit.test.mjs:904–911` 現在只有 Windows 同檔正例，其他平台 skip。

#7 [嚴重度:高] ino=0n 的不可判定被當作不同檔，符號連結別名可通過檢查而覆寫輸入匯出檔。

- 位置：`server/tools/authRefsAudit.mjs:148–150`（計算結果於 `152` 返回）：

  ```js
  let a = statFn(fpA, { bigint: true })
  let b = statFn(fpB, { bigint: true })
  same = a.ino !== 0n && a.ino === b.ino && a.dev === b.dev
  ```

  檢查後，`server/tools/authRefsAudit.mjs:178` 直接寫入輸出：

  ```js
  fs.writeFileSync(cleanOut, JSON.stringify(cleanOutOf(rp.changes), null, 1), 'utf8')
  ```

  `test/unit-refAudit.test.mjs:987–989` 明確考慮此輸入：

  ```js
  //inode 為 0(部分檔案系統不提供)不當作同一檔
  let statZero = () => ({ ino: 0n, dev: 1n })
  assert.strictEqual(isSameFile(fp, other, statZero), false, 'inode 為 0 視為不可判定, 不當同一檔')
  ```

- 失敗情境：底層檔案系統 stat 不提供可用 inode、回 ino=0n；存在有效 in.json，以及指向它的 alias.json 符號連結，路徑名稱不同。CLI 用 `in.json --clean-out alias.json` → 預期同檔或不可判定而拒絕，保留輸入；實際 exists 都真，但 a.ino!==0n 為假而回 false，writeFileSync 沿連結將原匯出檔截斷成僅含清理列的輸出。本發現限定 inode 不可用的檔案系統，不是正常 NTFS 非零 bigint 比較錯誤，也不須路徑競態。
- 建議：存在路徑先 realpath 識別符號連結／父目錄別名，再用非零 BigInt ino+dev 識別硬連結；仍無法辨識時保留不可判定狀態，不可當作已證明不同檔後容許破壞性覆寫。補「符號連結 × ino=0n」測試；現有 RA-036e 真實 symlink 與 RA-037b 兩普通檔 statZero 分開，未覆蓋交集。

**範圍三的 bigint 精度修正本身：已檢查、未發現數值比較錯誤。**

`authRefsAudit.mjs:148–150` 兩次 stat 都給 {bigint:true}，ino/dev 同為 BigInt；a.ino!==0n 正確，未混 Number 0。符合 [Node fs.statSync 的 bigint 選項](https://nodejs.org/docs/latest/api/fs.html#fsstatsyncpath-options)。非零 inode 的硬連結／符號連結會以 stat 目標檔識別命中；不同 dev 即使 ino 相同也不命中。#7 是沒有可用識別之後的處理錯誤。

不存在檔的正常格已檢查：不同且未存在的輸出不比 inode，可正常寫出；輸入不存在則 readFileSync 在輸出前失敗；相同文字路徑先拒絕。#6 為大小寫敏感環境的例外。exists/stat 間檔案消失可能令 stat 拋錯，檢查又在 CLI try 外（`166–174`），會有未整理的錯誤輸出，但不會繼續寫檔，未另列資料破壞發現。

測試已讀 `test/unit-refAudit.test.mjs:881–1020`：RA-037b（`967–989`）有 Number 相同、BigInt 不同的確定性測資，並驗同 inode、不同 dev、0n，回退 Number 會被抓到。RA-037c（`992–1019`）尋找真實碰撞對，找不到即 skip；只是補充，不能單獨當固定回歸證據。全樹搜尋 .ino/.dev 的正式比較只見此站點；`server/tools/isMain.mjs:16–26` 用 realpath 字串，其餘 stat 用 size/isFile/isDirectory，未見另一個 Number inode 比較站點。
