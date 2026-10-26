# perm-run02 輸入空間表與需求矩陣(2026-10-24)

任務: 主控裁示①②(應用系統路由相容、系統服務用途須 `app:` 前綴)。測試: `test/api-callerMatrix.test.mjs`(52 案, 計數器 950 格)、`test/unit-appToken.test.mjs`(20 案)。外審 sol 第一輪(F1～F7)後補 MX-R5～R7、MX-M5、MX-M6 與呼叫者軸 AFN／AFO; 增量輪(G1～G6)後補 MX-R8、MX-M7 並強化 MX-M6(下表為補後數字)。

## 一、需求述語(R) → 測試

| R | 述語(給定 → 可觀察) | 測試 |
|---|---|---|
| R1 | 給定呼叫者不在 perm users 表、反查 `isAdmin='y'`、未給 `isApp` → `/api/getPermUserInfor` 與 `/syncAndReplaceTabs` 放行(稽核欄記外部 id) | MX-H4、MX-H5、MX-R1(NF、NFV) |
| R1b | 給定不在表、`isAdmin='n'`(未給 `isApp` 或 `isApp='y'`) → `userNotAdmin`、零寫入 | MX-H4、MX-H5、MX-R1(NFN、ASN) |
| R1c | 給定在表之一般使用者(含使用者用途綁一般使用者) → `userNotAdmin` | MX-H4、MX-H5(U、AUM) |
| R1d | 給定在表之系統管理者(含使用者用途綁系統管理者) → 放行, 稽核欄記 perm 列主鍵 | MX-H4、MX-H5(A、AUA)、MX-M3 |
| R1e | 給定系統服務用途(`app:` 前綴、`isApp` y、`isAdmin` y、不在表) → 放行 | MX-H4、MX-H5(AS) |
| R1f | 給定使用者用途綁不在表之 sso 系統管理者 → 放行(與其自身使用者 token 一致) | MX-H4、MX-H5、MX-R1(AUX)、MX-R4 |
| R1g | 給定同一外部身分: 不在表放行 → 建成在表一般使用者(反查 `isAdmin` y 不採信)拒 → 在表有效系統管理者放行 → 停用拒(`cannotGetUserFromPerm`) → 刪列後放行 | MX-R2 |
| R1h | 給定 `isAdmin` 為 `'y'` 以外之各值(`'Y'`、`' y'`、`true`、`1`、缺欄、繼承屬性、陣列…) → 不算系統管理者宣稱 | AT-003a～c |
| R2 | 給定系統服務用途四條件(不在表、`isApp` y、`isAdmin` y、`id` 以 `app:` 開頭) → 後台登入檢查、資料通道(標頭／本體)、四個寫入函數通過; 缺任一條件 → 拒 | MX-H2、MX-C、MX-D、MX-R3、MX-M1 |
| R2b | 給定 `isApp` y、`isAdmin` y 但 id 不以 `app:` 開頭(APP、AUX) → 後台與資料通道拒, 回應與無效 token 相同(通訊路由 ≡ `permission denied`) | MX-H2、MX-C、MX-D、MX-R3 |
| R2c | 給定使用者用途綁不在表之 sso 系統管理者(AUX)與該系統管理者自身使用者 token(NFV) → 後台登入檢查回應逐字相同、資料通道標頭／本體拒絕鍵相同 | MX-R4 |
| R2d | `id` 前綴的近似形(`App:`、`APP:`、` app:`、`xapp:`、`app`、`app-k`、全形冒號、數字／null／陣列) → 非系統服務用途 | AT-001b(22×13×13 格) |
| R2e | 前綴比對只在 `adminCheck.mjs`; 應用系統路由不使用 `isSystemAppUser`、不出現 `isApp` | AT-S2、AT-S8、AT-S9 |
| R2f | `requireAdmin` 對不在表者仍須為近期登錄之系統服務用途 id(登錄點唯一) | AT-S5 |
| R2g | 給定嚴格系統服務形狀而 perm 有主鍵同為其 id 之停用列 → 在表, 以列為準(不落入系統服務用途); 啟用且系統管理者 → 以列通過; 降為一般使用者 → `userNotAdmin`(反查 `isAdmin` y 不採信) | MX-R5(帶 email 之嚴格形狀)、MX-M2／M5(email／name 對應鍵) |
| R2h | 給定 `isApp` 明確 `'n'` 或 `'Y'`、`isAdmin` y、不在表 → 後端系統管理者服務拒、應用系統路由放行 | 呼叫者軸 AFN／AFO 全入口 |
| R2i | 給定不在表且 `isAdmin` n 而 `verifyAppUser` 否決 → `userNoPermission`(部署方否決先於等級不足) | MX-R6 |
| R2j | 給定外部列系統管理者(srcKey 對應, 內部 id 系統配發) → 各入口通過, 稽核欄記 perm 內部 id | MX-R7 |
| R2k | 給定不在表之 sso 系統管理者(NFV／AUX)經 `/syncAndReplaceTabs?keyTable=users` 匯入自己的 users 列 → 之後同一 token 以該列通過後台與資料通道, 稽核欄由外部 id 轉 perm 內部 id(①的權限面, 既定政策, 固定其結果) | MX-R8 |
| R2l | 給定嚴格系統服務形狀、外部 id≠列主鍵、只靠 email／name 命中停用列 → 在表, 各入口拒 | MX-M7(mappingBy=email) |
| R3 | 給定系統服務用途 id 近期已登錄、perm 其後建立主鍵同為該 id 之系統管理者列、一般 sso 系統管理者經該列通過驗證、列於 `requireAdmin` 讀取前被刪 → 寫入函數 `userNotAdmin`、零寫入(外審 sol F3) | MX-M6(確定性競態) |
| N | 不得改變: P-3 Bearer(MX-B1／B2)、P-5 先驗身分(MX-Q1)、sol#5 固定鍵(各格失敗 msg 皆為語系鍵)、稽核 id 記 perm 列主鍵(MX-M3)、1.1.15 行為(`api-adminOnly` 等既有 api 全跑) | 見報告 |

