// Python 版 scripts/physton_prompt/translate.py の移植 (ブラウザで動く API のみ)
import { translatePlamoBrowser } from './plamo-browser.js'
import { translatePlamoLocal, translateOpenAI, translateMicrosoft, translateGoogle, translateMyMemory } from './remote.js'
import { findApi } from '../static-data.js'
import { t } from '../../i18n.js'

// 1 件ずつ翻訳する API と、まとめて送れる API
const SINGLE = {
    plamo3_browser: translatePlamoBrowser,
    plamo3_local: translatePlamoLocal,
    google: translateGoogle,
    myMemory: translateMyMemory,
    myMemory_free: translateMyMemory,
}
const BATCH = {
    openai: translateOpenAI,
    microsoft: translateMicrosoft,
}
// 外部サービスはグループごとに間隔を空ける (Python 版 translate_batch と同じ 1 秒)。
// 端末内 / 自前サーバーの PLaMo は待つ必要がない
const GROUP_INTERVAL_MS = { google: 1000, myMemory: 1000, myMemory_free: 1000 }

const cache = new Map()
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// concurrent 件ずつ並列に送り、グループ間で interval 待つ。失敗したら残りは送らない
async function translateInGroups(items, concurrent, interval, fn) {
    const size = Math.max(1, concurrent || 1)
    const results = []
    for (let i = 0; i < items.length; i += size) {
        if (i > 0 && interval) await sleep(interval)
        results.push(...await Promise.all(items.slice(i, i + size).map(fn)))
    }
    return results
}

function assertTranslated(translated, expectedLength, api) {
    if (!Array.isArray(translated) || translated.length !== expectedLength || translated.some(s => typeof s !== 'string')) {
        throw new Error(t('response_mismatch', api, expectedLength, Array.isArray(translated) ? translated.length : 0))
    }
    return translated.map(s => s.trim())
}

/**
 * @param {string|string[]} text
 * @param {object} apis translate_apis.json の内容
 */
export async function translate(text, fromLang, toLang, api, apiConfig, apis) {
    apiConfig = apiConfig || {}
    const result = (success, message, translated_text) => ({
        success, message, text, translated_text, from_lang: fromLang, to_lang: toLang, api,
    })

    const item = findApi(apis, api)
    if (!item || !(SINGLE[api] || BATCH[api])) return result(false, t('web_api_unavailable'), '')
    const from = item.support?.[fromLang]
    const to = item.support?.[toLang]
    if (!from || !to) {
        return result(false, `${t('translate_language_not_support')} (${item.name}) ${t('choose_other_api')}`, '')
    }

    const cacheKey = s => `${api}\u0000${from}\u0000${to}\u0000${JSON.stringify(apiConfig)}\u0000${s}`
    const run = async sources => {
        const translated = BATCH[api]
            ? await BATCH[api](sources, from, to, apiConfig)
            : await translateInGroups(sources, item.concurrent, GROUP_INTERVAL_MS[api], s => SINGLE[api](s, from, to, apiConfig))
        return assertTranslated(translated, sources.length, item.name || api)
    }

    try {
        if (Array.isArray(text)) {
            if (!text.length) return result(false, t('translate_text_is_empty'), '')
            const texts = text.map(s => {
                s = String(s).trim()
                if (s === '') return ''
                return cache.has(cacheKey(s)) ? cache.get(cacheKey(s)) : null
            })
            const pending = texts.flatMap((s, i) => (s === null ? [i] : []))
            if (pending.length) {
                // 同じタグが何度も出てくるときは 1 回だけ翻訳する
                const sources = [...new Set(pending.map(i => String(text[i]).trim()))]
                const translated = await run(sources)
                sources.forEach((source, j) => cache.set(cacheKey(source), translated[j]))
                for (const index of pending) texts[index] = cache.get(cacheKey(String(text[index]).trim()))
            }
            return result(true, '', texts)
        }

        const source = String(text).trim()
        if (source === '') return result(false, t('translate_text_is_empty'), '')
        if (cache.has(cacheKey(source))) return result(true, '', cache.get(cacheKey(source)))
        const [translated] = await run([source])
        cache.set(cacheKey(source), translated)
        return result(true, '', translated)
    } catch (e) {
        return result(false, String(e?.message || e), '')
    }
}
