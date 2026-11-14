// PLaMo 3 Translate をブラウザ内 (wllama: llama.cpp の WebAssembly/WebGPU 版) で実行する。
// モデルは Hugging Face から直接取得し、wllama のキャッシュ (OPFS) に保存される。
// 2 回目以降はキャッシュから読むのでネットワークは不要。
import { emitProgress } from '../progress.js'
import { createQueue } from '../queue.js'
import { t } from '../../i18n.js'

const HF = 'https://huggingface.co'
const MODELS = {
    '0.8b': `${HF}/pfnet/plamo-3-translate-0.8b-GGUF/resolve/main/plamo-3-translate-0.8b-Q4_K_M.gguf`,
    '2b': `${HF}/pfnet/plamo-3-translate-2b-GGUF/resolve/main/plamo-3-translate-2b-Q4_K_M.gguf`,
}
const MAX_TOKENS = 1024

let current = null // { size, wllama }
// wllama には 1 リクエストずつ処理させる
const serial = createQueue()

// wllama (JS + 10MB の wasm) は PLaMo を使うときだけ読み込む
async function createWllama() {
    const [{ Wllama, LoggerWithoutDebug }, { default: wasmUrl }] = await Promise.all([
        import('@wllama/wllama'),
        import('@wllama/wllama/esm/wasm/wllama.wasm?url'),
    ])
    return new Wllama({ default: wasmUrl }, { logger: LoggerWithoutDebug })
}

// serial() の中からだけ呼ぶので、同時に 2 つ読み込まれることはない
async function load(size) {
    if (!MODELS[size]) size = '0.8b'
    if (current?.size === size && current.wllama.isModelLoaded()) return current.wllama

    if (current) {
        await current.wllama.exit().catch(() => {})
        current = null
    }
    const label = `PLaMo 3 Translate ${size}`
    const url = MODELS[size]
    let wllama
    try {
        wllama = await createWllama()
    } catch (e) {
        // デプロイで古いチャンクが消えた場合など (再読み込みの案内は boot.js が出す)
        emitProgress({ phase: 'error', label, message: String(e?.message || e) })
        throw new Error(t('model_load_failed', e?.message || e))
    }
    try {
        const cached = (await wllama.modelManager.getModels()).some(m => m.url === url)
        emitProgress({ phase: cached ? 'cache' : 'download', label, loaded: 0, total: 0 })
        // loadModelFromHF は毎回 HF API (ファイル一覧) を叩くのでオフラインで失敗する。
        // URL を直接渡すと、キャッシュにあればネットワークに触れずに読み込める
        await wllama.loadModelFromUrl(url, {
            n_ctx: 4096,
            jinja: true,
            prefill_assistant: false,
            progressCallback: ({ loaded, total }) => {
                if (!cached) emitProgress({ phase: 'download', label, loaded, total })
            },
        })
    } catch (e) {
        // 失敗したインスタンスの worker / WASM / WebGPU メモリを解放する
        await wllama.exit().catch(() => {})
        emitProgress({ phase: 'error', label, message: String(e?.message || e) })
        throw new Error(t('model_load_failed', e?.message || e))
    }
    emitProgress({ phase: 'done', label })
    current = { size, wllama }
    return wllama
}

export function translatePlamoBrowser(text, fromLang, toLang, config) {
    return serial(async () => {
        const wllama = await load(config.model || '0.8b')
        const res = await wllama.createChatCompletion({
            messages: [{ role: 'user', content: text }],
            chat_template_kwargs: { source_lang: fromLang, target_lang: toLang },
            temperature: 0,
            max_tokens: MAX_TOKENS,
        })
        const choice = res?.choices?.[0]
        if (choice?.finish_reason === 'length') throw new Error(t('truncated'))
        const content = choice?.message?.content
        if (typeof content !== 'string') throw new Error(t('no_response_from', 'PLaMo'))
        return content.trim()
    })
}

// このアプリのモデルだけを削除する (データ管理画面から)。
// GitHub Pages では同じオーナーの別サイトとオリジン (キャッシュ) を共有するので、全消し (modelManager.clear) はしない
export function clearModelCache() {
    return serial(async () => {
        if (current) {
            await current.wllama.exit().catch(() => {})
            current = null
        }
        const wllama = await createWllama()
        try {
            const ours = new Set(Object.values(MODELS))
            const models = await wllama.modelManager.getModels({ includeInvalid: true })
            for (const model of models) {
                if (ours.has(model.url)) await model.remove()
            }
        } finally {
            await wllama.exit().catch(() => {})
        }
    })
}
