# perm-run05 修前紅燈證據(單元層)

日期: 2026-10-24。

## 做法

修前碼＝`git archive HEAD server src package.json`(HEAD＝a56e883, perm-run04 檢查點)解到 repo 內 `tmp/perm-run05/red/`(node_modules 由 repo 根解析),
放入本輪已改寫之 3 個單元測試檔(`unit-loginId`／`unit-procCore-loginId`／`unit-syncCore`)與 `test/tools/`,以 `quiet-run` 執行:

```
node C:/opensrcOper/tools/quiet-run.mjs --name perm-run05-red --cwd <repo>/tmp/perm-run05/red -- node <repo>/node_modules/mocha/bin/mocha.js --no-parallel test/unit-loginId.test.mjs test/unit-procCore-loginId.test.mjs test/unit-syncCore.test.mjs --reporter dot --timeout 60000
```

修前碼無 `findLoginIdClashDetail` 匯出, 副本內 `server/keyCheck.mjs` 末端另加回 `null` 之樁(僅紅燈副本; 目的: 測試檔可載入, 逐條斷言失敗, 而非整檔因缺匯出而無法載入)。

## 結果: 117 passing／16 failing(修前碼對本輪新述語)

| 測試 | 述語(perm-run05) | 修前碼之徵狀 |
|---|---|---|
| LI-016b | 兩來源外部列同 srcKey, 只有一列有效 → 仍命中兩筆(拒絕); 與後台列同值亦然 | `isActive=n/y` 時回 count 1 並登入有效列(「只計有效列」放行) |
| LI-021 | id 模式之查詢條件不帶 isActive(才能不論停用皆計筆) | 條件為 `{id,isActive:'y'}`／`{srcKey,isActive:'y'}` |
| LI-033 | 撞值不論 isActive | 外部列停用時不判撞 |
| LI-034 | 舊外部列(無 srcKey)以 id 為登入識別參與比對 | 舊外部列不參與 |
| LI-035 | 他來源外部列彼此同 srcKey 即撞值 | 不判撞 |
| LI-035b | 回撞值細節(對象索引與種類) | 樁回 null |
| LI-036 | 非物件／缺欄位安全略過且回第一個被觸及且撞值者 | 結果不同 |
| SITE-LI-002 | syncCore 以 `findLoginIdClashDetail` 檢查且位於第一個寫入之前 | 無此呼叫 |
| SITE-LI-003 | procCore 以 `findLoginIdClashDetail` 檢查 | 無此呼叫 |
| SITE-LI-005 | getPermUserInfor 路由先經 `resolvePermUserId`(經 findLoginUsers、多筆 ambiguousUserFromPerm、mapKeyOf 區分模式), `/api/getPerm` 不經 | 無 `resolvePermUserId` |
| UL-003／UL-004／UL-005 | 後台存檔: 停用列／他來源外部列亦構成撞值; 觸及判定含來源; 歷史撞值仍可修復 | 停用列不判撞、他來源不判撞 |
| SC-L3／SC-L4／SC-L4b | 匯入: 他來源 srcKey 相同、停用列、舊外部列 id 皆整批拒收(`loginIdCollision`, reason `srcKeyOtherFrom`), 零寫入 | 匯入成功(`{nAdd:1,...}`) |

api 層(真後端)之紅燈見 `red-evidence-api.md`。
