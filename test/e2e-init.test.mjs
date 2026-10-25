//
// E2E Init test — 初始畫面語系（server 注入, 非 UI 切換）。對應 spec/流程_應用啟動與登入.md。
//
// 驗證: settings.json 指定 language 後, 後端 serve 的 dist 連線中初始畫面即呈現該語系
// (window.___pmwperm___.language 由 WWebPerm 啟動時把 dist index.tmp 模板的 {language} 佔位符注入, WWebPerm.mjs:738).
//
// 與 e2e-startup 的差異（關鍵）: 連線前狀態畫面（csIng）的文字走 mUI fallback → getLang() → ___pmwperm___.language,
//   不吃 UI setLang（store.lang）。故其語系由「server 注入」決定, 須打後端 dist 才測得到, 非 UI 可切。
//
// 三個必守陷阱（對齊 SSO e2e-initlang）:
//   1. 打後端 dist（apiBaseUrl 11006）, 不是 dev server（8090 不做注入 → 永遠 eng）。
//   2. 必須有 dist/index.tmp 不可變模板（{language} 被取代後即消失）; 它受版控、由業主發布管線產生（script.txt:
//      npm run build → node toolg/genEntry.mjs）, 本檔 setup **只驗證其佔位符齊全, 絕不改寫**——測試不得寫入受版控之建置產物。
//   3. URL 不可帶 ?lang=（URL 語系優先序最高會蓋掉 server 注入值）。
//
// 使用方式:
//   1. 先依 script.txt 執行 npm run build 與 node toolg/genEntry.mjs 產 dist/index.tmp（或 git checkout -- dist/index.tmp）。
//   2. 產標準圖: node test/e2e-init.test.mjs --baseline [--names <項,...>] [--langs eng,cht] [--write-mode missing|changed]
//   3. 跑測試:   npx mocha test/e2e-init.test.mjs --timeout 120000 --reporter list （pixelmatch 反鋸齒感知 + maxDiffPixels 容差比對，非 byte-exact）
//   手術式重產（截圖前篩選 createBaselineGate，規格見 test/tools/e2eLib.mjs 所指之 w-package-tools-e2e 之 README.md §2.2）：
//     --names 每項可帶語系前綴（eng-/cht-），不帶則兩語系皆產；本檔每案單張、案例鍵即圖鍵，案例鍵或其編號前綴（如 E2E-004）寫該案；
//     不符任何鍵即報錯並列出可用鍵（於驗證 dist/index.tmp 與重啟後端之前）；--langs 須完全等於已宣告語系（eng / cht）；
//     --write-mode missing 只寫缺少者、changed 只寫與現行標準圖差異超過容差者（預設全寫）；
//     env E2E_BASELINE_OUT_DIR=<dir> 寫到暫存目錄（等價驗證用，不動 test/pics）。
//   產製端與比對端呼叫同一案例管線（runBaselineCase）：以該語系（與案例設定）之臨時設定重啟後端 → fresh browser → 新 context（1440×900）
//     → 懸置 /api 或走真實登入 → 截圖 → 語意斷言 assertCase（兩端皆於寫檔／比對前執行，不過即一張都不寫）→ 寫檔／比對 → 關瀏覽器；
//     兩端皆於全部案例前驗證 dist/index.tmp 模板（只讀不寫）、全部案例後以 ./settings.json 重啟後端還原預設語系。
//
// 標準圖: test/pics/init/init-{lang}-{NNN-name}.png（同 SSO 命名）
//
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { cleanup, launchBrowser, captureStableWithBox, apiBaseUrl, genTempSettings, restartBackend, assertBaselineMatch } from './tools/e2e-setup.mjs'
import { runBaselineCase, createBaselineGate, openCasePage, itemsUnionBox } from './tools/e2eLib.mjs'
import { urlSync, TOKEN_APP, TOKEN_MEMBER, TOKEN_PETER, TOKEN_DENY, readTables, restoreTables, editTableRows, cleanExternalFixtures } from './tools/api-setup.mjs'


const baselineDir = './test/pics/init'
const langs = ['eng', 'cht']
const isBaseline = process.argv.includes('--baseline')


//每語系: server 注入後各連線狀態畫面應呈現之文字（來自 mUI kpFallback, src/plugins/mUI.mjs, 非現狀指紋）
//  connecting=csIng / login=csLogin / errLogin=csErrLogin / errConn=csErrConn
//  notAdmin=csErrNotAdmin(perm-run01, E2E-007: 一般使用者登入被拒)
const expectedText = {
    eng: { connecting: 'Connecting', login: 'Logged in', errLogin: 'Login denied', errConn: 'Unable to connect', notAdmin: 'No permission to enter the permission console' },
    cht: { connecting: '連線中', login: '已登入', errLogin: '拒絕登入', errConn: '無法連線', notAdmin: '無權進入權限後台' },
}


function bp(lang, name) { return path.join(baselineDir, `init-${lang}-${name}.png`) }