## 二、輸入空間表: 呼叫者 15 × 入口

呼叫者(軸 1): N、U、A、AUA、AUM、AS(目標 6)＋NF、NFV、NFN、ASN、AUD、APP、AUX、AFN(`isApp` 明確 `'n'`)、AFO(`isApp` 為 `'Y'`)(相容軸 9)。
入口(軸 2): 靜態檔 1(2 個路徑)、hapi 路由 4(`getUserByToken`／`getPerm`／`getPermUserInfor`／`syncAndReplaceTabs`)、通訊路由 5、資料通道函數 14(標頭／本體兩個身分來源; `[sys:polling]` 本體屬框架, 只測標頭)。
每格「現況／應然」: 現況＝本輪修後實測結果, 應然＝上表 R; 兩者一致才綠。

| 項 | 數 |
|---|---|
| 目標格(15 呼叫者 × 〔靜態檔 1 ＋ hapi 4 ＋ 通訊路由 5 ＋ 資料通道 27 個身分來源格〕 ＝ 15×37) | 555 |
| 　已測(有斷言) | 555 |
| 　刻意允許 | 0 |
| 　已知不修 | 15(`[sys:polling]` 本體 `__sysToken__` 身分來源 × 15 呼叫者; 檢查屬框架 w-serv-webdata ≥1.1.16, 本機 w-serv-broadcast 1.1.10 無, 排程第 128 項; 該入口標頭來源已測) |
| 　未填 | 0 |
| `mappingBy`＝email／name 變體(MX-M1: 15 呼叫者 × 後台登入／應用路由／資料通道標頭／本體 4 檢查點 × 2 對應鍵) | 120 |
| 專屬案(MX-R1～R8、MX-P1～P7、MX-M2～M7、MX-B、MX-Q) | 與上列合計, 測試內計數器 `已斷言格數` ＝ 950(斷言計數, 非格數) |
| `isSystemAppUser` 單元輸入空間(id 22 × isApp 13 × isAdmin 13) | 3718 格; 真值 2 格(`app:k`、`app:`) |
| `isExtAdminUser` 單元輸入空間(id 7 × isApp 13 × isAdmin 13) | 1183 格; 真值 91 格(`isAdmin==='y'` 者) |

行為差異(相對 perm-run01 檢查點 `daddd01`; 其餘格不變):

| 呼叫者 | 入口 | 檢查點 → 本輪 | 對應裁示 |
|---|---|---|---|
| NF(`app:` id、`isApp` 未轉傳、`isAdmin` y、不在表) | 應用系統路由 | 拒 → 放行 | ① |
| NFV(sso 系統管理者自身 token; 新增軸) | 應用系統路由 | 拒 → 放行 | ① |
| APP(`id-for-application`、`isApp` y、`isAdmin` y) | 後台登入檢查、資料通道 | 放行 → 拒 | ② |
| AUX(使用者用途綁不在表 sso 系統管理者; 新增軸) | 後台登入檢查、資料通道 | 放行 → 拒 | ② |

未列入之軸(誠實記載): 未對 `mappingBy='id'` 以外之對應鍵逐軸測「id 恰等於某列主鍵」(僅 MX-M2〔email／name 各一〕涵蓋); `verifyClientUser` 的各種回傳值對 AS 無影響(AS 不經 `verifyClientUser`)，未獨立列格。
