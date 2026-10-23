//users 之寫入契約(多人同時編輯, 規格 dspec/多人同時編輯之寫入契約.md 第 3～5 節; 規則帳本 R-CONTRACT-01): 前後端 import 同一檔, 純資料(零 import, 可進瀏覽器打包).
//fields 明列(白名單): 存檔採用客戶端值且入基準之欄位; 不以「排除系統欄位」推得.
//  from 為外部列身分(外部同步擁有, 後台不得改)與 isActive／cgrups 等皆為客戶端欄位或外部欄位, 入基準: 外部同步改變其中任一欄, 持舊畫面者存檔即被拒(以外部為主, 原則 5).
//serverOnly: 伺服器專有欄位(建立者／建立時間／更新者／更新時間, 只由伺服端寫入): 不入基準, 存檔不採用客戶端值(取庫內值).
//orderKey: 存檔依列序重編 order(updateTabItems), 故 order 不入列摘要, 改以「名次」入基準——他人重排被偵測、系統重編號(名次不變)不誤擋.
//  外部列之 order 屬外部(R-EXT-OWN-01: 後台存檔不重編外部列之 order, 還原為庫內值), 排序口徑同一(order 數值, 主鍵碼元).
export default {
    table: 'users',
    pk: 'id',
    fields: ['name', 'email', 'description', 'from', 'srcKey', 'cgrups', 'isAdmin', 'isActive'], //srcKey: 外部匯入之來源鍵(身分欄, perm-run03; 與 from 同, 後台不可改〔externalRows.checkExternalWrite〕, 外部匯入補上或改變者持舊畫面者存檔即被拒)
    serverOnly: ['userId', 'timeCreate', 'userIdUpdate', 'timeUpdate'],
    orderKey: 'order',
}
