//pemis 之寫入契約(規格與欄位政策見 users.mjs 之說明; 規則帳本 R-CONTRACT-01)
export default {
    table: 'pemis',
    pk: 'id',
    fields: ['name', 'description', 'from', 'srcKey', 'crules'], //srcKey: 外部匯入之來源鍵(身分欄, 見 users.mjs)
    serverOnly: ['userId', 'timeCreate', 'userIdUpdate', 'timeUpdate'],
    orderKey: 'order',
}
