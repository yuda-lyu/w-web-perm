//grups 之寫入契約(規格與欄位政策見 users.mjs 之說明; 規則帳本 R-CONTRACT-01)
export default {
    table: 'grups',
    pk: 'id',
    fields: ['name', 'description', 'from', 'cpemis'],
    serverOnly: ['userId', 'timeCreate', 'userIdUpdate', 'timeUpdate'],
    orderKey: 'order',
}
