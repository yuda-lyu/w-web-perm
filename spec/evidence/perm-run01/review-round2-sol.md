# 多人同時編輯流程

### 發現(依嚴重度由高到低)

增量中的 `normC` 與 `delete out[k]` 未發現新回歸。#1、#2 是依 C 要求找到的既有漏網站點；#3、#4 是此次測試與文件修改的缺口。以下均為靜態審查結果，未執行測試。

**#1 [中] server/keyCheck.mjs:213 — 歷史空值仍可能被誤判為「本次觸及」，使合法存檔遭拒**

- **情境**：既有使用者的 `email` 為 `null`，送入同 id 列的 `email` 為 `''`，並合法修改其他欄位。兩種 email 表示在基準中等價，但 `checkUsersWrite` 仍視為改動。active 列的登入對應鍵也使用同一判定；前端 `getNameErrs` 亦有相同問題。
- **後果**：基準通過後，伺服端仍回 `saveRowFieldInvalid`；前端則可能先以空名稱／空 email 擋存。這些檢查在 `dropServerOnlyDiff` 之前，新增 `normC` 無法補救。
- **依據**：

  ```js
  // server/keyCheck.mjs:213
  let touched = o === undefined || v !== o[key]
  return touched && !isOk(v)

  // src/js/getNameErrs.mjs:108
  let touched = !(typeof r.id === 'string' && kpOldVal.has(r.id) && kpOldVal.get(r.id) === raw)
  ```

  `keyCheck.mjs:235` 對一般 email、`:253` 對 active 登入鍵呼叫上述判定；`getNameErrs.mjs:109` 將 touched 的壞值放入 `errBlock`。

- **把握度**：確定。
- **建議**：既有列的「是否觸及」採用內容空值等價；保留新增列及停用轉啟用時的必填驗證。補上歷史空值互換、同時修改指派欄的案例。

**#2 [中] src/js/externalUi.mjs:146 — 前端外部列守門仍把等價空值當成異動**

- **情境**：送出列與草稿基底僅有外部列 `description: null → ''` 等空值表示差異，例如貼上或清空空白格後送出。
- **後果**：新伺服端會接受並略過該列，四個清單頁卻仍可能顯示 `saveExternalRowChanged`，直接停止送出。
- **依據**：

  ```js
  // externalUi.mjs:13
  let normV = (v) => JSON.stringify(v === undefined ? '' : v)

  // externalUi.mjs:146
  if (r === undefined || fields.some((f) => normV(r[f]) !== normV(o[f]))) {
      n++
  }
  ```

  四頁早退呼叫點為 Users`:1437`、Grups`:1496`、Pemis`:1498`、Targets`:1063`。既有 EU-304 的前後端一致性案例沒有涵蓋 `null` 空值互換。

- **把握度**：確定。
- **建議**：前後端共用內容比較函式，並保留 `from` 的原比較方式；將空值互換加入 EU-304。

**#3 [中] test/api-baseline.test.mjs:188 — AB-6 仍會接受後台六輪一律誤拒的實作**

- **情境**：錯誤實作只要看到表內有外部列，就一律回 `saveExternalRowChanged`、完全不寫後台列；同步仍正常。
- **後果**：AB-6 的新增斷言全部可通過，仍不能排除這類「後台從未成功寫入」的錯誤。
- **依據**：

  ```js
  if (w.ok) {
      want = `ab6-${k}`
      wins++
  }
  else {
      A.equal(w.msg, 'saveExternalRowChanged', ...)
  }
  A.equal(gs.find((r) => r.id === id).description, want, ...)
  ```

  六輪拒收時，`want` 始終維持 BASE 值；未寫入的後台列恰好符合斷言。`:201` 的 `wins` 僅供輸出。

- **把握度**：確定（由斷言控制流程證成）。
- **建議**：增加「外部列存在且內容未變，單獨修改後台列必須成功」的對照，或控制排程固定驗證兩種順序。直接要求隨機六輪 `wins > 0` 會引入不穩定性。

**#4 [低] sgud/rule/rulebook_concurrent.md:35 — 空值互換的四表覆蓋筆數高於實際測試**

- **情境**：新增文件宣稱「`null`／`''`／缺欄互換 6 格 × 表 4」。
- **後果**：文件高估測試覆蓋；EX-999 不會揭露這項差異。
- **依據**：`test/unit-externalRows.test.mjs:687` 的 NORM 只有四種等價互換：`''→缺欄`、`''→null`、`null→''`、`null→缺欄`。EX-044b 雖有六種互換，`:351` 固定使用：

  ```js
  let old = [rowWith(ext('grups'), { description: ov })]
  ```

- **把握度**：確定。
- **建議**：文件改為「EX-044b 六格、僅 grups；EX-081 四格 × 四表」，或補齊 EX-081 的另外兩種方向。

### 已檢視而未發現問題的範圍

