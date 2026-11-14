// Python 版 get_translate_apis.py の privacy_translate_api_config / unprotected_translate_api_config の移植と、
// バックアップ用の API キー除去 / 復元。
// 設定画面は API キーを平文の <input> に表示するので、読み出し時は先頭 6 文字以外を * にし、
// 保存時に * のままなら保存済みの本物の値に戻す。
//
// privacy は { api キー: [秘密の項目名...] }。Web 版にない API (旧版から移行した deepl / baidu など) の分も
// scripts/sync-aio.mjs が上流の translate_apis.json から作る (aio/api_privacy.json)。

const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v)

// 設定のデータキー (translate_api.<api> / chatgpt_key) から API キーを得る。翻訳 API の設定でなければ null
function apiOf(dataKey) {
    if (dataKey === 'chatgpt_key') return 'openai'
    if (dataKey.startsWith('translate_api.')) return dataKey.slice('translate_api.'.length)
    return null
}

// 秘密の項目ごとに fn(next, key, stored) を適用した浅いコピーを返す。対象外ならそのまま返す
function eachSecret(dataKey, data, privacy, fn, stored) {
    const api = apiOf(dataKey)
    const keys = api ? privacy[api] || [] : []
    if (!isPlainObject(data) || !keys.length) return data
    const next = { ...data }
    for (const key of keys) fn(next, key, isPlainObject(stored) ? stored : {})
    return next
}

export function maskApiConfig(dataKey, data, privacy) {
    return eachSecret(dataKey, data, privacy, (next, key) => {
        const value = next[key]
        if (typeof value === 'string' && value.length > 6) next[key] = value.slice(0, 6) + '*'.repeat(value.length - 6)
    })
}

export function unmaskApiConfig(dataKey, data, stored, privacy) {
    return eachSecret(dataKey, data, privacy, (next, key, saved) => {
        const value = next[key]
        const original = saved[key]
        if (typeof value === 'string' && typeof original === 'string' && value.includes('*') && value.slice(0, 6) === original.slice(0, 6)) {
            next[key] = original
        }
    }, stored)
}

// バックアップから API キーを取り除く。どの項目が秘密かわからない翻訳 API の設定は丸ごと除く (undefined を返す)
export function stripApiKeys(dataKey, data, privacy) {
    const api = apiOf(dataKey)
    if (api && !(api in privacy)) return undefined
    return eachSecret(dataKey, data, privacy, (next, key) => {
        delete next[key]
    })
}

// キーを含まないバックアップを読み込んだとき、この端末に保存済みのキーは残す
export function keepStoredApiKeys(dataKey, imported, stored, privacy) {
    return eachSecret(dataKey, imported, privacy, (next, key, saved) => {
        if (!(key in next) && key in saved) next[key] = saved[key]
    }, stored)
}
