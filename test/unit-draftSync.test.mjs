//清單頁草稿對推播之處置與「資料已被更新」提示(R-PRINCIPLE-00 原則 7: 前端有未存編輯時收到推播不得靜默丟棄草稿; 使用者 2026-10-22 裁示; 規則帳本 R-BASELINE-01、R-DRAFT-KEEP-01; ADR-037 Update(run11))
//
//受測: src/js/draftSync.mjs(純函數 refsChanged／planDraftSync／isDraftStale)與其在四個清單頁(LayoutContent{Targets,Pemis,Grups,Users}.vue)、兩個反向關聯對話框(VeGrupBlngUsers／VePemiBlngGrups)之接線(靜態站點守護).
//真瀏覽器行為(未存編輯保留、橫幅出現、存檔被拒、重新載入)由 test/e2e-external-rows.test.mjs 之 E2E-014～017 走使用者路徑驗證。
//
//規格(每條 assertion 註解標出對應句):
//  [D1] 有未存編輯時收到推播(store 變新): 保留草稿與其載入時之基準, 不重建 items／opt／基準; 提示「資料已被更新」只在草稿載入時之整表與目前整表內容不同時顯示(外部同步整批重寫但內容未變 → 不提示).
//       反向關聯對話框本就不隨推播重建: 同樣只在「收到推播當下有未存編輯」且表已異於載入基準時提示(推播先於任何編輯者維持原行為: 靜默, 存檔時由伺服端拒收).
//  [D2] 無未存編輯時收到推播: 照舊重建 items 與基準(伺服端存檔之後的推播重建、他人之變更即時可見).
//  [D3] 使用者自己切換編輯模式: 重建(放棄草稿, 同修改前); 首次載入: 重建.
//  [D4] store 未變(重算由其他反應式依賴觸發, 例如語系切換使 genOpt 之依賴變動): 重建(同修改前, 表頭文字等隨之更新); 未存編輯旗標(isModified)以非響應式鏡像 syncMark.dirty 讀取, changeParams 不依賴旗標本身(旗標切換不得觸發重算);
//       旗標歸零而 store 於保留草稿期間已變新者, 由 watch isModified 立即依最新 store 重建(儲存成功之推播先於回應抵達之競爭).
//  [D5] 重建一律: 放棄未存編輯旗標、清除過期提示、記下所依據之 store 參照(syncMark)與列(baseRows); 存檔前之預覽／外部列守門以 baseRows(草稿所依據之版本)為「舊」, 不用已變新之 store.
//  [D7] 「重新載入」不得使保留草稿期間收縮掉的反應式依賴(語系等)永久失效(外審 sol 第 4 點): reloadDraft 只遞增響應式 syncTick, 由 changeParams 重算並於 computed 內重建(first-like), 依賴才重新收集; 重新載入後再切換語系, 表頭仍須更新.
//  [D8] 清單頁名稱／email 唯一檢查以草稿所依據之列(baseRows)為「舊」, 不用已變新之 store(外審 sol 第 6 點): 歷史同名且載入後他人改名時, 保留草稿不被誤判為「本次造成之重複」而在送出前被擋(應走 saveStale 重新載入處置).
//  [D9] 對話框自己存檔所致之推播不提示: 存檔成功後成功訊息框顯示期間對話框仍開著、isModified 仍為真, 自己之寫入使 users／grups 表被推播更新, 不得被判成「他人更新」而在既有標準圖(e2e-rela-user-grup E2E-005／010 等)多出提示列;
//       以 ownSaving 旗標(存檔送出前設真、失敗時歸零、show() 歸零)於 watcher 略過.
//  [D10] 清單頁自己存檔進行中(伺服端已寫入、回應尚未抵達)所致之推播不是他人更新(run12): planDraftSync 回 'keepQuiet'(保留草稿與基準、不更新過期提示); 存檔成功即重建、失敗則依目前 store 重算提示;
//       以非響應式 saveMark.saving 傳入(changeParams 不依賴它), 存檔 API 呼叫前設真、then／catch／finally 歸零.
//  [D6] 提示 UI: 四頁橫幅 data-fmid="<表>-banner-stale"(附「重新載入」鈕 <表>-banner-stale-reload, @click=reloadDraft); 兩對話框 data-fmid="grup-blng-users-banner-stale"／"pemi-blng-grups-banner-stale";
//       無提示時不渲染任何節點(v-for 渲染, 不用 v-if); 語系鍵 staleDraftNotice／staleDraftReload／staleDraftNoticeDialog 有 eng 與 cht.
//
//輸入空間表(軸 × 格; 已測／刻意不測):
//  DS-1 refsChanged 5 格(prev null／同參照／不同參照／長度不同／非陣列)
//  DS-2 planDraftSync 32 格(first × editChanged × storeChanged × hasDraft × saving 全組合, 預言獨立於實作寫成決策表)＋ hasDraft 惰性求值 3 格 ＋ 舊呼叫方式(未給 saving)3 格 ＋ saving 惰性求值 3 格 = 41
//  DS-3 isDraftStale 表 4 × 7 情境 = 28 格
//  DS-4 站點接線: 四清單頁 × 10 項(含 run12 之 DS-4o) = 40 ＋ 三頁(有名稱檢查者)× DS-4m 1 項 = 3 ＋ 兩對話框 × 3 項(DS-4i／4j／4n) = 6 ＋ 語系鍵 1
//  DS-5 對話框 watcher 動態行為(從 .vue 原始碼取出 watcher 函數本體執行, 非靜態字面斷言; 外審 sol 第 7 點): 兩對話框 × {他人改一列內容, 他人刪一列, 他人新增一列, 整表清空, 內容未變之外部重寫, 純 order 重排} 6 ＋ 守門 {未開框, 唯讀, 無未存編輯, 自己存檔中, 基準非陣列} 5 = 22
//  刻意不測: Vue 響應式與 DOM(留 e2e)
//跑法: npx mocha test/unit-draftSync.test.mjs --timeout 60000
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import procLang from '../server/procLang.mjs'
import { refsChanged, planDraftSync, isDraftStale, hasDraftNow, planDialogSync, checkSubject } from '../src/js/draftSync.mjs'
import { makeBaseline } from '../src/js/rowDigest.mjs'
import { TABLES, mkRow, rowWith } from './tools/unitExt.mjs'


