# 證據: 2026-11-24 twp3(排程第 609 項 w-web-perm 部分)

本資料夾只放「重現腳本」與其原始輸出; 判讀與規則見 `sgud/rule/`(`rulebook_security.md` R-CONSOLE-NOVAL-03)與 `spec/設計要點與取捨.md` ADR-052. 腳本以專案根為工作目錄執行(`node spec/evidence/twp3-20261124/<腳本>`).

| 檔 | 內容 | 重跑 |
|---|---|---|
| `probe-shape.mjs`、`shape-diff.json` | 同一組輸入(20 種錯誤、25 種值)跑修前本地 `nameOfErr`／`` `(typeof ${typeof v})` ``(逐字照錄於腳本內)與 wsemi `getDiagBriefErr`／`getDiagShape(v, { keys: false })`(另列預設)之輸出對照(字樣改變表之來源) | `node spec/evidence/twp3-20261124/probe-shape.mjs` |
| `mutate.mjs`、`mutation-results.json` | 變異腳本(錨點須恰出現 1 次、改前後 sha256 回驗、對照組先全綠)與結果: 20 項(`mShare.mjs` 之 console 兩站與匯入 17 項＋新增檔 3 項), 20／20 擊殺 | 以專案根為工作目錄、經測試鎖之安靜執行器包住: `node C:/opensrcOper/tools/quiet-run.mjs --lock --name mut -- node spec/evidence/twp3-20261124/mutate.mjs`(腳本暫時改動 `src/`、`server/`、`test/tools/`、`README.md` 之檔並於每項後還原, 執行期間不得編輯這些檔; `dry` 參數只驗錨點) |
| `swap-dist.mjs` | 暫時以新建之前端檔覆蓋 `./dist`(供「後端 serve `dist`」之 e2e 案例〔`e2e-init`〕驗證現行 `src`), 用畢以改動前之備份還原並逐檔 sha256 回驗; 模式 `backup`／`use <夾>`／`restore`／`status`(備份位置 `./tmp/twp3/dist-backup`) | 先 `node spec/evidence/twp3-20261124/swap-dist.mjs backup`, 再 `npx vue-cli-service build --dest tmp/twp3/dist-new`, `use tmp/twp3/dist-new`, 跑 `e2e-init`, `restore`, `status`, 最後 `git status --short dist` 須為空 |
