import truncate from 'lodash-es/truncate.js'
import ds from '../src/schema/index.mjs'
import { fillIdlessIds } from '../src/js/refCascade.mjs'
import validateRowsBeforeWrite from './validateRows.mjs'


//引用連帶之寫入(規則帳本 R-REF-CASCADE-01, ADR-036): 把 planRefChanges(src/js/refCascade.mjs)算出之引用端改寫與被引用表自身之寫入串成「引用端先、主體後」, 並於失敗時補償還原引用端.
//單一擁有者: 後台整表寫入(procCore.updateTabItems)與外部同步(WWebPerm.syncAndReplaceTabs)皆經本檔, 不各自寫.
//
//為何引用端先、主體後, 以及失敗回復(外審 A.2「重存即自癒」對互換／鏈式／批內有新增不成立, 本檔改為補償, 見 ADR-036):
//  ① 全部預檢(含引用端改寫列之欄位驗證)於任何寫入之前完成, 失敗零變更;
//  ② 先寫引用端(僅改寫之欄位, 經 procOrm 以操作者記為更新者), 再寫主體; 任一步以例外失敗, 即以「寫入前之原值」還原引用端(補償, 精確還原該欄位與更新者／更新時間),
//     使資料回到寫入前之狀態再回報原錯誤, 重新操作不依賴「冪等重存」; 主體部分寫入之舊限制不變(ADR-013: 整表寫入為 del → insert → save 非交易, 其部分寫入之處置維持「重新整理後確認」, 本檔不補償主體);
//  ③ 補償本身失敗(雙重故障)時回 saveCascadePartial 並記 srLog(event refCascade-restore-error, 帶引用端表名與列數, 不記個資值), 由稽核工具(server/tools/authRefsAudit.mjs)列出懸空引用後人工處置;
//  ④ 行程於引用端寫入後、主體寫入前崩潰者不在補償範圍(記憶體內無日誌), 同③以稽核工具處置.
//鎖: 呼叫端須已以 withTabLocks 取得被引用表與引用端表之鎖(server/keyCheck.mjs, 其底層即 w-serv-orm 實例之 withTabLocks); 本檔不取鎖.


/**
 * 預檢引用端改寫列(於任何寫入之前): 改寫後欄位值須可寫入(無 HTML 標記、純量、長度等同後台整表寫入之 validateRowsBeforeWrite)
 *
 * @param {Object} plan 輸入 planRefChanges 之結果
 * @returns {String|null} 回傳 null 為通過; 否則為語系鍵(htmlMarkupNotAllowed 或 saveRowFieldInvalid)
 */
function checkCascadePlan(plan) {
    if (!plan || plan.changes.length === 0) {
        return null
    }
    let ve = validateRowsBeforeWrite(plan.changes.map((c) => ({ id: c.id, [c.field]: c.after })))
    if (ve === null) {
        return null
    }
    return (ve.reason === 'htmlMarkup') ? 'htmlMarkupNotAllowed' : 'saveRowFieldInvalid'
}


/**
 * 執行引用連帶之寫入: 先寫引用端(改寫之欄位), 再執行 writeMain(被引用表自身之寫入), 失敗時補償還原引用端後重新拋出原錯誤
 *
 * @param {Object} p 輸入參數物件
 * @param {Object} p.plan 輸入 planRefChanges 之結果(無 changes 時直接執行 writeMain)
 * @param {Array} p.holdersOld 輸入引用端表全部列(寫入前之 select 結果, 供還原更新者與更新時間)
 * @param {Object} p.woItems 輸入 ORM 表物件集合(補償直接用 woItems 寫回原值, 不經 procOrm 之稽核欄位覆寫)
 * @param {Function} p.procOrm 輸入 procOrm(userId, 表名, 方法, 資料)
 * @param {String} p.userId 輸入操作者 id
 * @param {Object} p.srLog 輸入 srLog
 * @param {Function} p.writeMain 輸入被引用表自身之寫入函數(async)
 * @returns {Promise} 回傳 writeMain 之結果
 */
