# 變異驗證結果(perm-run02 範圍一, 2026-10-23)

施加方式: 就地以 Edit 於正本施加最小變異, 跑對應測試後以備份複本還原, `cmp` 回驗位元組相同(備份於 `tmp/perm-run02/*.orig.*`; 收尾已清)。web 測試以 `quiet-run --lock` 執行。

| # | 變異(拿掉…) | 施加位置 | 測試範圍 | 被抓到(failing) | 結論 |
|---|---|---|---|---|---|
| M1 | 伺服端主體身分檢查 | `server/procCore.mjs:withRefLock` 內 `if (subject !== null)` → `if (false && subject !== null)` | `unit-procCore-identity`＋`unit-refIdentity`; `api-identity` AI-1; `e2e-concurrent-edit` E2E-025／026 | unit 20 敗(457 過); api AI-1b、AI-1c × 兩表共 4 敗; e2e E2E-025／026 × 兩語系共 4 敗 | 被抓到 |
| M2 | 伺服端正向引用驗證 | `server/procCore.mjs:write` 內 `if (refDecl !== null)` → `if (false && refDecl !== null)` | 同上; `api-identity` AI-2; E2E-027／028／029 | unit 42 敗(435 過); api＋e2e 共 14 敗(api AI-2 系 8＋e2e 027～029 × 兩語系 6) | 被抓到 |
| M3 | 前端正向引用檢查(三清單頁) | `LayoutContentUsers／Grups／Pemis.vue` 之 `countRefMismatch(…) > 0` → `> 0 && false` | `e2e-concurrent-edit` E2E-030／031／032 | 6 敗(3 案 × 兩語系: 該收到「零請求之警告框」卻送出請求被伺服端拒收) | 被抓到 |
| M4 | 前端反向對話框主體檢查 | `VeGrupBlngUsers.vue`／`VePemiBlngGrups.vue` 之 `isSubjectOk = () => checkSubject(…) === 'ok'` → `() => true \|\| …` | `e2e-concurrent-edit` E2E-014／015／016(perm-run01 既有案) | 6 敗(3 案 × 兩語系) | 被抓到 |

M3 與 M4 於同一次 e2e 執行(`--grep "E2E-01[456]-|E2E-03[012]-"`)施加, 合計 12 敗, 12 案皆為預期之案例。
V14(檢查與寫入同鎖)之變異(「檢查在被引用表鎖內、寫入在鎖外」等)由 `unit-procCore-identity` IDN-5 之人為延遲併發案例守護; 測試撰寫者另對測試副本施加 31 個變異(`unit-refIdentity` 16、`unit-procCore-identity` 15): 28 個被抓, 其餘 3 個為等價變異或設計成空操作者(已排除), 副本已刪除。

**M5**(外審 sol#1 採納後新增): 拿掉選取記錄之同名衝突判定——`src/js/refIdentity.mjs:recordPicks` 衝突條件 `if (picks.has(n) && …)` → `if (false && picks.has(n) && …)`; 測試 `unit-refIdentity`(RI-7 兩案)與 `e2e-concurrent-edit` E2E-037; 結果 unit 2 敗(279 過)、e2e 2 敗(037 × 兩語系), **被抓到**; 已還原並 `cmp` 回驗。
