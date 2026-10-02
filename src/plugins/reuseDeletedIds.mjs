import get from 'lodash-es/get.js'
import map from 'lodash-es/map.js'
import each from 'lodash-es/each.js'


/**
 * 新增列沿用資料庫既有 id 時之正規化 (標的清單專用, 其 id 為可就地改寫之標的路徑; ADR-025)
 *
 * 同一次儲存中刪除(或把 id 改掉)某既有列, 又新增一列並把 id 改成該既有列之 id, 淨效果為「修改該列」:
 * 該新增列改為一般列送出(_isNew 設 false), 建立者 / 建立時間沿用資料庫之值(修改者 / 修改時間由後端寫入).
 * 否則後端之「新增列已存在即拒絕」(saveNewRowExists, 擋同一包重送) 會把它當重送擋下, 且重新整理後重做仍被擋;
 * 亦避免以前端佔位字({待自動給予})覆寫建立者 / 建立時間.
 * 只處理 id 於 rows 內唯一者; 重複 id 不處理, 由後端 ckKey 回 saveRowFieldDuplicate.
 * 使用者 / 群組 / 權限清單之 id 為系統產生且不可編輯, 新增列不會與既有列同 id, 不需此處理.
 *
 * @param {Array} rows 輸入欲送出之列陣列(清單之 opt.rows), 不修改
 * @param {Array} rowsDb 輸入資料庫之列陣列(前端 store 之同表資料)
 * @returns {Array} 回傳正規化後之新陣列
 */
function reuseDeletedIds(rows, rowsDb) {

    //kpDb, kpCount: 以 Map 存放, 不以 lodash get 取值(標的 id 為路徑, 可能含「.」而被當成巢狀路徑)
    let kpDb = new Map()
    each(rowsDb, (r) => {
        kpDb.set(get(r, 'id', ''), r)
    })
    let kpCount = new Map()
    each(rows, (r) => {
        let id = get(r, 'id', '')
        kpCount.set(id, (kpCount.get(id) || 0) + 1)
    })

    let rs = map(rows, (r) => {
        let id = get(r, 'id', '')

        //非新增列
        if (get(r, '_isNew') !== true) {
            return r
        }

        //資料庫無此 id: 真正之新增
        if (!kpDb.has(id)) {
            return r
        }
        let rDb = kpDb.get(id)

        //rows 內重複 id: 不處理
        if (kpCount.get(id) !== 1) {
            return r
        }

        return {
            ...r,
            _isNew: false,
            userId: get(rDb, 'userId', ''),
            timeCreate: get(rDb, 'timeCreate', ''),
        }
    })

    return rs
}


export default reuseDeletedIds
