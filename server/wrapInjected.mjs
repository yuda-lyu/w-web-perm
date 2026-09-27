import get from 'lodash-es/get.js'
import isestr from 'wsemi/src/isestr.mjs'
import isarr from 'wsemi/src/isarr.mjs'
import isfun from 'wsemi/src/isfun.mjs'


//wrapInjected: 部署方注入函數(getUserByToken / verifyClientUser / verifyAppUser)之包裝(W 契約, spec/設計要點與取捨.md ADR-023)
//why: 注入函數拋錯或 reject 時原會被 await 原樣上拋, 其原文經 pm2resolve 回前端、經 verifyConn 之 msg 入 srLog、經 error 事件印出;
//部署方常以 w-web-sso 對外 helper(≤1.1.4)包裝 getUserByToken, 其 reject 字串含已代入系統介接權杖與使用者權杖之完整網址(修正前探測實證)。
//包裝後失敗視同否定結果(由呼叫端給 failValue), 走各呼叫點既有之查無 / 無權限分支回自家 key; 上游原文不回前端、不入 log。


//keysUpstream: 上游失敗可照記之 key 白名單 = w-web-sso 對外 helper 之 K 契約 14 個 key(w-web-sso ADR-068)
//與 sso 之同步點: sso 之 K 契約增減 key 時須同步本表(見 CLAUDE_rulebook.md「權杖不外洩」)
let keysUpstream = [
    'invalidUrl',
    'invalidTokenSelf',
    'invalidTokenTar',
    'invalidUserIdTar',
    'noTokenKeyValueInUrl',
    'noTokenKeyUserIdInUrl',
    'noTokenInUrl',
    'cannotGetUserByUrl',
    'cannotGetUsersByUrl',
    'cannotGetUserDataByUrl',
    'cannotGetUsersDataByUrl',
    'noUserDataByUrl',
    'noUsersDataByUrl',
    'noUserDataAfterConvert',
]


//reName: Error.name 之名稱形狀(同 w-web-sso helper 診斷之 errName), 不符者不記(name 亦可被設為任意字串)
let reName = /^[A-Za-z]{1,40}$/


/**
 * 描述上游失敗, 供寫入 log: 絕不含上游原文
 * - reject 值(字串)或其 message 屬白名單 key → { upstream: key }
 * - 其餘 → { upstreamType, upstreamName }: 型別(null / array / typeof)與名稱形狀之 Error.name(無則 '')
 *
 * @param {*} err 輸入注入函數拋出或 reject 之值
 * @returns {Object} 回傳描述物件
 */
function describeUpstream(err) {
    let key = isestr(err) ? err : get(err, 'message')
    if (isestr(key) && keysUpstream.includes(key)) {
        return { upstream: key }
    }
    let upstreamType = (err === null) ? 'null' : (isarr(err) ? 'array' : typeof err)
    let name = get(err, 'name')
    let upstreamName = (isestr(name) && reName.test(name)) ? name : ''
    return { upstreamType, upstreamName }
}


/**
 * 包裝注入函數: 回傳(同步或 Promise)原樣回傳; 同步拋錯或 reject 回 failValue, 並以 describeUpstream(err) 呼叫 onFail
 * 包裝後一律回 Promise(呼叫端既有之 ispm 判斷照常)
 *
 * @param {Function} fn 輸入注入函數
 * @param {Object} [opt={}] 輸入設定物件
 * @param {*} [opt.failValue=null] 輸入失敗時之回傳值(getUserByToken 為 null 等同查無, verify* 為 false 等同無權限)
 * @param {Function} [opt.onFail=null] 輸入失敗時之紀錄函數, 只收到 describeUpstream 之結果(收不到上游原文); 其自身拋錯不影響回傳
 * @returns {Function} 回傳包裝後之函數
 */
function wrapInjected(fn, opt = {}) {
    let failValue = get(opt, 'failValue', null)
    let onFail = get(opt, 'onFail', null)
    return async (...args) => {
        try {
            return await fn(...args) //await 於 try 內: 同步拋錯、reject 與 thenable 之 reject 皆攔截
        }
        catch (err) {
            if (isfun(onFail)) {
                try {
                    onFail(describeUpstream(err))
                }
                catch (e) {} //紀錄失敗不改變「失敗＝否定結果」之語意
            }
            return failValue
        }
    }
}


export {
    keysUpstream,
    describeUpstream
}
export default wrapInjected
