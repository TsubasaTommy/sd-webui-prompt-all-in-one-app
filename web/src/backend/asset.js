// GitHub Pages のサブパス (/<repo>/) を考慮した静的ファイルの URL
const BASE = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/'

export function assetUrl(path) {
    return BASE + String(path).replace(/^\/+/, '')
}
