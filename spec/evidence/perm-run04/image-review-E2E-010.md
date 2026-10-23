# perm-run04 標準圖審圖紀錄: external-rows E2E-010-1-warn-banner(eng、cht 共 2 張)

授權: 主控 2026-10-24(`decisions.tsv` phase `perm-run03-receipt` ③: 授權重產 `external-rows-{eng,cht}-E2E-010-1-warn-banner.png` 兩張,橫幅文案改為來源鍵口徑)。範圍外既有標準圖 0 張改變(`git status --short test/pics` 只列這 2 張,見文末)。
審圖依: 全域技能 role-coder-for-test-e2e §7.3、§7.6、§7.9;本專案已委任 agent 先行審圖(state.md「審圖委任」)。

## 一、動工前自列之預期(自 spec 衍生,先於產圖)

spec `流程_外部列保護與過期快照.md` E2E-010 視覺項: 「警示橫幅出現: 框住警示橫幅整條(淡橘底,緊貼上方外部列橫幅,框線置於間隙正中)」。
預期兩張圖(1440×900): ①群組頁,上方依序為外部列橫幅(灰底、鎖頭)與警示橫幅(淡橘 `#FFE0B2`、警告三角圖示); ②警示橫幅文字為**新文案**(`procLang.mjs:syncWarnIdRenumber`,代入 `{from}`＝`appExtWarn`、`{n}`＝1): eng 述 `renumbered its source keys…keep the srcKey of each item stable`,cht 述 `疑似重編來源鍵…請來源端保持來源鍵（srcKey）穩定`; ③紅框一個、框住警示橫幅整條、不框外部列橫幅; ④其餘畫面(側欄、標題、工具列、外部列橫幅、表格 5 列含外部鎖頭列 wg-renum)與舊圖相同(文案之外無有效內容改變)。

## 二、產製與量測

- 產製: `E2E_BASELINE_OUT_DIR=<tmp> node test/e2e-external-rows.test.mjs --baseline --names E2E-010`(先寫暫存目錄、審畢才複製進 `test/pics/external-rows/`,只寫這 2 個檔名;產製端語意斷言皆過)。**第一版 cht 文案「請來源端保持各筆資料的來源鍵（srcKey）穩定」折行,於第 2 行孤立 `定。` 兩字**——審圖不接受(橫幅變兩行、表格下移 17px、版面不同於舊圖且難看),改文案為「請來源端保持來源鍵（srcKey）穩定」(單行,與舊圖版面相同)後重產;`procLang.mjs`、各 spec、ADR 同步更新。
- 差異量測(`pixelmatch` includeAA:false、threshold 0.1;舊圖＝HEAD、新圖＝本次):

| 語系 | 差異像素 | 差異外框 | 紅框橫線列(舊／新) |
|---|---|---|---|
| eng | 5718 | x 216..1399、y 223..252(僅橫幅兩行文字) | 210..259／210..259(相同) |
| cht | 4732 | x 436..1378、y 222..235(僅橫幅單行文字,自「重編…」起) | 210..242／210..242(相同) |

差異全落在橫幅文字內; 紅框位置、側欄、標題、外部列橫幅、表格逐像素相同。

## 三、逐張目視(對照 spec「框住…」句;含 3 倍放大裁切)

| 檢查項 | eng | cht |
|---|---|---|
| 圖尺寸 1440×900 | ✔ | ✔ |
| 有紅框(長段紅線 ≥ 20px;像素掃描 9 列 #f26 橫線,非讀碼判定) | ✔ 210..259 | ✔ 210..242 |
| 一圖一框 | ✔ 1 個 | ✔ 1 個 |
| 框住對象正確: 警示橫幅整條(含警告圖示),不含上方外部列橫幅 | ✔ | ✔ |
| 框不壓字(§7.3-8,`framegap.mjs` 量測框內緣至框內墨跡〔亮度 < 170〕;≥ 2px 合格、≤ 1px 為缺陷) | ✔ 左 16、上 5、下 2(descender)、右 47 px | ✔ 左 16、上 5、下 2、右 53 px |
| 與 HEAD 舊圖之框幾何相同(同一量測) | ✔ 舊圖 左 16／上 5／下 2／右 31 | ✔ 舊圖 左 16／上 5／下 2／右 129 |
| 框線不蓋框外內容(§7.3-9): 框線上緣落在外部列橫幅文字(y≈199)與警示橫幅之間隙,下緣落在警示橫幅與表頭之間隙 | ✔(放大看兩側皆不貼字) | ✔ |
| 文字逐字 = `procLang.mjs:syncWarnIdRenumber`(代入後) = spec E2E-010 驗證 1 | ✔(兩行折行,與舊圖同為兩行;末句 `Please ask the source to keep the srcKey of each item stable.`) | ✔(單行,末句 `請來源端保持來源鍵（srcKey）穩定。`) |
| 外部列橫幅仍在、表格 5 列、wg-renum 鎖頭列 | ✔ | ✔ |
| 兩語系對稱(同畫面同位置同框) | ✔ | ✔ |
| 無殘留 toast、tooltip、hover 態 | ✔ | ✔ |

結論: 兩張皆可凍結。與手冊相關之 description、驗證 1 之橫幅文字(spec)已同步改寫,圖文對帳: 橫幅文字、位置詞(清單上方、淡橘、緊貼外部列橫幅)、數量(1 條警示、1 筆)一致。

## 四、安裝與回歸

`cp` 兩張進 `test/pics/external-rows/` 後: `git status --short test/pics` 只有這 2 張;`e2e-external-rows` E2E-010 比對模式 eng／cht 通過(見報告)。