const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const cells = { DS1: 0, DS2: 0, DS3: 0, DS4: 0, DS5: 0, DS6: 0, DS7: 0 }
const readSrc = (rel) => fs.readFileSync(path.join(projRoot, rel), 'utf8').replace(/\r\n/g, '\n')


describe('unit-draftSync (清單頁草稿對推播之處置, R-PRINCIPLE-00 原則 7)', function() {

    describe('refsChanged(DS-1)', function() {

        it('DS-1 prev 為 null(尚未建立過)→ 已更新; 同參照 → 未更新; 任一參照不同 → 已更新; 長度不同 → 已更新; 非陣列 → 已更新', function() {
            let a = [1]
            let b = [2]
            cells.DS1 += 5
            assert.strict.equal(refsChanged(null, [a]), true)
            assert.strict.equal(refsChanged([a, b], [a, b]), false, '[D4] 同參照 = store 未變')
            assert.strict.equal(refsChanged([a, b], [a, [2]]), true, '[D1] 內容相同但參照不同 = 推播以新陣列取代')
            assert.strict.equal(refsChanged([a], [a, b]), true)
            assert.strict.equal(refsChanged('x', [a]), true)
        })

    })

    describe('planDraftSync(DS-2)', function() {

        //決策表(獨立於實作): first → rebuild; editChanged → rebuild; !storeChanged → rebuild(其他反應式依賴觸發, 同修改前); storeChanged && !hasDraft → rebuild;
        //storeChanged && hasDraft → keep(自己之存檔請求進行中者 → keepQuiet: 保留草稿但不據以提示, D10)
        let oracle = (first, editChanged, storeChanged, hasDraft, saving) => {
            if (first) {
                return 'rebuild'
            }
            if (editChanged) {
                return 'rebuild'
            }
            if (!storeChanged) {
                return 'rebuild'
            }
            if (!hasDraft) {
                return 'rebuild'
            }
            return saving ? 'keepQuiet' : 'keep'
        }
        for (let first of [false, true]) {
            for (let editChanged of [false, true]) {
                for (let storeChanged of [false, true]) {
                    for (let hasDraft of [false, true]) {
                        for (let saving of [false, true]) {
                            it(`DS-2 first=${first} editChanged=${editChanged} storeChanged=${storeChanged} hasDraft=${hasDraft} saving=${saving} → ${oracle(first, editChanged, storeChanged, hasDraft, saving)}  [D10]`, function() {
                                cells.DS2++
                                assert.strict.equal(planDraftSync({ first, editChanged, storeChanged, hasDraft: () => hasDraft, saving: () => saving }), oracle(first, editChanged, storeChanged, hasDraft, saving))
                            })
                        }
                    }
                }
            }
        }

        it('DS-2c 未給 saving(舊呼叫方式)視為否: 有未存編輯而 store 變新 → keep; saving 非布林真值(1、字串)不算進行中  [D10]', function() {
            cells.DS2 += 3
            assert.strict.equal(planDraftSync({ first: false, editChanged: false, storeChanged: true, hasDraft: () => true }), 'keep')
            assert.strict.equal(planDraftSync({ first: false, editChanged: false, storeChanged: true, hasDraft: () => true, saving: () => 1 }), 'keep')
            assert.strict.equal(planDraftSync({ first: false, editChanged: false, storeChanged: true, hasDraft: () => true, saving: 'yes' }), 'keep')
        })

        it('DS-2d saving 惰性求值: 只在「非首次、編輯模式未變、store 變新、有未存編輯」才呼叫  [D10]', function() {
            cells.DS2 += 3
            let calls = 0
            let saving = () => {
                calls++
                return true
            }
            planDraftSync({ first: true, editChanged: false, storeChanged: true, hasDraft: () => true, saving })
            planDraftSync({ first: false, editChanged: true, storeChanged: true, hasDraft: () => true, saving })
            planDraftSync({ first: false, editChanged: false, storeChanged: false, hasDraft: () => true, saving })
            planDraftSync({ first: false, editChanged: false, storeChanged: true, hasDraft: () => false, saving })
            assert.strict.equal(calls, 0)
            assert.strict.equal(planDraftSync({ first: false, editChanged: false, storeChanged: true, hasDraft: () => true, saving }), 'keepQuiet')
            assert.strict.equal(calls, 1)
            assert.strict.equal(planDraftSync({ first: false, editChanged: false, storeChanged: true, hasDraft: () => true, saving: () => false }), 'keep')
        })

        it('DS-2b hasDraft 惰性求值: 只在「非首次、編輯模式未變、store 變新」時才呼叫', function() {
            let calls = 0
            let hasDraft = () => {
                calls++
                return true
            }
            cells.DS2 += 3
            planDraftSync({ first: true, editChanged: false, storeChanged: true, hasDraft })
            planDraftSync({ first: false, editChanged: true, storeChanged: true, hasDraft })
            assert.strict.equal(planDraftSync({ first: false, editChanged: false, storeChanged: false, hasDraft }), 'rebuild')
            assert.strict.equal(calls, 0)
            assert.strict.equal(planDraftSync({ first: false, editChanged: false, storeChanged: true, hasDraft }), 'keep')
            assert.strict.equal(calls, 1)
        })

    })

    describe('isDraftStale(DS-3)', function() {

        for (let t of TABLES) {
            let rows0 = [mkRow(t, { id: 'r1', order: 1, description: '' }), mkRow(t, { id: 'r2', order: 2, description: '' }), mkRow(t, { id: 'r3', order: 3, description: '' })]
            let bl = makeBaseline(rows0, t)
            let st = (rows) => isDraftStale({ keyTable: t, rows, baseline: bl })
            //perm-run01: 基準改用共用核心(h1, 寫入契約): 名次入基準——他人重排被偵測(舊版〔排除 order〕不偵測); 系統重編號而名次不變、空值不同表示(null／'')、僅伺服器專有欄不同皆不算過期
            let CASES = [
                ['整表一致', rows0, false],
                ['他人改了一列內容', [rows0[0], rowWith(rows0[1], { description: 'by-other' }), rows0[2]], true],
                ['他人刪了一列', [rows0[0], rows0[2]], true],
                ['他人新增一列', [...rows0, mkRow(t, { id: 'rN', order: 4 })], true],
                ['外部同步整批重寫但內容未變(order 重編號而名次不變／四個伺服器管理欄皆變)', rows0.map((r, k) => rowWith(r, { order: 50 + k, userId: 'sync', timeCreate: 'T2', userIdUpdate: 'sync', timeUpdate: 'T2' })), false],
                ['他人純列序重排(內容未變、名次改變; perm-run01 起視為過期, 修已知缺口 (e))', [...rows0].reverse().map((r, k) => rowWith(r, { order: k + 1 })), true],
                ['系統重編號(order 值全變而名次不變)', rows0.map((r, k) => rowWith(r, { order: (k + 1) * 10 })), false],
                ['空值不同表示(description null／缺欄／空字串; 修已知缺口 (d))', [rows0[0], rowWith(rows0[1], { description: null }), rowWith(rows0[2], { description: undefined })], false],
                ['整表清空', [], true],
            ]
            for (let [title, rows, exp] of CASES) {
                it(`DS-3 ${t}: ${title} → ${exp ? '過期(顯示提示)' : '不過期(不提示)'}  [D1]`, function() {
                    cells.DS3++
                    assert.strict.equal(st(rows), exp)
                })
            }
        }

    })

    describe('站點接線(DS-4, 靜態)', function() {

        const PAGES = [
            { fn: 'LayoutContentTargets', t: 'targets', refs: '[rows]', rebuild: 'vo.rebuildDraft(rows, isEditable)', reload: 'vo.rebuildDraft(vo.targets, vo.isEditable)' },
            { fn: 'LayoutContentPemis', t: 'pemis', refs: '[rows, kpUse]', rebuild: 'vo.rebuildDraft(rows, kpUse, isEditable)', reload: 'vo.rebuildDraft(vo.pemis, vo.kpUsePemiGrup, vo.isEditable)' },
            { fn: 'LayoutContentGrups', t: 'grups', refs: '[rows, kpUse]', rebuild: 'vo.rebuildDraft(rows, kpUse, isEditable)', reload: 'vo.rebuildDraft(vo.grups, vo.kpUseGrupUser, vo.isEditable)' },
            { fn: 'LayoutContentUsers', t: 'users', refs: '[rows]', rebuild: 'vo.rebuildDraft(rows, isEditable)', reload: 'vo.rebuildDraft(vo.users, vo.isEditable)' },
        ]
        let methodBody = (src, name) => {
            let i0 = src.search(new RegExp(`^        ${name}: (async )?function`, 'm'))
            assert.strict.ok(i0 >= 0, `找不到 ${name}`)
            let rest = src.slice(i0 + 10)
            let m = rest.search(/^        [A-Za-z_$][\w$]*: (async )?function/m)
            return rest.slice(0, m < 0 ? rest.length : m)
        }

        for (let p of PAGES) {
            let src = readSrc(`src/components/${p.fn}.vue`)

            it(`DS-4a ${p.fn}: import draftSync; data 宣告 baseRows／staleNotice; created 建立 syncMark  [D5]`, function() {
                cells.DS4++
                assert.strict.ok(src.includes(`import { refsChanged, planDraftSync, isDraftStale, hasDraftNow } from '../js/draftSync.mjs'`), 'perm-run01: 增 hasDraftNow(儲存格編輯器開啟中視為有草稿)')
                assert.strict.ok(src.includes(`import { applySavedRows } from '../js/applySaved.mjs'`) && src.includes(`import { isCellEditing, bindCellEditingStopRetry } from '../js/cellEditing.mjs'`))
                assert.strict.ok(/\n {12}baseRows: \[\],/.test(src) && /\n {12}staleNotice: false,/.test(src) && /\n {12}syncTick: 0,/.test(src))
                assert.strict.ok(/created: function\(\) \{[\s\S]*?this\.syncMark = \{ refs: null, editable: undefined, dirty: false, baseline: \[\], tick: 0 \}/.test(src))
            })

            it(`DS-4b ${p.fn}: changeParams 以 planDraftSync 決定 rebuild／keep; hasDraft 取非響應式鏡像 vo.syncMark.dirty(惰性; changeParams 不依賴 isModified); rebuild 才呼叫 rebuildDraft; keep 只更新 staleNotice(不重建 items／opt／基準)  [D1][D2][D4]`, function() {
                cells.DS4++
                let b = methodBody(src, 'changeParams')
                assert.strict.ok(b.includes('planDraftSync({'))
                assert.strict.ok(b.includes('first: vo.syncMark.refs === null || vo.syncMark.tick !== vo.syncTick,'), '[D7] 首次或重新載入(syncTick 遞增)皆視為 first')
                assert.strict.ok(b.includes('editChanged: vo.syncMark.editable !== isEditable,'))
                assert.strict.ok(b.includes(`storeChanged: refsChanged(vo.syncMark.refs, ${p.refs}),`))
                //perm-run01(第 115 項): 原 `hasDraft: () => vo.syncMark.dirty === true` 改為「未存修改鏡像, 或儲存格編輯器開啟中」(以 ag-grid getEditingCells 判定, 惰性求值)
                assert.strict.ok(b.includes(`hasDraft: () => hasDraftNow({ dirty: vo.syncMark.dirty === true, editing: isCellEditing(get(vo, '$refs.rftable', null)) }),`))
                assert.strict.ok(!/vo\.isModified/.test(b) && !/vo\.baseline\b/.test(b), 'changeParams 不得讀 vo.isModified／vo.baseline(否則成為響應式依賴)')
                assert.strict.ok(b.includes(`if (act === 'rebuild') {`) && b.includes(p.rebuild))
                let k = b.slice(b.indexOf(`else if (act === 'keep') {`))
                assert.strict.ok(k.includes(`vo.staleNotice = isDraftStale({ keyTable: '${p.t}', rows, baseline: vo.syncMark.baseline })`))
                let keepBody = k.slice(0, k.indexOf('return'))
                for (let bad of ['rebuildDraft', 'genOpt', 'vo.items', 'vo.baseline =', 'vo.opt', 'isModified']) {
                    assert.strict.ok(!keepBody.includes(bad), `keep 分支不得含 ${bad}`)
                }
            })

            it(`DS-4c ${p.fn}: rebuildDraft 放棄未存編輯旗標與過期提示、記 baseRows 與 syncMark、基準與 items 同處由同一份列計算、genOpt 後 firstLoading=false  [D5]`, function() {
                cells.DS4++
                let b = methodBody(src, 'rebuildDraft')
                assert.strict.ok(b.includes(`makeBaseline(`) && b.includes(`, '${p.t}')`), 'perm-run01: 基準依寫入契約(第 2 參為表名)')
                assert.strict.ok(b.includes('vo.baseRows = rows'))
                assert.strict.ok(b.includes('vo.isModified = false'))
                assert.strict.ok(b.includes('vo.staleNotice = false'))
                assert.strict.ok(/vo\.syncMark = \{ refs: \[rows(, kpUse)?\], editable: isEditable, dirty: false, baseline, tick: vo\.syncTick \}/.test(b), '[D7] 記下本次所依據之 syncTick')
                let iGen = b.indexOf('vo.genOpt({ isEditable })')
                let iFirst = b.indexOf('vo.firstLoading = false')
                assert.strict.ok(iGen > 0 && iFirst > iGen)
                assert.strict.equal(b.split('makeBaseline(').length - 1, 1, '只在此處計算基準')
            })

            it(`DS-4d ${p.fn}: reloadDraft 只遞增 syncTick(由 changeParams 重算並於 computed 內重建, 使 genOpt 之反應式依賴重新收集), 不在 computed 外直接 rebuildDraft  [D6][D7]`, function() {
                cells.DS4++
                let b = methodBody(src, 'reloadDraft')
                let code = b.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
                assert.strict.ok(code.includes('vo.syncTick++'))
                assert.strict.ok(!code.includes('rebuildDraft') && !code.includes(p.reload), 'reloadDraft 不得直接重建(computed 外重建不會恢復已收縮之依賴)')
            })

            it(`DS-4e ${p.fn}: 橫幅以 v-for 渲染(不用 v-if), data-fmid=${p.t}-banner-stale, 套 getBannerStyle('warn'), 附重新載入鈕 ${p.t}-banner-stale-reload @click=reloadDraft  [D6]`, function() {
                cells.DS4++
                assert.strict.ok(src.includes(`v-for="ks in (staleNotice ? 1 : 0)"`))
                assert.strict.ok(src.includes(`data-fmid="${p.t}-banner-stale"`))
                let i = src.indexOf(`data-fmid="${p.t}-banner-stale"`)
                let seg = src.slice(i, i + 700)
                assert.strict.ok(seg.includes(`:style="getBannerStyle('warn')"`))
                assert.strict.ok(seg.includes(`{{ $t('staleDraftNotice') }}`))
                assert.strict.ok(seg.includes(`data-fmid="${p.t}-banner-stale-reload" @click="reloadDraft"`))
                assert.strict.ok(seg.includes(`{{ $t('staleDraftReload') }}`))
                assert.strict.ok(!/v-if="staleNotice"/.test(src), '不得以 v-if 渲染(會留下註解節點)')
            })

            it(`DS-4f ${p.fn}: 存檔前之預覽與外部列守門以 baseRows(草稿所依據之版本)為舊, 不用 vo.${p.t}(有未存編輯時可能已被推播更新)  [D5]`, function() {
                cells.DS4++
                let code = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
                assert.strict.ok(code.includes(`getExternalEdits({ keyTable: '${p.t}', keys: vo.$ds.${p.t}.keys, rowsNew: rows, rowsOld: vo.baseRows })`))
                assert.strict.ok(!new RegExp(`rowsOld: vo\\.${p.t}\\b`).test(code), `不得再有 rowsOld: vo.${p.t}`)
                assert.strict.ok(code.includes('rowsOld: vo.baseRows'))
            })

            it(`DS-4g ${p.fn}: 存檔仍隨 RPC 送草稿載入時之基準(cloneDeep(vo.baseline)), 不因保留草稿而改送最新基準  [D1]`, function() {
                cells.DS4++
                assert.strict.ok(/let baseline = cloneDeep\(vo\.baseline\)/.test(src))
                assert.strict.ok(new RegExp(`\\$fapi\\.update${p.t[0].toUpperCase()}${p.t.slice(1)}\\([^)]*\\{ baseline, returnRows: true \\}\\)`).test(src), 'perm-run01: 存檔帶 returnRows:true 取回寫入後之列')
            })

            it(`DS-4l ${p.fn}: watch isModified 維護 syncMark.dirty 鏡像; 旗標歸零而 store 於保留草稿期間已變新者立即 reloadDraft(儲存成功之推播先於回應抵達之競爭); curRefs 與 changeParams 之 refs 同一組  [D4]`, function() {
                cells.DS4++
                let m = /watch: \{[\s\S]*?isModified: function\(b\) \{([\s\S]*?)\n {8}\},\n {4}\},/.exec(src)
                assert.strict.ok(m, '應有 watch.isModified')
                assert.strict.ok(m[1].includes('vo.syncMark.dirty = b === true'))
                assert.strict.ok(m[1].includes('b !== true && vo.syncMark.refs !== null && refsChanged(vo.syncMark.refs, vo.curRefs())'))
                assert.strict.ok(m[1].includes('vo.reloadDraft()'))
                let c = methodBody(src, 'curRefs')
                let want = p.t === 'grups' ? '[vo.grups, vo.kpUseGrupUser]' : (p.t === 'pemis' ? '[vo.pemis, vo.kpUsePemiGrup]' : `[vo.${p.t}]`)
                assert.strict.ok(c.includes(`return ${want}`), 'curRefs 須回傳 ${want}')
            })

            it(`DS-4o ${p.fn}: 自己存檔進行中所致之推播不顯示過期橫幅——created 建 saveMark; changeParams 以 saving 惰性函數傳入 planDraftSync; 存檔 API 呼叫前設真, 回應(then／catch)與 finally 歸零, 失敗時依目前 store 重算 staleNotice  [D10]`, function() {
                cells.DS4++
                assert.strict.ok(/this\.saveMark = \{ saving: false \}/.test(src), 'created 建立非響應式 saveMark')
                let b = methodBody(src, 'changeParams')
                assert.strict.ok(b.includes('saving: () => vo.saveMark.saving === true,'))
                assert.strict.ok(!/vo\.saveMark\.saving(?! === true,)/.test(b), 'changeParams 只經 saving 惰性函數讀 saveMark')
                let sv = methodBody(src, `doSave${p.t[0].toUpperCase()}${p.t.slice(1)}`)
                let api = `vo.$fapi.update${p.t[0].toUpperCase()}${p.t.slice(1)}(`
                let iSet = sv.indexOf('vo.saveMark.saving = true')
                let iApi = sv.indexOf(api)
                let iThen = sv.indexOf('.then((res) => {', iApi)
                let iThenReset = sv.indexOf('vo.saveMark.saving = false', iThen)
                let iCatch = sv.indexOf('.catch(async (err) => {', iApi)
                let iCatchReset = sv.indexOf('vo.saveMark.saving = false', iCatch)
                let iRecalc = sv.indexOf(`vo.staleNotice = isDraftStale({ keyTable: '${p.t}', rows: vo.${p.t}, baseline: vo.syncMark.baseline })`, iCatch)
                let iFinally = sv.indexOf('.finally(() => {')
                let iFinallyReset = sv.indexOf('vo.saveMark.saving = false', iFinally)
                assert.strict.ok(iSet > 0 && iApi > iSet, 'saving 須於 API 呼叫之前設真')
                assert.strict.ok(iThen > iApi && iThenReset > iThen && iThenReset < iCatch, '成功(then)須歸零')
                assert.strict.ok(iCatch > iApi && iCatchReset > iCatch && iRecalc > iCatchReset, '失敗(catch)須歸零並依目前 store 重算過期提示')
                assert.strict.ok(iFinally > iCatch && iFinallyReset > iFinally, 'finally 須歸零(非預期例外)')
                assert.strict.equal(sv.split('vo.saveMark.saving = true').length - 1, 1, '只在存檔 API 前設真一處')
            })

            it(`DS-4h ${p.fn}: 重新載入鈕之樣式沿用既有色票(#fff 底、hover #f2f2f2、邊線 #ddd、文字 #444)  [D6]`, function() {
                cells.DS4++
                let m = /<style scoped>([\s\S]*?)<\/style>/.exec(src)
                assert.strict.ok(m)
                assert.strict.ok(m[1].includes('.staleReloadBtn {') && m[1].includes('background: #fff;') && m[1].includes('border: 1px solid #ddd;') && m[1].includes('color: #444;'))
                assert.strict.ok(m[1].includes('.staleReloadBtn:hover') && m[1].includes('background: #f2f2f2;'))
            })
        }

        for (let p of PAGES.filter((q) => q.t !== 'targets')) {
            let src = readSrc(`src/components/${p.fn}.vue`)
            it(`DS-4m ${p.fn}: 名稱(／email)唯一檢查以 vo.baseRows(草稿所依據之列)為「舊」, 不用 vo.${p.t}(保留草稿期間 store 可能已被他人改名)  [D8]`, function() {
                cells.DS4++
                let code = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
                let calls = code.match(/getNameErrs\([^\n]*\)/g) || []
                assert.strict.ok(calls.length >= 1)
                for (let c of calls) {
                    assert.strict.ok(c.includes("get(vo, 'opt.rows', []), vo.baseRows,"), `getNameErrs 之舊值須為 vo.baseRows: ${c}`)
                    assert.strict.ok(!new RegExp(`vo\\.${p.t}\\b`).test(c), `不得以 vo.${p.t} 為舊值: ${c}`)
                }
            })
        }

        const DLGS = [
            { fn: 'VeGrupBlngUsers', t: 'users', sub: 'grups', subVar: 'grup', fmid: 'grup-blng-users-banner-stale', langSubj: 'relSubjectChangedGrup' },
            { fn: 'VePemiBlngGrups', t: 'grups', sub: 'pemis', subVar: 'pemi', fmid: 'pemi-blng-grups-banner-stale', langSubj: 'relSubjectChangedPemi' },
        ]
        for (let d of DLGS) {
            let src = readSrc(`src/components/${d.fn}.vue`)

            it(`DS-4i ${d.fn}: watch ${d.t}／${d.sub}(store 推播)一律交 syncStore(); syncStore 以 planDialogSync 決定重建／保留／提示(無未存修改且表已異於基準 → rebuildDialog; 有未存修改或編輯器開啟 → 保留並提示; 自己存檔中 → 靜默); show() 歸零 staleNotice／subjectNotice; 基準只在 show() 與 rebuildDialog 計算  [D1][D6][perm-run01 (b)(c)]`, function() {
                cells.DS4++
                assert.strict.ok(src.includes(`import { isDraftStale, planDialogSync, checkSubject } from '../js/draftSync.mjs'`))
                let m = new RegExp(`watch: \\{[\\s\\S]*?\\n {8}${d.t}: function\\(\\) \\{\\n {12}this\\.syncStore\\(\\)\\n {8}\\},\\n {8}${d.sub}: function\\(\\) \\{\\n {12}this\\.syncStore\\(\\)\\n {8}\\},\\n {4}\\},`).exec(src)
                assert.strict.ok(m, `應有 watch.${d.t}／watch.${d.sub} 皆呼叫 syncStore()`)
                let b = methodBody(src, 'syncStore')
                assert.strict.ok(b.includes('if (!vo.bShow || !Array.isArray(vo.baseline)) {'))
                assert.strict.ok(b.includes(`stale: isDraftStale({ keyTable: '${d.t}', rows: vo.${d.t}, baseline: vo.baseline }),`))
                assert.strict.ok(b.includes('dirty: vo.isModified === true,') && b.includes(`editing: isCellEditing(get(vo, '$refs.rftable', null)),`) && b.includes('saving: vo.ownSaving === true,'))
                assert.strict.ok(b.includes(`checkSubject({ subject: vo.subject, rows: vo.${d.sub} })`))
                assert.strict.ok(/\n {12}staleNotice: false,/.test(src) && /\n {12}subjectNotice: false,/.test(src), 'data 宣告 staleNotice／subjectNotice')
                assert.strict.ok(/vo\.isModified = false\n {12}vo\.staleNotice = false\n {12}vo\.subjectNotice = false/.test(src), 'show() 歸零 staleNotice／subjectNotice')
                let codeOnly = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
                assert.strict.equal(codeOnly.split('makeBaseline(').length - 1, 2, '基準只在 show() 與 rebuildDialog 計算')
                let rb = methodBody(src, 'rebuildDialog')
                assert.strict.ok(rb.includes(`makeBaseline(`) && rb.includes('vo.$ui.markDataReload(vo)') && rb.includes('vo.genOpt()'), 'rebuildDialog 重建基準／items／opt, 並標記程式端重載(rowsChange 不視為使用者編輯)')
                assert.strict.ok(src.includes('vo.firstLoading || vo.firstSetting || vo.systemProcing'), 'rowsChange 守門含 systemProcing')
            })

            it(`DS-4n ${d.fn}: 自己存檔所致之推播不提示——ownSaving 於 data 宣告、存檔 API 呼叫前設真、失敗(catch)歸零、show() 歸零  [D9]`, function() {
                cells.DS4++
                assert.strict.ok(/\n {12}ownSaving: false,/.test(src), 'data 宣告 ownSaving')
                let sv = methodBody(src, d.t === 'users' ? 'saveUsers' : 'saveGrups')
                let iSet = sv.indexOf('vo.ownSaving = true')
                let iApi = sv.indexOf(`vo.$fapi.update${d.t[0].toUpperCase()}${d.t.slice(1)}(`)
                let iCatch = sv.indexOf('.catch(async (err) => {')
                let iReset = sv.indexOf('vo.ownSaving = false')
                assert.strict.ok(iSet > 0 && iApi > iSet, 'ownSaving 須於 API 呼叫之前設真')
                assert.strict.ok(iCatch > iApi && iReset > iCatch, '失敗(catch)須歸零')
                assert.strict.ok(/vo\.staleNotice = false\n {12}vo\.subjectNotice = false\n {12}vo\.ownSaving = false/.test(src), 'show() 歸零 ownSaving(perm-run01: 前面增 subjectNotice 歸零)')
            })

            it(`DS-4j ${d.fn}: 提示以 v-for 渲染(不用 v-if), data-fmid=${d.fmid}, 文字為 staleDraftNoticeDialog, 沿用橫幅色票(淡橘 #FFE0B2、文字 #444、邊線 #ddd)  [D6]`, function() {
                cells.DS4++
                assert.strict.ok(src.includes(`v-for="ks in ((staleNotice || subjectNotice) ? 1 : 0)"`), 'perm-run01: 主體被刪除／改名／同名重建(subjectNotice)亦顯示同一提示')
                let i = src.indexOf(`data-fmid="${d.fmid}"`)
                assert.strict.ok(i > 0)
                let seg = src.slice(i, i + 600)
                assert.strict.ok(seg.includes('background:#FFE0B2') && seg.includes('color:#444') && seg.includes('border-top:1px solid #ddd'))
                assert.strict.ok(seg.includes(`{{ $t('staleDraftNoticeDialog') }}`))
                assert.strict.ok(!/v-if="staleNotice"/.test(src))
            })
        }

        it('DS-4k 語系鍵 staleDraftNotice／staleDraftReload／staleDraftNoticeDialog 皆有非空 eng 與 cht; saveStale 文字未改(既有標準圖含之)  [D6]', function() {
            cells.DS4++
            let L = procLang({})
            for (let k of ['staleDraftNotice', 'staleDraftReload', 'staleDraftNoticeDialog']) {
                assert.strict.ok(typeof L.eng[k] === 'string' && L.eng[k] !== '' && typeof L.cht[k] === 'string' && L.cht[k] !== '', k)
            }
            assert.strict.equal(L.eng.saveStale, 'Not saved: the data changed (by someone else or by an external synchronization) after this page was loaded. Nothing was changed. Please reload the page and try again.')
            assert.strict.equal(L.cht.saveStale, '未儲存：載入此頁面後資料已被他人或外部同步更新。資料未變更，請重新整理頁面後再操作。')
        })

    })

    describe('對話框 syncStore 動態行為(DS-5, 取原始碼之 syncStore 本體執行)', function() {

        //perm-run01: 原 watcher「有未存編輯才提示、無未存編輯照舊靜默」改為 syncStore——
        //  無未存修改(含無開啟中之儲存格編輯器)而表已異於載入基準 → 重建(rebuildDialog, 修 (b)); 有未存修改或編輯器開啟 → 保留並提示(修 (c)); 自己存檔中 → 靜默; 主體被替換 → subjectNotice 且不重建(第 114 項)
        const DLGS = [
            { fn: 'VeGrupBlngUsers', t: 'users', sub: 'grups', subLabel: '群組' },
            { fn: 'VePemiBlngGrups', t: 'grups', sub: 'pemis', subLabel: '權限' },
        ]
        let METHOD = (src, name) => {
            let i0 = src.search(new RegExp(`^        ${name}: (async )?function`, 'm'))
            let rest = src.slice(i0 + 10)
            let m = rest.search(/^        [A-Za-z_$][\w$]*: (async )?function/m)
            return rest.slice(0, m < 0 ? rest.length : m)
        }
        for (let d of DLGS) {
            let src = readSrc(`src/components/${d.fn}.vue`)
            let body = METHOD(src, 'syncStore')
            let get = (o, p, df) => {
                let v = o
                for (let k of p.split('.')) {
                    v = (v !== null && v !== undefined) ? v[k] : undefined
                }
                return v === undefined ? df : v
            }
            let editingNow = false
            let syncStore = new Function('get', 'isDraftStale', 'planDialogSync', 'checkSubject', 'isCellEditing', `return function() {${body.slice(body.indexOf('{') + 1, body.lastIndexOf('}'))}\n}`)(get, isDraftStale, planDialogSync, checkSubject, () => editingNow)
            let rows0 = [mkRow(d.t, { id: 'r1', order: 1, description: '' }), mkRow(d.t, { id: 'r2', order: 2, description: '' }), mkRow(d.t, { id: 'r3', order: 3, description: '' })]
            let subRows = [mkRow(d.sub, { id: 's1', name: 'S1', order: 1 })]
            let mk = (o = {}) => {
                let vo = { bShow: true, isEditable: true, isModified: false, ownSaving: false, baseline: makeBaseline(rows0, d.t), staleNotice: false, subjectNotice: false, subject: { id: 's1', name: 'S1', saved: true }, rebuilt: 0, [d.t]: rows0, [d.sub]: subRows, $refs: {}, ...o }
                vo.rebuildDialog = () => {
                    vo.rebuilt++
                }
                return vo
            }
            let other = [rows0[0], rowWith(rows0[1], { description: 'by-other' }), rows0[2]]
            it(`DS-5 ${d.fn}: 取得 syncStore 本體`, function() {
                assert.strict.ok(body.includes('planDialogSync('), '找不到 syncStore')
            })
            let CASES = [
                //[標題, vo 覆寫, 編輯器開啟, 推播後之 ${d.t} 表, 預期 { rebuilt, staleNotice, subjectNotice }]
                ['無未存修改、表已異於基準(他人改一列) → 重建, 不提示', {}, false, other, { rebuilt: 1, staleNotice: false, subjectNotice: false }],
                ['無未存修改、他人刪一列 → 重建', {}, false, [rows0[0], rows0[2]], { rebuilt: 1, staleNotice: false, subjectNotice: false }],
                ['無未存修改、他人新增一列 → 重建', {}, false, [...rows0, mkRow(d.t, { id: 'rN', order: 4 })], { rebuilt: 1, staleNotice: false, subjectNotice: false }],
                ['無未存修改、整表清空 → 重建(空表分支不得略過)', {}, false, [], { rebuilt: 1, staleNotice: false, subjectNotice: false }],
                ['無未存修改、他人只重排(名次改變) → 重建(perm-run01: 名次入基準)', {}, false, [...rows0].reverse().map((r, k) => rowWith(r, { order: k + 1 })), { rebuilt: 1, staleNotice: false, subjectNotice: false }],
                ['無未存修改、表未異於基準(外部同步整批重寫而內容未變) → 不重建', {}, false, rows0.map((r, k) => rowWith(r, { order: 50 + k, userId: 'sync', timeUpdate: 'T2' })), { rebuilt: 0, staleNotice: false, subjectNotice: false }],
                ['有未存修改、表已異於基準 → 保留並提示, 不重建', { isModified: true }, false, other, { rebuilt: 0, staleNotice: true, subjectNotice: false }],
                ['有未存修改、表未異於基準 → 不重建不提示', { isModified: true }, false, rows0, { rebuilt: 0, staleNotice: false, subjectNotice: false }],
                ['儲存格編輯器開啟中(未提交)、表已異於基準 → 視為有草稿: 保留並提示, 不重建(第 115 項)', {}, true, other, { rebuilt: 0, staleNotice: true, subjectNotice: false }],
                ['自己存檔中、表已異於基準 → 靜默(不是他人更新), 不重建', { ownSaving: true }, false, other, { rebuilt: 0, staleNotice: false, subjectNotice: false }],
                ['自己存檔中且有未存修改 → 靜默', { ownSaving: true, isModified: true }, false, other, { rebuilt: 0, staleNotice: false, subjectNotice: false }],
                ['未開框 → 不處置', { bShow: false }, false, other, { rebuilt: 0, staleNotice: false, subjectNotice: false }],
                ['基準非陣列 → 不處置', { baseline: null }, false, other, { rebuilt: 0, staleNotice: false, subjectNotice: false }],
                [`唯讀檢視(無存檔)、表已異於基準 → 重建(無草稿可言)`, { isEditable: false }, false, other, { rebuilt: 1, staleNotice: false, subjectNotice: false }],
            ]
            for (let [title, o, editing, rows, exp] of CASES) {
                it(`DS-5 ${d.fn}: ${title}  [D1][perm-run01 (b)(c)]`, function() {
                    cells.DS5++
                    editingNow = editing
                    let vo = mk({ ...o, [d.t]: rows })
                    syncStore.call(vo)
                    assert.strict.deepEqual({ rebuilt: vo.rebuilt, staleNotice: vo.staleNotice, subjectNotice: vo.subjectNotice }, exp)
                })
            }
            //第 114 項: 主體(${d.subLabel})被刪除、改名、刪除後以同名重建 → subjectNotice, 且不重建(無從續編)
            let SUBJ = [
                [`${d.subLabel}被刪除`, [], 'gone'],
                [`${d.subLabel}被改名`, [mkRow(d.sub, { id: 's1', name: 'S1-renamed', order: 1 })], 'renamed'],
                [`${d.subLabel}被刪除後以同名重建(id 不同)`, [mkRow(d.sub, { id: 's2', name: 'S1', order: 1 })], 'gone'],
                [`${d.subLabel}原封不動(其他欄位改了)`, [mkRow(d.sub, { id: 's1', name: 'S1', order: 1, description: 'changed' })], 'ok'],
            ]
            for (let [title, subRowsNow, kind] of SUBJ) {
                it(`DS-5s ${d.fn}: ${title} → 主體比對 ${kind}; 表已異於基準時${kind === 'ok' ? '重建' : '不重建、顯示提示'}  [第 114 項]`, function() {
                    cells.DS5++
                    editingNow = false
                    let vo = mk({ [d.t]: other, [d.sub]: subRowsNow })
                    syncStore.call(vo)
                    assert.strict.equal(vo.subjectNotice, kind !== 'ok')
                    assert.strict.equal(vo.rebuilt, kind === 'ok' ? 1 : 0)
                })
            }
        }

    })

    describe('hasDraftNow／planDialogSync／checkSubject 純函數(DS-6／DS-7)', function() {

        it('DS-6a hasDraftNow: dirty 或 editing 任一為真(嚴格 true)才算有草稿  [perm-run01 (c)]', function() {
            cells.DS6 += 6
            assert.strict.equal(hasDraftNow({ dirty: false, editing: false }), false)
            assert.strict.equal(hasDraftNow({ dirty: true, editing: false }), true)
            assert.strict.equal(hasDraftNow({ dirty: false, editing: true }), true)
            assert.strict.equal(hasDraftNow({ dirty: true, editing: true }), true)
            assert.strict.equal(hasDraftNow({ dirty: 1, editing: 'yes' }), false, '非布林真值不算')
            assert.strict.equal(hasDraftNow({}), false)
        })

        //決策表(獨立於實作): 未顯示或 store 未變 → none; 自己存檔中 → keepQuiet; 表未異於基準 → none; 否則有草稿(dirty 或 editing) → keep, 無 → rebuild
        let oracle = (show, storeChanged, stale, dirty, editing, saving) => {
            if (!show || !storeChanged) {
                return 'none'
            }
            if (saving) {
                return 'keepQuiet'
            }
            if (!stale) {
                return 'none'
            }
            return (dirty || editing) ? 'keep' : 'rebuild'
        }
        for (let show of [false, true]) {
            for (let storeChanged of [false, true]) {
                for (let stale of [false, true]) {
                    for (let dirty of [false, true]) {
                        for (let editing of [false, true]) {
                            for (let saving of [false, true]) {
                                it(`DS-6 planDialogSync show=${show} storeChanged=${storeChanged} stale=${stale} dirty=${dirty} editing=${editing} saving=${saving} → ${oracle(show, storeChanged, stale, dirty, editing, saving)}  [perm-run01 (b)(c)]`, function() {
                                    cells.DS6++
                                    assert.strict.equal(planDialogSync({ show, storeChanged, stale, dirty, editing, saving }), oracle(show, storeChanged, stale, dirty, editing, saving))
                                })
                            }
                        }
                    }
                }
            }
        }

        let S = (o = {}) => ({ id: 's1', name: 'S1', saved: true, ...o })
        const SUBJ_CASES = [
            ['原封不動', S(), [{ id: 's1', name: 'S1' }], 'ok'],
            ['同 id 其他欄位改了', S(), [{ id: 's1', name: 'S1', description: 'x' }], 'ok'],
            ['已儲存之主體被刪除', S(), [{ id: 's9', name: 'Z' }], 'gone'],
            ['已儲存之主體被刪除後以同名重建(id 不同)', S(), [{ id: 's2', name: 'S1' }], 'gone'],
            ['同 id 被改名', S(), [{ id: 's1', name: 'S1b' }], 'renamed'],
            ['表清空', S(), [], 'gone'],
            ['主體表非陣列', S(), null, 'gone'],
            ['開框時未儲存之主體(store 無此 id), 現仍無同名實體 → 沿用既有行為', S({ saved: false }), [{ id: 's9', name: 'Z' }], 'ok'],
            ['開框時未儲存之主體, 現出現同名而 id 不同之另一實體 → 引用會被接管而拒收', S({ saved: false }), [{ id: 's2', name: 'S1' }], 'taken'],
            ['開框時未儲存之主體, 其後被儲存(同 id 同名出現)', S({ saved: false }), [{ id: 's1', name: 'S1' }], 'ok'],
            ['摘要缺 id', { name: 'S1', saved: true }, [{ id: 's1', name: 'S1' }], 'noSubject'],
            ['摘要 id 為空字串', S({ id: '' }), [{ id: '', name: 'S1' }], 'noSubject'],
            ['摘要缺名稱', { id: 's1', saved: true }, [{ id: 's1', name: 'S1' }], 'noSubject'],
            ['摘要為 null', null, [{ id: 's1', name: 'S1' }], 'noSubject'],
            ['摘要為字串', 's1', [{ id: 's1', name: 'S1' }], 'noSubject'],
        ]
        for (let [title, subject, rows, exp] of SUBJ_CASES) {
            it(`DS-7 checkSubject: ${title} → ${exp}  [第 114 項]`, function() {
                cells.DS7++
                assert.strict.equal(checkSubject({ subject, rows }), exp)
            })
        }

    })

    describe('DS-CELLS 格數核對', function() {

        it('DS-999 各矩陣實測格數 = 宣告', function() {
            if (process.argv.some((a) => a === '--grep' || a === '-g' || a.startsWith('--grep='))) {
                this.skip()
            }
            assert.strict.deepEqual(cells, { DS1: 5, DS2: 32 + 3 + 3 + 3, DS3: 4 * 9, DS4: 4 * 10 + 3 + 2 * 3 + 1, DS5: 2 * (14 + 4), DS6: 6 + 64, DS7: 15 })
        })

    })

})
