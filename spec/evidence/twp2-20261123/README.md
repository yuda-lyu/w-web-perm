# 證據: 2026-11-23 twp2(排程第 603 項 w-web-perm 部分)

本資料夾只放「重現腳本」與其原始輸出; 判讀與規則見 `sgud/rule/`(`rulebook_security.md` R-CONSOLE-NOVAL-02、`rulebook_mechanism.md` 〈統計之 timeLength 入口檢測〉)與 `spec/設計要點與取捨.md` ADR-051. 腳本以專案根為工作目錄執行(`node spec/evidence/twp2-20261123/<腳本>`), 其所需之修前碼鏡像根(`./tmp/twp2/pre/`)以 `git archive <修前 commit> server src test srv.mjs package.json vue.config.js babel.config.js` 解開取得(裸名匯入向上解析至專案之 `node_modules`, 不必建目錄連結).

| 檔 | 內容 | 重跑 |
|---|---|---|
| `probe-shape.mjs`、`shape-diff.json` | 同一組輸入(33 種值、11 種錯誤)跑修前本地 `describeShape`／`describeErr` 與 wsemi `getDiagShape`／`getDiagBriefErr` 之輸出對照(字樣改變表之來源) | 先建鏡像根(上), 再 `node spec/evidence/twp2-20261123/probe-shape.mjs`(腳本內以 `./tmp/twp2/pre/` 為修前碼位置, 依實際位置調整) |
| `migrate.mjs` | 批次遷移腳本: 17 個檔之匯入行與 76 處呼叫(`describeShape(`→`getDiagShape(`、`describeErr(`→`getDiagBriefErr(`), 保留各檔原換行格式 | 已執行, 留作比照(sso、api 輪可改檔名清單後沿用) |
| `mutate.mjs`、`mutate-e2e.mjs`、`mutate-e2e3.mjs`、`mutation-results-all.json`、`mutation-results-e2e.txt` | 變異腳本(錨點須恰出現 1 次、改前後 sha256 回驗)與結果: 27 項單元／靜態／真後端變異＋3 項真瀏覽器變異(E1、E2 經 dev server; E3 須重新建置後覆蓋 `./dist`), 30／30 擊殺 |
| `swap-dist.mjs` | 暫時以新建置之前端檔覆蓋 `./dist`(供「後端 serve `dist`」之 e2e 案例〔如 `e2e-init` E2E-006〕驗證現行 `src`), 用畢以改動前之備份還原並逐檔 sha256 回驗 | `node spec/evidence/twp2-20261123/swap-dist.mjs use <新建置夾>`／`restore`(備份位置見腳本檔頭) | 以專案根為工作目錄、經測試鎖(`--lock`)之安靜執行器包住執行: `node spec/evidence/twp2-20261123/mutate.mjs all`(腳本會暫時改動 `src/`、`server/`、`test/tools/` 之檔並於每項後還原, 執行期間不得編輯這些檔) |
