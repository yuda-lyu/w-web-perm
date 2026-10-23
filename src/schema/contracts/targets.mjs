//targets 之寫入契約(規格與欄位政策見 users.mjs 之說明; 規則帳本 R-CONTRACT-01): 主鍵 id 即標的名稱(使用者給定)
export default {
    table: 'targets',
    pk: 'id',
    fields: ['description', 'from'],
    serverOnly: ['userId', 'timeCreate', 'userIdUpdate', 'timeUpdate'],
    orderKey: 'order',
}
