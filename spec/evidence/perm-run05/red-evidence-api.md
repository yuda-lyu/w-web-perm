# perm-run05 修前紅燈證據(api 層, 真後端)

日期: 2026-10-24。

## 做法

在 repo 內備份本輪修改之 5 個 server 檔(`keyCheck`／`syncCore`／`procCore`／`WWebPerm`／`procLang`, md5 記於暫存區 `md5-mine.txt`), 暫時以 HEAD(a56e883)版本覆蓋
(HEAD 版取自 `git archive HEAD` 解出之副本; `keyCheck.mjs` 副本末端另有回 `null` 之 `findLoginIdClashDetail` 樁, 僅供匯出存在, HEAD 之 syncCore／procCore 不呼叫它, 行為即 HEAD),
以 `quiet-run --lock --name perm-run05` 執行本輪新增／改寫之 api 測試, 跑完立即由備份還原並以 md5 逐檔回驗(5 檔 md5 與備份相同)、確認 11006／8090 無監聽。

```
node C:/opensrcOper/tools/quiet-run.mjs --lock --name perm-run05 --timeout 3000 -- npx mocha --no-parallel test/api-mapKeyId.test.mjs test/api-getPermUserInfor.test.mjs test/api-keyProp.test.mjs test/api-authMerge.test.mjs --reporter spec --timeout 300000
```

## 結果: 21 passing／21 failing(修前碼對本輪新述語)

| 測試 | 述語(perm-run05) | 修前碼之徵狀 |
|---|---|---|
| MI-009 | 停用之外部列 srcKey 等於(停用)後台列 id → 後台存檔整次 loginIdCollision(不論 isActive) | 後台存檔成功(`ok:true`, 放行停用列之撞值) |
| MI-011 | 他來源 srcKey 相同(含停用者)→ 匯入整批 loginIdCollision、零寫入 | 匯入成功(`nAdd:2`) |
| MI-012 | 兩來源同 srcKey 一有效一停用 → 登入 ambiguousUserFromPerm | 登入成功(只計有效列, 取該有效列) |
| MI-013 | 他來源舊外部列(無 srcKey)以 id 為登入識別而參與 → 匯入整批拒收 | 匯入成功 |
| MI-014 | getPermUserInfor 的 userId 依登入對應(外部列傳 srcKey) | 傳 srcKey 查無(以內部 id 查找) |
| MI-016 | 停用之外部列 srcKey 等於新增後台列 id(有效或停用)→ loginIdCollision | 後台存檔成功 |
| API-getPermUserInfor-007／008 | 外部使用者以 srcKey 查授權(語意同上) | 以 srcKey 傳入查無 → 空權限 |
| API-KP-000／001 | 同上(api-keyProp 夾具改傳 srcKey) | 同上 |
| API-chm-\*(11 條) | 同上(api-authMerge 夾具改傳 srcKey) | 單元層與 API 層不一致(API 回空權限) |

MI-015(mappingBy 為 email／name 時 userId 維持內部 id)、MI-001～008／010 於修前修後皆綠(行為不變之對照)。
