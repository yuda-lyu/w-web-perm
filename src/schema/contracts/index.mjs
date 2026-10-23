//四張表之寫入契約集合(鍵為表名): 伺服端(server/procCore.mjs)與前端(清單頁、關聯對話框)共用同一份, 以 w-serv-orm/src/baseline.mjs 之 buildBaseline／compareBaseline 計算與比對(規則帳本 R-CONTRACT-01)
import users from './users.mjs'
import grups from './grups.mjs'
import pemis from './pemis.mjs'
import targets from './targets.mjs'


let contracts = {
    users,
    grups,
    pemis,
    targets,
}


export { contracts }
export default contracts
