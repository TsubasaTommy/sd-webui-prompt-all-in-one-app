// GitHub Pages で配信している静的データ (public/aio/) の読み込み
import { assetUrl } from './asset.js'
import { BUILD_ID } from '../aio/version.js'

const cache = new Map()

// 同じファイルは 1 度だけ取得する。戻り値は共有されるので、書き換える側で複製すること。
// ?v=ビルドID を付けて、デプロイ直後に新しい JS と古い JSON (Pages は 10 分キャッシュ) が混ざらないようにする
export function fetchStatic(path, type = 'json') {
    const key = `${type}:${path}`
    if (!cache.has(key)) {
        const promise = fetch(`${assetUrl(path)}?v=${encodeURIComponent(BUILD_ID)}`).then(res => {
            if (!res.ok) throw Object.assign(new Error(`${res.status} ${path}`), { response: { status: res.status } })
            return type === 'json' ? res.json() : res.text()
        })
        promise.catch(() => cache.delete(key))
        cache.set(key, promise)
    }
    return cache.get(key)
}

export const loadTranslateApis = () => fetchStatic('aio/translate_apis.json')
export const loadI18n = () => fetchStatic('aio/i18n.json')
export const loadApiPrivacy = () => fetchStatic('aio/api_privacy.json')

export const apiItems = apis => apis.apis.flatMap(g => g.children)

// 翻訳 API の定義を key で引く (上流 common.getTranslateApiItem と違い、見つからなければ undefined)
export const findApi = (apis, key) => apiItems(apis).find(i => i.key === key)