- `src/js/externalRows.mjs`：`normC` 僅合併頂層空值；`0`、`false`、`'0'` 仍各自不同，序列化內容的字串不會被解析或合併；`from` 例外保留正確。
- `server/procCore.mjs:updateTabItems`：名稱唯一檢查在移入 same 前執行；same 僅參與主鍵驗證，`writeMain` 只寫 add／diff；引用連帶依整表 id／名稱規劃，未發現移入 same 導致漏掉真實連帶。
- `hasExternalDiff`、`checkExternalWrite`：真正的指派變更仍保留於 diff；等價空值移入 same 後免要求基準合理；`from` 型別變更沒有因此繞過守門。
- `server/validateRows.mjs`：四個稽核欄並非必填；刪欄不會產生驗證錯誤。需要寫入的實際陣列／物件欄值仍被純量驗證拒收。
- `getProc.mjs`、`getMapOrm.mjs:adjustData` 至 `wo.save` 呼叫：刪欄後沒有再次依 schema 補欄；save 不補建立者／建立時間，更新者／更新時間由伺服器重填。
- `server/cascadeWrite.mjs:writeWithCascade`：補償使用獨立的 `holdersOld` 整列快照；主體列刪除稽核欄不影響引用端的還原資料。
- `test/api-baseline.test.mjs:restoreBase`：targets→pemis→grups→users 的還原次序符合引用方向，可避開先還原引用端造成的懸空新名拒收。
- AB-6 的結果集合：在該夾具及沒有其他寫入者的前提下，兩種鎖順序確實只產生成功或 `saveExternalRowChanged`；逐輪終態預期成立，未見合法交錯造成的誤判。
- 文件盤點指令實際得到 **5 筆**：`:30` 的 `normV(` 一筆，`:116`、`:235` 的 `normC(` 各兩筆，符合期望。

C 同類掃描其餘站點判斷如下；#1、#2 已涵蓋找到的內容比較漏網點。

| 站點 | 判斷 |
|---|---|
| `procCore.mjs:341、345` 的 `ltdtDiffByKey` | 即使先判為 diff，`:358` 仍經新比較重新過濾。 |
| `findTouchedDup.mjs:62`；`keyCheck.mjs:24、66` | 名稱／唯一鍵比對；有效值須為字串，應維持精確比對。 |
| `refCascade.mjs:250、253`；`findRefRows.mjs:27` | 引用實體名稱判定；新 grups／pemis 名稱另有非空字串驗證，未見合法空值互換被當成改名。 |
| `syncKeep.mjs:80、174` | 外部同步的身分與指派保留判定；有效登入鍵／群組名要求非空字串，歷史無效身分採收嚴，並非後台內容基準比較。 |
| `pairRowsToSnapshot.mjs:68`；`draftSync.mjs:136、141` | 額外驗證的是群組名稱／主體身分；有效主體名稱須非空。 |
| `draftSync.mjs:22` | 比較 store 陣列參照；內容是否過期另交共用基準判定。 |
| `relDialogSend.mjs:82`；`editorRefRows.mjs:161、233` | 比較正規化後的啟用／模式狀態，未直接比較頂層空欄。 |
| `cvKpToObj.mjs:64`；`VeCgrups.vue:771`、`VeCpemis.vue:768` | 關聯內容／編輯投影比較；字串內巢狀 `null` 與 `''` 本就不屬頂層空值等價。 |
| `getDelRefCount.mjs:101` | 同 id 同名的存續實體判定，與引用連帶口徑一致。 |
| `server/tools/fromTools.mjs:73、157`；`authRefsClean.mjs:170、228` | 離線稽核、序列化或精確回驗；不使用後台載入基準，保留表示差異合理。 |

新增測試的回退敏感度如下，均依程式推導：

| 回退修改 | 會失敗的案例 |
|---|---|
| `dropServerOnlyDiff` 改回 `normV` | EX-044b，1 案 |
| `checkExternalWrite` 改回 `normV` | EX-081 新增的三種含 null 等價格 × 四表，12 案 |
| 移除 `delete out[k]` | EX-051／051b／051c，3 案；`hasOwnProperty` 斷言能抓到保留偽造值或僅設成 undefined |
| EX-044c／044d、EX-081 非等價格 | 舊實作仍會通過；它們是防止過度合併的對照，屬合理設計 |

合計 **16 案**對回退敏感，與文件所述數字相符；EX-999 的 D=52、D2=33、E_norm=40 也與目前計數位置一致。

### 未檢視或無法判定的範圍

- 依限制，未修改檔案、執行測試、啟動服務或連網；沒有實測「變紅」或併發排程。
- 副本未附 `wsemi` 的 `ltdtmapping`／`ltdtDiffByKey` 原始碼及實際 ORM 後端實作。寫入追查至 `wo.save(input, { autoInsert:false })`；無法直接核實底層資料庫對缺欄的最終儲存表示。
- `baseline.mjs` 僅對照頂層空值與巢狀值口徑，未作其演算法審查；第一輪整批改動亦未重新全面審查。
