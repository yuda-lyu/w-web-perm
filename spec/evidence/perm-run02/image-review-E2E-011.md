# 審圖紀錄:external-rows E2E-011(perm-run02 範圍二, 2026-10-23)

授權: 主控(使用者 2026-10-23「有動到需改標準圖,就由你判準」)——E2E-011 之舊預期(不編輯即等他人改表再勾選存檔被拒)與 perm-run01 起之行為(無草稿時推播重建並更新基準)衝突, 改寫為「先勾選形成草稿 → 他人改 mary → 等過期提示 → 存檔被拒」。
產製指令: `node test/e2e-external-rows.test.mjs --baseline --names E2E-011`(`quiet-run --lock`; 兩語系各 1 案、各 2 階段共 4 張)。產前舊圖備份於 `tmp/perm-run02/old-pics/`(收尾已清)。
範圍驗證: `git status --short test/pics` 只見下列 4 檔(` M`), 其餘 0 張改變; 產後以比對模式 `mocha --grep "E2E-01[123]-"` 兩語系 6/6 通過。

| # | 圖 | spec 視覺項(框住…) | 目視結果 | 與舊圖差異 |
|---|---|---|---|---|
| 1 | `external-rows-eng-E2E-011-1-click-save.png` | 點擊前: 框住對話框之儲存鈕(標頭右側圓鈕整顆) | 對話框「Edit permission group of users」開著; 工具列與表頭間多一則淡橘「資料已被更新…儲存將被拒絕…」提示(兩行); peter、mary 皆已勾選且 OR 權限群組M1 晶片為選中色(草稿已形成); 單一紅框框住標頭右側儲存鈕(含圓底), 框內緣離鈕內圖示墨跡≥ 2px, 未壓字; 左側全螢幕鈕與框間有空隙。 | 多一則提示, 表頭與列整體下移約 46px; 儲存鈕紅框位置不變 |
| 2 | `external-rows-eng-E2E-011-2-stale-box.png` | 點擊後: 框住失敗訊息框(整個彈窗面板含標題、訊息與「確認」鈕; 疊在對話框之上) | 「System message」彈窗內文 `Failed to save users: Not saved: the data changed (by someone else or by an external synchronization) after this page was loaded. Nothing was changed. Please reload the page and try again.`; 單一紅框框住整個彈窗面板(標題列、內文、OK 鈕); 背景對話框仍開、提示仍在、儲存鈕呈焦點灰(請求已結束、鎖已釋放) | 背景多一則提示; 彈窗本體與紅框位置不變 |
| 3 | `external-rows-cht-E2E-011-1-click-save.png` | 同 1 | 中文提示為單行「資料已被他人或外部同步更新，本視窗內的資料已過期，儲存將被拒絕。請關閉本視窗後重新開啟，以取得最新資料。」; 其餘同 1(兩語系對稱: 提示列數不同導致表格下移量不同, 為文字長度所致, 非缺陷) | 同 1(下移較少) |
| 4 | `external-rows-cht-E2E-011-2-stale-box.png` | 同 2 | 「系統確認訊息」彈窗: `儲存使用者數據失敗: 未儲存：載入此頁面後資料已被他人或外部同步更新。資料未變更，請重新整理頁面後再操作。`; 單一紅框框住整個彈窗面板 | 同 2 |

逐項核對(技能 §7.3):
- 一圖一框 ✓(四張皆單一紅框); 框對象為整顆元件(儲存鈕含圓底; 彈窗面板含標題與按鈕) ✓。
- 框不壓字(§7.3-8): 儲存鈕框內為圖示, 內緣與圖示墨跡≥ 2px; 彈窗框內緣與標題「System message／系統確認訊息」、內文、OK 鈕皆有留白 ✓。
- 框線不蓋框外內容(§7.3-9): 儲存鈕框左緣與全螢幕圖示間有空隙, 未壓到; 彈窗為有遮罩之彈窗, 框線落在調暗之背景上 ✓。
- 框任一側落在圖片邊緣者(§7.3-10): 無(兩框皆離圖緣 ≥ 40px) ✓。
- 不含非決定性值(時間戳、耗時): 畫面內無時間欄位被框或遮蔽需求 ✓; 兩次產製之差異僅來自本次流程變更。
- 語意對照: 圖 1 之過期提示文字等於語系鍵 `staleDraftNoticeDialog`(eng／cht 原文); 圖 2／4 之失敗文字等於 `userSaveUsersFail` + `: ` + `saveStale`(語意斷言於案例內逐字比對, mocha 6/6)。
- 同類全掃: 同檔 E2E-001、004、006、007、010、016、020 之其餘 22 張既有標準圖(每語系 11 張)未重產, `git status --short test/pics` 無變動; 全專案 `test/pics` 除上列 4 張外 0 張改變。

結論: 4 張可凍結。