//驗證 dist/index.tmp 不可變模板存在且三種佔位符齊全（陷阱 2）；不齊即拋錯, **絕不改寫該檔**。
//  why：index.tmp 受版控, 為業主發布管線之產物（script.txt: npm run build → toolg/genEntry.mjs 把 /mperm/ 改成 {sfd}/ 並刪 index.html）;
//  dist/index.html 則是後端啟動時由模板代換出的執行期產物（server/WWebPerm.mjs:710-737, {sfd}/{urlRedirect}/{language} 皆已被代換）。
//  本函式 2026-06-22 進版之原版「由 index.html 回寫 index.tmp」只還原 {language}, {urlRedirect} 被寫死成設定值、六個 {sfd}
//  全數消失（subfolder 為 '' 時輸出之 "/js/…" 與模板之 "{sfd}/js/…" 同形, 無從反推）, 每跑一次 e2e-init 即污染一次版控檔;
//  2026-09-07 與 2026-09-16 兩度實機踩到（後者由雙獨立審計同時查出）, 歷史 commit 逐一核對幸未帶進版控。
//  修法不是「補還原規則」而是「測試不得寫入受版控之建置產物」：缺檔或缺佔位符一律拋錯, 交由人以管線重產或 git checkout 還原。
function ensureIndexTmpl() {
    const distTmp = './dist/index.tmp'
    if (!fs.existsSync(distTmp)) {
        throw new Error('dist/index.tmp 不存在 — 請依 script.txt 執行 npm run build 與 node toolg/genEntry.mjs, 或 git checkout -- dist/index.tmp')
    }
    const t = fs.readFileSync(distTmp, 'utf8')
    const missing = ['{sfd}', '{urlRedirect}', '{language}'].filter((k) => !t.includes(k))
    if (missing.length > 0) {
        throw new Error(`dist/index.tmp 缺佔位符 ${missing.join(', ')}（模板已被改寫）— 請 git checkout -- dist/index.tmp 或依 script.txt 重產; 本測試不代為改寫受版控之模板`)
    }
}


//各 capture(page, lang) 由案例管線以 run(page, lang, ctx) 呼叫：後端已於 prepare 以注入語系重啟（開瀏覽器前，同遷移前之 capture 開頭），
//fresh browser 與新 context（1440×900、不掛 dialog 處理器）由管線開、finally 關（同遷移前之 launchBrowser → newContext → newPage 與 try/finally）；
//回傳 { buf, info }，info 於截圖前取，由管線之 semantic（assertCase）於寫檔／比對前斷言。


