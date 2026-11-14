// ブラウザから直接 (CORS で) 呼べる翻訳 API。Python 版 translator/*.py の移植。
// API キーはこの端末のブラウザ内にのみ保存され、各サービスへ直接送られる。
import { t } from '../../i18n.js'

// 上流 (axios) と Python 版の各翻訳クラスに合わせたタイムアウト
const TIMEOUT = { default: 60000, short: 10000, local: 120000 }

async function fetchJSON(url, options = {}, service = 'API', timeoutMs = TIMEOUT.default) {
    let res, text
    try {
        res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
        text = await res.text() // 本文の受信中にタイムアウトすることもある
    } catch (e) {
        if (e?.name === 'TimeoutError') throw new Error(t('timeout', service, timeoutMs / 1000))
        throw new Error(t('connect_failed', service, e.message))
    }
    let data = null
    try {
        data = text ? JSON.parse(text) : null
    } catch {
        // JSON 以外のレスポンス
    }
    if (!res.ok) {
        const message = data?.error?.message || data?.error || text || res.statusText
        throw new Error(`${service}: ${res.status} ${typeof message === 'string' ? message : JSON.stringify(message)}`)
    }
    return data
}

const required = (value, name) => {
    if (!value) throw new Error(t('is_required', name))
    return value
}

// ---- PLaMo 3 Translate (ローカルサーバー / OpenAI 互換 API) ----
export async function translatePlamoLocal(text, fromLang, toLang, config) {
    const base = (config.api_base || 'http://localhost:11434/v1').replace(/\/+$/, '')
    const headers = { 'Content-Type': 'application/json' }
    if (config.api_key) headers.Authorization = `Bearer ${config.api_key}`
    const data = await fetchJSON(`${base}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model: config.model || 'hf.co/pfnet/plamo-3-translate-2b-GGUF:Q4_K_M',
            // chat_template_kwargs を渡せないクライアント (Ollama / LM Studio) 向けの指定方法 (モデルカード記載)
            messages: [
                { role: 'system', content: `[plamo-translate]\ntarget_lang=${toLang}\nsource_lang=${fromLang}` },
                { role: 'user', content: text },
            ],
            temperature: 0,
            max_tokens: 1024,
        }),
    }, 'PLaMo (local)', TIMEOUT.local)
    if (data?.choices?.[0]?.finish_reason === 'length') throw new Error(t('truncated'))
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== 'string') throw new Error(t('no_response_from', 'PLaMo (local)'))
    return content.trim()
}

// ---- OpenAI ----
async function openaiChat(messages, config) {
    const base = (config.api_base || 'https://api.openai.com/v1').replace(/\/+$/, '')
    const data = await fetchJSON(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${required(config.api_key, 'API Key')}`,
        },
        body: JSON.stringify({ model: config.model || 'gpt-3.5-turbo', messages }),
    }, 'OpenAI')
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== 'string') throw new Error(t('no_response_from', 'OpenAI'))
    return content
}

export async function translateOpenAI(texts, fromLang, toLang, config) {
    const body = JSON.stringify(texts.map(text => ({ text })))
    const content = await openaiChat([
        { role: 'system', content: 'You are a translator assistant.' },
        {
            role: 'user',
            content: `You are a translator assistant. Please translate the following JSON data ${toLang}. Preserve the original format. Only return the translation result, without any additional content or annotations. If the prompt word is in the target language, please send it to me unchanged:\n${body}`,
        },
    ], config)
    const result = parseJSONArray(content)
    if (!result) throw new Error(t('response_error', 'OpenAI'))
    return result.map(item => item?.text)
}

// 応答全体、なければ本文中の [ ... ] のうち JSON 配列として読める部分を探す
function parseJSONArray(content) {
    const tryParse = s => {
        try {
            const v = JSON.parse(s)
            return Array.isArray(v) ? v : null
        } catch {
            return null
        }
    }
    const whole = tryParse(content.trim())
    if (whole) return whole
    const end = content.lastIndexOf(']')
    for (let start = content.indexOf('['); start >= 0 && start < end; start = content.indexOf('[', start + 1)) {
        const found = tryParse(content.slice(start, end + 1))
        if (found) return found
    }
    return null
}

export function genOpenAI(messages, config) {
    if (!messages?.length) throw new Error(t('is_required', 'messages'))
    return openaiChat(messages, config)
}

// ---- Microsoft ----
export async function translateMicrosoft(texts, fromLang, toLang, config) {
    const params = new URLSearchParams({ 'api-version': '3.0', from: fromLang, to: toLang })
    const data = await fetchJSON(`https://api.cognitive.microsofttranslator.com/translate?${params}`, {
        method: 'POST',
        headers: {
            'Ocp-Apim-Subscription-Key': required(config.api_key, 'API Key'),
            'Ocp-Apim-Subscription-Region': required(config.region, 'Region'),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(texts.map(text => ({ text }))),
    }, 'Microsoft', TIMEOUT.short)
    if (!Array.isArray(data) || !data.length) throw new Error(t('no_response_from', 'Microsoft'))
    return data.map(item => item.translations[0].text)
}

// ---- Google Cloud Translation ----
export async function translateGoogle(text, fromLang, toLang, config) {
    const params = new URLSearchParams({
        key: required(config.api_key, 'API Key'),
        q: text,
        source: fromLang,
        target: toLang,
        format: 'text',
    })
    const data = await fetchJSON(`https://translation.googleapis.com/language/translate/v2?${params}`, {}, 'Google', TIMEOUT.short)
    const translated = data?.data?.translations?.[0]?.translatedText
    if (typeof translated !== 'string') throw new Error(t('no_response_from', 'Google'))
    return translated
}

// ---- MyMemory ----
export async function translateMyMemory(text, fromLang, toLang, config) {
    const params = new URLSearchParams({ q: text, langpair: `${fromLang}|${toLang}` })
    if (config.api_key) params.set('key', config.api_key)
    const data = await fetchJSON(`https://api.mymemory.translated.net/get?${params}`, {}, 'MyMemory')
    if (data?.responseStatus !== 200) throw new Error(data?.responseDetails || t('no_response_from', 'MyMemory'))
    return data.responseData.translatedText
}