async function writeWithCascade({ plan, holdersOld, woItems, procOrm, userId, srLog, writeMain }) {
    if (!plan || plan.changes.length === 0) {
        return await writeMain()
    }

    //防禦: 引用端改寫列之欄位預檢(呼叫端應已於寫入前以 checkCascadePlan 預檢; 此處再驗一次, 使本函式無論被誰呼叫皆不會在驗證未過時寫入任何一列)
    let errPlan = checkCascadePlan(plan)
    if (errPlan !== null) {
        return Promise.reject(errPlan)
    }

    //pre: 還原用之寫入前整列(補償以整列覆寫寫回, 使引用端列逐位元回到寫入前; 歷史列若原無 userIdUpdate／timeUpdate, 寫入時新增之該二鍵亦隨覆寫消失——合併寫入無法刪鍵; merge:false 為 w-orm-lmdb 之選項, 其他後端不提供而退回合併寫入, 此時原有該二鍵者仍精確還原)
    let kpHolder = new Map()
    holdersOld.forEach((h) => {
        if (h !== null && typeof h === 'object') {
            kpHolder.set(h.id, h)
        }
    })
    let pre = plan.changes.map((c) => {
        let h = kpHolder.get(c.id)
        return h ? { ...h } : { id: c.id, [c.field]: c.before }
    })
    let post = plan.changes.map((c) => ({ id: c.id, [c.field]: c.after }))

    //toRaw: 錯誤原文只入 srLog(raw、rawRestore; 規則帳本 R-ORM-02), 對外仍為固定語系鍵; 原文中之主鍵(ORM 逐筆失敗訊息之 id[…])可能為引用端(使用者)之 id, 一律遮罩後才入 log(不記引用端 id)
    //先以「已知引用端 id 之完整字面」遮罩(id 本身可含 ']' 而使通則正則提早結束, 殘留後半段個資; 外審 sol 增量 D1), 再以通則遮罩其餘 id[…]
    //ORM 之逐筆失敗訊息(w-serv-orm getMapOrm.getMsgFail)把超過 100 字元之主鍵截斷為 99 字元加「…」再包成 id[...](外審 sol R7), 截斷後之字面不等於完整 id, 故同時納入截斷形式之字面
    let holderIds = plan.changes.map((c) => c.id).filter((v) => typeof v === 'string' && v !== '').flatMap((id) => {
        let t = truncate(id, { length: 100, omission: '…' })
        return t === id ? [id] : [id, t]
    }).sort((a, b) => b.length - a.length) //較長者先遮罩(id 互為前綴時, 如 'a' 與 'a]b', 較短者先遮罩會殘留後半段)
    let maskId = (t) => {
        let s = t
        holderIds.forEach((id) => {
            s = s.split(`id[${id}]`).join('id[*]')
        })
        return s.replace(/id\[[^\]]*\]/g, 'id[*]')
    }
    let toRaw = (e) => maskId((typeof e === 'string') ? e : ((e && e.message) || String(e)))

    let rm = null
    let stage = 'holder'
    try {
        await procOrm(userId, plan.holder, 'save', post, { mustExist: true }) //須使用procOrm才有辦法自動給予更新者與更新時間; 只改不增: 引用端列於持鎖後新鮮讀取, 理論上必在, 不在即 rowNotFound 零寫入(已刪之列不復活, 規格第 6 節)
        stage = 'main'
        rm = await writeMain()
    }
    catch (err) {

        //補償: 以寫入前整列還原引用端(逐列結果為 ok:0 者亦算失敗)
        let okRestore = true
        let rawRestore = ''
        try {
            let rs = await woItems[plan.holder].save(pre, { merge: false })
            if (Array.isArray(rs) && rs.some((v) => v && v.ok === 0)) {
                okRestore = false
                rawRestore = 'save result ok:0'
            }
        }
        catch (errRestore) {
            okRestore = false
            rawRestore = toRaw(errRestore)
        }
        if (!okRestore) {
            srLog.error({ event: 'refCascade-restore-error', msg: 'saveCascadePartial', raw: toRaw(err), rawRestore, userId, keyTable: plan.keyTable, holder: plan.holder, nHolders: plan.changes.length })
            return Promise.reject('saveCascadePartial')
        }
        srLog.warn({ event: 'refCascade-restored', raw: toRaw(err), userId, keyTable: plan.keyTable, holder: plan.holder, nHolders: plan.changes.length })

        //重新拋出原錯誤: 引用端寫入階段之錯誤原文可能含引用端 id, 外層(procCore／syncAndReplaceTabs)會再把 raw 記入 srLog, 故於此遮罩後才拋出; 主體寫入階段之錯誤原樣拋出(其 id 為群組／權限／標的之主鍵, 非個資)
        if (stage === 'holder') {
            return Promise.reject((typeof err === 'string') ? maskId(err) : ((err instanceof Error) ? new Error(maskId(err.message)) : err))
        }
        return Promise.reject(err)

    }

    srLog.info({ event: 'refCascade-done', userId, keyTable: plan.keyTable, holder: plan.holder, nRename: plan.renames.length, nDelName: plan.delNames.length, nHolders: plan.nHolders, nRenameHolders: plan.nRenameHolders, nDelHolders: plan.nDelHolders, nExternal: plan.nExternal })

    return rm

}


/**
 * 外部同步(delAll({ from }) + insert)之「寫入後整表」, 供 planRefChanges 判定同一 from 內之改名與刪除(Q6: 依同一來源內之穩定 id 判定)
 *
 * 他 from 之既有列原樣; 本批各列帶 id 者以其 id(有限數字取字串形式)為身分(同 id 異名＝改名、舊 id 不在本批＝刪除);
 * 本批未帶 id 之列(grups／pemis, 寫入時由 ORM 補隨機主鍵, 每次同步皆不同)無穩定 id 可依, 改以「名稱」對應同一 from 之既有列(同名即同一實體, 不算刪除再新增; 名稱不同即視為舊列刪除、新列新增), 僅供規劃, 不改寫入之列.
 *
 * @param {String} keyTable 輸入同步之表名
 * @param {Array} rowsOld 輸入該表全部既有列(select 結果)
 * @param {Array} rows 輸入本批列(已 ltdtmapping 並帶 from)
 * @param {String} from 輸入本批之 from
 * @returns {Array} 回傳寫入後之整表(僅供規劃, 不寫入)
 */
function buildSyncRowsNew(keyTable, rowsOld, rows, from) {
    let others = rowsOld.filter((r) => r !== null && typeof r === 'object' && r.from !== from)
    let sameFrom = rowsOld.filter((r) => r !== null && typeof r === 'object' && r.from === from)
    return [...others, ...fillIdlessIds(keyTable, sameFrom, rows, others)] //未帶 id 之列依名稱對應同一 from 之既有列(見 fillIdlessIds); 規劃 id 須避開他 from 列之主鍵
}


export { checkCascadePlan, writeWithCascade, buildSyncRowsNew }