//E2E-001: 連線中畫面（csIng）。（prepare 已注入語系重啟後端）打後端 dist → routeHang 攔 converhp 主連線（apiName='api'）
//使其懸而不答 → connState 卡 csIng → 穩定呈現「連線中」。spinner SVG 由 captureStable 之 animatedRects 自動填黑遮蔽。
async function captureConnecting(page, lang) {
    //攔全部 converhp /api 連線（apiName='api'）使其懸而不答 → 登入(token 驗證)永久懸置 → connState 卡 csIng。
    //（perm 無 token 時 loginError 會即時重導 urlRedirect, 故帶 ?token=sys 走 token 驗證路徑再懸置, 而非無 token 短路報錯重導）
    await page.route('**/api/**', (route) => {})
    await page.goto(`${apiBaseUrl}/?token=sys`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    //等「連線中」文字渲染（connState 卡 csIng）
    await page.waitForFunction(
        (t) => (document.body.innerText || '').includes(t),
        expectedText[lang].connecting,
        { timeout: 15000 }
    )
    await page.mouse.move(0, 0)
    const info = await page.evaluate(() => ({
        winLang: (window.___pmwperm___ || {}).language,
        body: (document.body.innerText || '').replace(/\s+/g, ' '),
    }))
    //觀看區 = LayoutState 連線中內容（data-fmid="conn-state"）: spinner + 連線中文字
    //容器無可見邊界且右緣止於文字 → itemsUnionBox fit 量內容（圖示框 ∪ 文字墨跡外擴 inkPad），免紅框壓字（2026-09-28）
    const buf = await captureStableWithBox(page, itemsUnionBox('[data-fmid="conn-state"]', { fit: true }))
    return { buf, info }
}


//連線前 fallback 狀態畫面（errLogin / errConn）的共用 capture：機制同 captureConnecting，差在多一步 forceConnState。
//（prepare 已注入語系重啟後端）打後端 dist → routeHang 攔 /api 使連線懸置（卡在連線前、無 webInfor）→ 等 window.$vo 出現
//  → updateConnState(connState) 強制落到目標狀態（e2e-startup 同款狀態畫面測法）→ 等該狀態文字渲染。
//此時 $t 走 mUI fallback → getLang() → ___pmwperm___.language（注入語系）, 故畫面文字 = 注入語系。無需 DB / 無需真連線。
async function captureConnState(page, lang, connState, expectKey) {
    //攔全部 /api 連線使連線懸置 → 卡在連線前（webInfor 未回填）→ $t 走 fallback（注入語系）。
    await page.route('**/api/**', (route) => {})
    await page.goto(`${apiBaseUrl}/?token=sys`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    //等 App mounted（window.$vo 出現, App.vue:123），不等 csLogin
    await page.waitForFunction(() => !!window.$vo, null, { timeout: 60000 })
    //強制 connState 落到目標狀態（LayoutState 切到對應分支）
    await page.evaluate((cs) => { window.$vo.$ui.updateConnState(cs) }, connState)
    //等目標狀態文字渲染（fallback → 注入語系）
    await page.waitForFunction(
        (t) => (document.body.innerText || '').includes(t),
        expectedText[lang][expectKey],
        { timeout: 15000 }
    )
    await page.mouse.move(0, 0)
    const info = await page.evaluate(() => ({
        winLang: (window.___pmwperm___ || {}).language,
        body: (document.body.innerText || '').replace(/\s+/g, ' '),
    }))
    //觀看區 = LayoutState 狀態畫面內容（data-fmid="conn-state"）: 圖示 + 狀態文字（量法同 captureConnecting）
    const buf = await captureStableWithBox(page, itemsUnionBox('[data-fmid="conn-state"]', { fit: true }))
    return { buf, info }
}


//E2E-004: 拒絕登入畫面（csErrLogin）。連線懸置 → 強制 connState='csErrLogin' → 穩定呈現「拒絕登入」/「Login denied」。
async function captureErrLogin(page, lang) {
    return await captureConnState(page, lang, 'csErrLogin', 'errLogin')
}


//E2E-005: 無法連線畫面（csErrConn）。連線懸置 → 強制 connState='csErrConn' → 穩定呈現「無法連線」/「Unable to connect」。
async function captureErrConn(page, lang) {
    return await captureConnState(page, lang, 'csErrConn', 'errConn')
}


//E2E-007: 無權進入權限後台畫面（csErrNotAdmin）。連線懸置 → 強制 connState='csErrNotAdmin' → 穩定呈現「無權進入權限後台」/「No permission to enter the permission console」。
//真實登入流程（一般使用者被拒、不轉址、權杖清空、未發資料通道請求）另由 E2E-007-not-admin 以語意斷言驗；本案只供畫面標準圖（同 E2E-004/005 之強制狀態法）。
async function captureNotAdmin(page, lang) {
    return await captureConnState(page, lang, 'csErrNotAdmin', 'notAdmin')
}


//E2E-002: 已登入過場畫面（csLogin LayoutState）。登入成功但 webInfor 尚未回填（ready=false）時，LayoutState 以連線動畫圖加
//「已登入」文字呈現之過場態（此態之後 webInfor 回填、ready 轉真才切到五頁籤殼層 E2E-003-login-ok）。
//連線懸置 → 強制 connState='csLogin'（webInfor 未回填 → ready=false → LayoutState csLogin 分支）→ 穩定呈現「已登入」/「Logged in」。
async function captureLoggedIn(page, lang) {
    return await captureConnState(page, lang, 'csLogin', 'login')
}


//E2E-003: 登入成功後台五頁籤（golden 終態）。語系亦為 server 注入：後端以指定 language 啟動 → dist 注入該語系，
//且後端 getWebInfor 回傳 webInfor.language=該語系（WWebPerm.mjs:236,319），main.js 登入後 setLang(null) 只重刷不覆蓋
//→ 殼層五頁籤 / webName 以注入語系渲染（較 dev server + 前端 setLang 更貼近 production）。
//機制：（prepare）restartBackend 注入語系與 staEventMock（見 cases 之 settings）→ 打後端 dist + ?token=sys（不攔截，走真實登入）
//→ 等 connState='csLogin' + webInfor 回填（ready 為真，五頁籤殼層渲染）→ 截頂列。需 base seed 之 sys token（持久種子，與其他 e2e 同源）。
async function captureLoginOk(page, lang) {
    await page.goto(`${apiBaseUrl}/?token=sys`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    //等真實登入完成（ready=真：connState=csLogin 且 webInfor 為非空物件 → 五頁籤殼層渲染）
    await page.waitForFunction(() => {
        const vo = window.$vo
        if (!vo) return false
        const st = vo.$store && vo.$store.state
        return !!(st && st.connState === 'csLogin' && st.webInfor && Object.keys(st.webInfor).length > 0)
    }, null, { timeout: 60000 })
    await page.waitForTimeout(600) //殼層 + 五頁籤譯文 settle
    await page.mouse.move(0, 0)
    const info = await page.evaluate(() => {
        const vo = window.$vo
        return {
            winLang: (window.___pmwperm___ || {}).language,
            body: (document.body.innerText || '').replace(/\s+/g, ' '),
            tabs: ['mmStaInfor', 'mmTargets', 'mmPemis', 'mmGrups', 'mmUsers'].map((k) => vo.$t(k)),
            webName: vo.$t('webName'),
            csIng: vo.$t('csIng'),
        }
    })
    //觀看區 = Layout 頂部工具列（webName + 語言選單），五頁籤之渲染由語意斷言驗
    const buf = await captureStableWithBox(page, '[data-fmid="app-topbar"]')
    return { buf, info }
}


//順序＝mocha it 順序＝產製順序（語系外層、案例內層）；每案單張，stages 即案例鍵（與寫檔名、比對名一致，產出與宣告不符即報錯）。
//settings：本案於 language 之外另注入之後端設定（prepare 合併為 { language, ...settings } 重啟後端）；kind / key：語意斷言 assertCase 之分派。
const cases = [
    { name: 'E2E-001-connecting-screen', capture: captureConnecting, kind: 'connState', key: 'connecting', stages: ['E2E-001-connecting-screen'] },
    { name: 'E2E-002-logged-in-screen', capture: captureLoggedIn, kind: 'connState', key: 'login', stages: ['E2E-002-logged-in-screen'] },
    //staEventMock: 預設頁為統計頁, 其圖表/統計表若吃真實 srLog 則計數逐次遞增, x 軸日期隨當日變動 → baseline 逐日失效;
    //故與 e2e-stainfor 同樣注入確定性事件資料集(48 桶, 固定起點 2025-01-01, 固定 sin 計數)
    { name: 'E2E-003-login-ok', capture: captureLoginOk, kind: 'loginOk', settings: { staEventMock: true }, stages: ['E2E-003-login-ok'] },
    { name: 'E2E-004-err-login-screen', capture: captureErrLogin, kind: 'connState', key: 'errLogin', stages: ['E2E-004-err-login-screen'] },
    { name: 'E2E-005-err-conn-screen', capture: captureErrConn, kind: 'connState', key: 'errConn', stages: ['E2E-005-err-conn-screen'] },
    //主控 2026-10-24 授權新增標準圖
    { name: 'E2E-007-err-not-admin-screen', capture: captureNotAdmin, kind: 'connState', key: 'notAdmin', stages: ['E2E-007-err-not-admin-screen'] },
]


//連線狀態畫面語意斷言: 確認 server 注入語系 + 該狀態畫面呈現該語系文字, 且不含另一語系該狀態之對應文字。
//  key = 該 case 之狀態文字鍵（connecting / errLogin / errConn），各自比對對應的注入/另一語系文字。
function assertConnLang(lang, info, key) {
    const otherLang = lang === 'eng' ? 'cht' : 'eng'
    const want = expectedText[lang][key]
    const otherWant = expectedText[otherLang][key]
    assert.strictEqual(info.winLang, lang, `window.___pmwperm___.language 應=${lang}, 實際: ${info.winLang}`)
    assert.ok(info.body.includes(want), `${key} 畫面應含「${want}」, 實際: ${info.body.slice(0, 200)}`)
    assert.ok(!info.body.includes(otherWant), `${key} 畫面不應含另一語系「${otherWant}」`)
}


//登入成功語意斷言: 注入語系正確 + 五頁籤（以注入語系）與 webName 呈現 + 連線過場文字已消失。
function assertLoginOk(lang, info) {
    assert.strictEqual(info.winLang, lang, `window.___pmwperm___.language 應=${lang}, 實際: ${info.winLang}`)
    for (const tab of info.tabs) {
        assert.ok(tab && info.body.includes(tab), `登入成功應顯示五頁籤文字（${tab}）`)
    }
    assert.ok(info.webName && info.body.includes(info.webName), '頂列應顯示 webName')
    assert.ok(!info.body.includes(info.csIng), '進入後台後不應再有連線中過場文字')
}


//依 case kind 分派語意斷言
function assertCase(lang, info, c) {
    if (c.kind === 'loginOk') assertLoginOk(lang, info)
    else assertConnLang(lang, info, c.key)
}


//單一案例管線（產製端與比對端共用）：prepare 以該語系臨時設定（{ language, ...c.settings }）重啟後端（server 注入語系；開瀏覽器前，同遷移前之 capture 開頭）
//→ fresh browser（launchBrowser）→ 新 context（1440×900、不掛 dialog 處理器）→ capture（懸置 /api 或走真實登入 → 截圖，回 { buf, info }）
//→ semantic：assertCase 語意斷言（依 kind 分派；主）→ 寫檔／比對（像素，補）→ finally 關瀏覽器
async function runCase(mode, lang, c, extra = {}) {
    return await runBaselineCase({
        mode,
        lang,
        name: c.name,
        run: c.capture,
        stages: c.stages,
        launch: launchBrowser, //確定性渲染組經 launchBrowser 統一供給, 不再裸 launch(旗標分叉防護)
        openPage: (browser) => openCasePage(browser, { contextOptions: { viewport: { width: 1440, height: 900 } }, onDialog: null }),
        pathOf: bp,
        labelOf: (lg, key) => `init-${lg}-${key}`,
        match: assertBaselineMatch,
        prepare: async () => {
            await restartBackend(genTempSettings({ language: lang, ...c.settings }))
        },
        semantic: async (ctx) => {
            assertCase(lang, ctx.result.info, c) //語意斷言（依 kind 分派）
        },
        ...extra,
    })
}

async function generateBaseline() {
    process.env.E2E_STRICT_CAPTURE = '1' //regen 端：captureStable 未 settle 即 throw，拒絕寫入未穩定畫面
    //截圖前篩選（--names / --langs / --write-mode / E2E_BASELINE_OUT_DIR）；不符任何鍵即於此報錯（先於驗證模板與重啟後端）
    const gate = createBaselineGate({ langs, cases })
    console.log(gate.describe())
    if (!fs.existsSync(baselineDir)) {
        fs.mkdirSync(baselineDir, { recursive: true })
    }
    ensureIndexTmpl()
    for (const lang of gate.langs) {
        for (const c of gate.casesFor(lang)) {
            console.log(`  ${lang}/${c.name}`)
            const r = await runCase('regen', lang, c, { gate })
            console.log(`  ✔ ${lang}/${c.name}（寫出 ${r.written.length} 張，略過 ${r.skipped.length}，保留 ${r.kept.length}）`)
        }
    }
    //--names 之任一項未產出即報錯（不靜默略過）
    gate.finalize()
    await restartBackend('./settings.json') //還原預設語系
    console.log('=== init 標準圖產生完成 ===')
    cleanup() //←【必】非 mocha 環境須顯式呼叫
}


if (isBaseline) {
    generateBaseline().catch((err) => { console.log('baseline 例外', err); cleanup(); process.exit(1) })
}
else {
    describe('Init E2E — 應用啟動畫面（server 注入語系）', function() {
        this.timeout(120000)

        before(function() {
            ensureIndexTmpl()
        })

        after(async function() {
            this.timeout(30000)
            await restartBackend('./settings.json') //還原預設語系給後續測試
        })

        //每案之語系設定重啟、fresh browser、語意斷言（主）與像素比對（補）皆由 runCase 負責（與產製端同一管線）
        for (const lang of langs) {
            for (const c of cases) {
                const { name } = c
                it(`${name} [${lang}]: 設定語系=${lang} → 畫面呈現 ${lang}`, async function() {
                    await runCase('compare', lang, c, { onKnownDefect: () => this.skip() }) //已知缺陷協定: 標 pending(提示框殘留已由 w-component-vue 2.5.24 修正, 其偵測改為直接失敗, 見 e2e-setup probeStuckTooltip)
                })
            }
        }

        //E2E-006（run05, 2026-10-21; spec 流程_應用啟動與登入 E2E-006; 規則帳本 R-MAPKEY-02, ADR-034）: 對應鍵符合多位使用者時登入被拒。
        //  語意斷言, 不產標準圖、不依賴既有標準圖（spec 視覺項為「e2e 待補」; 是否與 E2E-004 共用標準圖待產製時逐張目視決定, 屬標準圖授權範圍）; 不在 cases 陣列內（cases 為產圖管線）。
        //  資料前置（非使用者操作, 同 api-mapKey MK-010）: 預設對應鍵（mappingBy='id'）下經同步端點推入 email 與 admin 相同之 active 使用者 → 以臨時設定 { language, mappingBy:'email', urlRedirect } 重啟後端（DB 保留, 開瀏覽器前）。
        //  開啟網址用 localhost（非 127.0.0.1）: 登入失敗之回呼 App.vue:loginError 只在「開發環境」（wsemi isDev: location.href 含 'localhost'）延遲 60 秒轉址, 否則立即轉址;
        //  spec 之觀察「畫面停在拒絕登入」只在開發環境可見（本機 11006 同時監聽 IPv4／IPv6, localhost 可連）。urlRedirect 改為本機不存在之路徑, 避免逾時後轉往外部網站。
        //  清理: restartBackend('./settings.json', { reseed: true }) 還原設定; 同步灌入之外部列（from=FROM_006）經 cleanExternalFixtures 移除並回驗 users 為 base seed（單一 mocha 行程全跑時 reseed 刪不掉 ./db, 見 finally 註解）。
        const FROM_006 = 'appE2eInit006'
        const LOCAL_BASE = apiBaseUrl.replace('127.0.0.1', 'localhost')
        const postSync = async (rows) => {
            const url = urlSync.replace('{keyTable}', 'users').replace('{token}', TOKEN_APP)
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ from: FROM_006, rows }) })
            return await res.json()
        }
        //perm-run03(外部匯入改依 srcKey 差異同步, R-IMPORT-01): 同步端點不收 id(帶 id 整批拒收 idNotAllowed), 每列須帶 srcKey; 'id-mk-dup' 改為 srcKey(真實 id 由伺服端產生),
        //  其後「移除重複」之第二次同步為同 srcKey 改 email＝依 srcKey 修改(id 不變), 結果同「以同 from 同步取代為不同 email」
        const dupAdmin = (email) => ({ srcKey: 'id-mk-dup', order: 0, name: 'dup-admin', email, from: FROM_006, cgrups: '{}', isAdmin: 'n', isActive: 'y' })
        for (const lang of langs) {
            it(`E2E-006-ambiguous-login [${lang}]: 對應鍵 email 命中兩位 active 使用者 → 拒絕登入(畫面停在拒絕登入、後端 ambiguousUserFromPerm、login error、權杖清空); 移除重複後登入恢復`, async function() {
                this.timeout(300000)
                try {
                    await restartBackend('./settings.json') //前置: 預設對應鍵(上一案可能為語系臨時設定)
                    const r0 = await postSync([dupAdmin('admin@example.com')])
                    assert.strictEqual(r0.state, 'success', `mappingBy=id 下同步應成功(不檢查 email 重複), 實得 ${JSON.stringify(r0)}`)
                    await restartBackend(genTempSettings({ language: lang, mappingBy: 'email', urlRedirect: `${LOCAL_BASE}/__e2e-redirect-006__` }))
                    const browser = await launchBrowser()
                    try {
                        const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
                        const loginErrors = []
                        page.on('console', (m) => {
                            if (m.text().startsWith('login error')) {
                                loginErrors.push(m.args()[1] ? m.args()[1].jsonValue().catch(() => null) : Promise.resolve(null))
                            }
                        })
                        const t0 = Date.now()
                        const respP = page.waitForResponse((r) => r.url().includes('getUserByToken'), { timeout: 60000 })
                        await page.goto(`${LOCAL_BASE}/?token=sys`, { waitUntil: 'domcontentloaded', timeout: 60000 })
                        //①後端回應: state=error、msg=ambiguousUserFromPerm(登入入口 /api/getUserByToken 經 getTokenUser 拒絕)
                        const body = await (await respP).json()
                        assert.strictEqual(body.state, 'error', `getUserByToken 應拒絕, 實得 ${JSON.stringify(body)}`)
                        assert.strictEqual(body.msg, 'ambiguousUserFromPerm', `應回固定語系鍵 ambiguousUserFromPerm, 實得 ${JSON.stringify(body.msg)}`)
                        //畫面停在拒絕登入(connState=csErrLogin), 呈現該語系文字且不進入殼層
                        await page.waitForFunction(() => !!(window.$vo && window.$vo.$store && window.$vo.$store.state.connState === 'csErrLogin'), null, { timeout: 30000 })
                        await page.waitForFunction((t) => (document.body.innerText || '').includes(t), expectedText[lang].errLogin, { timeout: 15000 })
                        const info = await page.evaluate(() => {
                            const vo = window.$vo
                            return {
                                winLang: (window.___pmwperm___ || {}).language,
                                body: (document.body.innerText || '').replace(/\s+/g, ' '),
                                connState: vo.$store.state.connState,
                                href: location.href,
                                token: localStorage.getItem('wperm:userToken'),
                                tabs: ['mmTargets', 'mmPemis', 'mmGrups', 'mmUsers'].map((k) => vo.$t(k)),
                            }
                        })
                        assert.ok(Date.now() - t0 < 55000, '須在 60 秒轉址前完成觀察')
                        assertConnLang(lang, info, 'errLogin')
                        assert.ok(info.href.startsWith(`${LOCAL_BASE}/`) && !info.href.includes('__e2e-redirect-006__'), `60 秒內停在原頁(開發環境延遲轉址), 實得 ${info.href}`)
                        for (const t of info.tabs) {
                            assert.ok(!info.body.includes(t), `不進入殼層: 不應見頁籤「${t}」`)
                        }
                        //③權杖清空; ②主控台 login error 之物件為 { text: '登入時驗證失敗', msg: 'ambiguousUserFromPerm' }(App.vue:loginError 輸出)
                        assert.strictEqual(info.token, '', `localStorage wperm:userToken 應被清為空字串, 實得 ${JSON.stringify(info.token)}`)
                        const errs = await Promise.all(loginErrors)
                        assert.ok(errs.some((e) => e && e.text === '登入時驗證失敗' && e.msg === 'ambiguousUserFromPerm'), `主控台應輸出 login error { text:'登入時驗證失敗', msg:'ambiguousUserFromPerm' }, 實得 ${JSON.stringify(errs)}`)
                    }
                    finally {
                        await browser.close().catch(() => {})
                    }
                    //移除重複後(同 email 剩 1 筆)登入恢復(api-mapKey MK-011 之瀏覽器層): 以同 from 同步取代為不同 email(mappingBy=email 下唯一, 通過)
                    const r1 = await postSync([dupAdmin('dup-admin@example.com')])
                    assert.strictEqual(r1.state, 'success', `改為不同 email 應成功, 實得 ${JSON.stringify(r1)}`)
                    const browser2 = await launchBrowser()
                    try {
                        const page = await (await browser2.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
                        await page.goto(`${apiBaseUrl}/?token=sys`, { waitUntil: 'domcontentloaded', timeout: 60000 })
                        await page.waitForFunction(() => {
                            const st = window.$vo && window.$vo.$store && window.$vo.$store.state
                            return !!(st && st.connState === 'csLogin' && st.webInfor && Object.keys(st.webInfor).length > 0)
                        }, null, { timeout: 60000 })
                        await page.waitForTimeout(600)
                        const ok = await page.evaluate(() => ({ body: (document.body.innerText || '').replace(/\s+/g, ' '), tabs: ['mmTargets', 'mmPemis', 'mmGrups', 'mmUsers'].map((k) => window.$vo.$t(k)) }))
                        for (const t of ok.tabs) {
                            assert.ok(ok.body.includes(t), `重複移除後應進入殼層(頁籤「${t}」)`)
                        }
                    }
                    finally {
                        await browser2.close().catch(() => {})
                    }
                }
                finally {
                    //還原預設設定; 逐檔隔離執行時本行程未持有 lmdb 映射, reseed 刪得掉 ./db 而得全新種子
                    await restartBackend('./settings.json', { reseed: true })
                    //id-mk-dup 為外部列(from=FROM_006): 後台整表寫入不得刪(Lv1 saveExternalRowChanged, 2026-10-22 全套實測以管理者寫入移除而失敗)、
                    //  外部同步又拒空 rows, 且單一 mocha 行程全跑(npm test)時 api 檔已使本行程持有 lmdb 映射, reseed 退化為 upsert 而不移除多餘列(殘留列污染其後的
                    //  e2e-ref-cascade／e2e-rela-user-grup／e2e-targets／e2e-users 之 captureBaseSeedOnce)。故經單一收尾入口(規則帳本 R-TEST-EXT-CLEAN-01)移除本案分區並回驗 users 為 base seed
                    await cleanExternalFixtures({ kts: ['users'], froms: [FROM_006], pristine: true })
                }
            })
        }

        //E2E-007（perm-run01, 2026-10-24; spec 流程_應用啟動與登入 E2E-007; 規則帳本 R-ADMIN-ONLY-01）: 一般使用者(部署方放行)登入權限後台 → 被拒並顯示「無權進入權限後台」。
        //  語意斷言（真實登入流程）; 不在 cases 陣列內。畫面標準圖由 cases 之 E2E-007-err-not-admin-screen（強制狀態法）產製比對（主控 2026-10-24 授權）。
        //  資料前置（非使用者操作）: 管理員(sys)經資料通道把 member(TOKEN_MEMBER: srv.mjs 之 verifyClientUser 放行、perm 列 isAdmin='n' 且啟用)加入 users。
        //  開啟網址用 127.0.0.1（非開發環境）: 其他登入失敗在非開發環境會立即轉址 urlRedirect, 本案證明一般使用者被拒時改為停在提示畫面（不轉址）, 使用者才看得到原因。
        //  清理: restoreTables(擷取快照)移除 member 並還原三表、還原 ./settings.json。
        //perm-run01 本輪(P-7): 變體 peter＝base seed 之一般使用者（perm 列 isAdmin n; 原 srv.mjs 之 verifyClientUser 以 isAdmin 先否決而走「拒絕登入」並轉址, 現範例不再否決, 與 member 同樣看到「無權進入權限後台」）;
        //  變體 member＝本案原夾具（另加入 users 之後台列, 其 id 於 srv.mjs 之 verifyClientUser 有明確放行鉤子）。兩者皆不改既有標準圖（語意斷言）。
        const NOT_ADMIN_VARIANTS = [
            { tag: 'member', token: TOKEN_MEMBER, row: { id: 'id-for-member', order: 50, name: 'member', email: 'member@example.com', description: '', from: '', cgrups: '{}', isAdmin: 'n', isActive: 'y' } },
            { tag: 'peter', token: TOKEN_PETER, row: null },
        ]
        for (const { lang, variant } of langs.flatMap((lang) => NOT_ADMIN_VARIANTS.map((variant) => ({ lang, variant })))) {
            it(`E2E-007-not-admin${variant.tag === 'member' ? '' : `-${variant.tag}`} [${lang}]: 一般使用者(${variant.tag}; 部署方放行)登入 → 後端 userNotAdmin、畫面停在「${expectedText[lang].notAdmin}」(csErrNotAdmin)、不轉址、不進殼層、未發資料通道請求、權杖清空`, async function() {
                this.timeout(300000)
                let snap = null
                try {
                    await restartBackend(genTempSettings({ language: lang, urlRedirect: `${apiBaseUrl}/__e2e-redirect-007__` }))
                    snap = await readTables() //擷取收尾用快照(與 restoreTables 對稱; 不使用 callRpc('updateUsers')——LC-005 禁 e2e-init 以管理者寫入收尾外部列夾具, 本案夾具為後台列, 走共用層)
                    if (variant.row !== null) {
                        await editTableRows('users', (rows) => {
                            rows.push({ ...variant.row })
                        })
                    }
                    const browser = await launchBrowser()
                    try {
                        const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
                        const mainReqs = []
                        page.on('request', (r) => {
                            if (r.url().includes('/api/main')) {
                                mainReqs.push(r.url())
                            }
                        })
                        const respP = page.waitForResponse((r) => r.url().includes('getUserByToken'), { timeout: 60000 })
                        await page.goto(`${apiBaseUrl}/?token=${encodeURIComponent(variant.token)}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
                        //①後端回應: 登入檢查 /api/getUserByToken → state=error、msg=userNotAdmin(固定語系鍵)
                        const body = await (await respP).json()
                        assert.strictEqual(body.state, 'error', `getUserByToken 應拒絕一般使用者, 實得 ${JSON.stringify(body)}`)
                        assert.strictEqual(body.msg, 'userNotAdmin', `應回固定語系鍵 userNotAdmin, 實得 ${JSON.stringify(body.msg)}`)
                        //②畫面停在「無權進入權限後台」(connState=csErrNotAdmin), 該語系文字, 不是一般的「拒絕登入」, 且不進入殼層、不卡在連線中
                        await page.waitForFunction(() => !!(window.$vo && window.$vo.$store && window.$vo.$store.state.connState === 'csErrNotAdmin'), null, { timeout: 30000 })
                        await page.waitForFunction((t) => (document.body.innerText || '').includes(t), expectedText[lang].notAdmin, { timeout: 15000 })
                        await page.waitForTimeout(3000) //非開發環境之其他登入失敗會於此時間內已轉址; 本案須仍停在原頁
                        const info = await page.evaluate(() => {
                            const vo = window.$vo
                            return {
                                winLang: (window.___pmwperm___ || {}).language,
                                body: (document.body.innerText || '').replace(/\s+/g, ' '),
                                connState: vo.$store.state.connState,
                                href: location.href,
                                token: localStorage.getItem('wperm:userToken'),
                                tabs: ['mmTargets', 'mmPemis', 'mmGrups', 'mmUsers'].map((k) => vo.$t(k)),
                            }
                        })
                        assert.strictEqual(info.winLang, lang, `window.___pmwperm___.language 應=${lang}`)
                        assert.strictEqual(info.connState, 'csErrNotAdmin')
                        assert.ok(info.body.includes(expectedText[lang].notAdmin), `畫面應含「${expectedText[lang].notAdmin}」, 實得 ${info.body.slice(0, 200)}`)
                        const other = lang === 'eng' ? 'cht' : 'eng'
                        assert.ok(!info.body.includes(expectedText[other].notAdmin), '不含另一語系之提示')
                        assert.ok(!info.body.includes(expectedText[lang].errLogin) && !info.body.includes(expectedText[lang].connecting), '不是一般的「拒絕登入」，也不卡在「連線中」')
                        assert.ok(info.href.startsWith(`${apiBaseUrl}/`) && !info.href.includes('__e2e-redirect-007__'), `停在原頁、不轉址至 urlRedirect, 實得 ${info.href}`)
                        for (const t of info.tabs) {
                            assert.ok(!info.body.includes(t), `不進入殼層: 不應見頁籤「${t}」`)
                        }
                        //③權杖清空; ④被拒者未發任何資料通道請求(連不上 /api/main, 無資料可讀)
                        assert.strictEqual(info.token, '', `localStorage wperm:userToken 應被清為空字串, 實得 ${JSON.stringify(info.token)}`)
                        assert.deepStrictEqual(mainReqs, [], `被拒者不應發出資料通道請求, 實得 ${JSON.stringify(mainReqs)}`)
                    }
                    finally {
                        await browser.close().catch(() => {})
                    }
                }
                finally {
                    if (snap !== null) {
                        await restoreTables(snap) //移除 member 並還原三表原文(不留測試加入之列)
                    }
                    await restartBackend('./settings.json')
                }
            })
        }

        //E2E-008（perm-run01 本輪, P-7; spec 流程_應用啟動與登入 E2E-008）: 部署方因非角色因素否決（srv.mjs 之 verifyClientUser 對 id-for-deny 回 false）→ 後端 userNoPermission、畫面為一般的拒絕登入流程（非開發環境立即轉址至 urlRedirect）;
        //  對照 E2E-007: 角色因素（非管理員）由本套件拒絕並停在「無權進入權限後台」, 非角色因素由部署方否決並走拒絕登入＋轉址。語意斷言, 不產標準圖（拒絕登入畫面見 E2E-004）。
        //  資料前置（非使用者操作）: 管理員經共用層把 deny（isAdmin y、啟用）加入 users。
        for (const lang of langs) {
            it(`E2E-008-veto-by-deployer [${lang}]: 管理員之 perm 列因非角色因素被部署方 verifyClientUser 否決 → 後端 userNoPermission、轉址至 urlRedirect（非「無權進入權限後台」）`, async function() {
                this.timeout(300000)
                let snap = null
                try {
                    await restartBackend(genTempSettings({ language: lang, urlRedirect: `${apiBaseUrl}/__e2e-redirect-008__` }))
                    snap = await readTables()
                    await editTableRows('users', (rows) => {
                        rows.push({ id: 'id-for-deny', order: 51, name: 'deny', email: 'deny@example.com', description: '', from: '', cgrups: '{}', isAdmin: 'y', isActive: 'y' })
                    })
                    const browser = await launchBrowser()
                    try {
                        const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
                        //回應本體須在頁面轉址之前讀取(perm-run02 修正測試競態): 非開發環境之登入失敗立即轉址, 轉址後 Playwright 取不到先前回應之本體
                        //  (`response.json: Protocol error (Network.getResponseBody): No resource with given identifier found`, 修前單案重跑失敗率約 83%);
                        //  故於 route 內先讀本體再原樣放行(請求與回應皆不改), 之後的斷言(state、msg、轉址)與修前相同, 不放寬。
                        let resolveBody = null
                        let rejectBody = null
                        const bodyP = new Promise((resolve, reject) => {
                            resolveBody = resolve
                            rejectBody = reject
                        })
                        const bodyTimer = setTimeout(() => rejectBody(new Error('getUserByToken 回應逾時(60 秒)')), 60000)
                        await page.route('**/api/getUserByToken*', async(route) => {
                            const resp = await route.fetch()
                            const text = await resp.text()
                            resolveBody(JSON.parse(text))
                            await route.fulfill({ response: resp, body: text })
                        })
                        await page.goto(`${apiBaseUrl}/?token=${encodeURIComponent(TOKEN_DENY)}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
                        const body = await bodyP
                        clearTimeout(bodyTimer)
                        assert.strictEqual(body.state, 'error', `getUserByToken 應拒絕, 實得 ${JSON.stringify(body)}`)
                        assert.strictEqual(body.msg, 'userNoPermission', `部署方否決應回固定語系鍵 userNoPermission, 實得 ${JSON.stringify(body.msg)}`)
                        await page.waitForURL((u) => u.href.includes('__e2e-redirect-008__'), { timeout: 30000 }) //非開發環境之登入失敗立即轉址
                    }
                    finally {
                        await browser.close().catch(() => {})
                    }
                }
                finally {
                    if (snap !== null) {
                        await restoreTables(snap)
                    }
                    await restartBackend('./settings.json')
                }
            })
        }
    })
}
