// ページ起動処理: 上流 Vue アプリを読み込む前に、サーバー依存の部分を差し替える
import common from '@/utils/common'
import { BUILD_ID } from '../aio/version.js'
import { assetUrl } from '../backend/asset.js'
import { STORAGE_UNAVAILABLE_EVENT } from '../backend/store.js'
import { applyShellI18n, t } from '../i18n.js'
import { setupDataTools } from './data-tools.js'
import { setupProgress } from './progress-ui.js'

// 上流は "<origin>/physton_prompt/styles?file=xxx" から CSS を読むので、静的ファイルに向け直す。
// Python 版は毎回 ?t=時刻 で取り直していたが、静的ファイルなのでデプロイごとにだけ取り直す
common.loadCSS = function (file, id = '', remove = true, cache = false, gradioAPP = true) {
    if (remove) this.removeCSS(id, gradioAPP)
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = assetUrl('aio/styles/' + file) + (cache ? '' : `?v=${encodeURIComponent(BUILD_ID)}`)
    ;(gradioAPP ? this.gradioApp() : document.body).appendChild(link)
}

// 画面上部のお知らせ。reload: true なら再読み込みボタンを出す
function showBanner(message, { reload = false } = {}) {
    const banner = document.getElementById('aio-banner')
    if (!banner) return
    banner.querySelector('.aio-banner-text').textContent = message
    banner.querySelector('#aio-reload').hidden = !reload
    banner.hidden = false
}
document.getElementById('aio-reload')?.addEventListener('click', () => location.reload())

// デプロイで古いチャンクが消えた (開きっぱなしのタブなど) ときは再読み込みを促す。
// preventDefault はしない (すると失敗した import が undefined で解決され、呼び出し側が壊れる)
window.addEventListener('vite:preloadError', () => showBanner(t('reload_needed'), { reload: true }))

// 動的 import の読み込み失敗 (ブラウザごとに文言が違う)
const isChunkLoadError = error => /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to fetch/i.test(String(error?.message || error))

window.addEventListener(STORAGE_UNAVAILABLE_EVENT, () => showBanner(t('storage_unavailable')))

// txt2img / img2img タブ切り替え
function setupTabs() {
    const headers = document.querySelectorAll('#tab-headers .tab-header-item')
    const switchTab = tab => {
        headers.forEach(h => h.classList.toggle('active', h.dataset.tab === tab))
        document.querySelectorAll('#tabs > .tabitem').forEach(el => {
            el.style.display = el.id === tab ? '' : 'none'
        })
    }
    headers.forEach(h => h.addEventListener('click', () => switchTab(h.dataset.tab)))
    switchTab('tab_txt2img')
}

applyShellI18n()
setupTabs()
setupProgress()
setupDataTools()

// 上流のエントリ (onUiLoaded にコールバックを登録する)
import('@/main.js').catch(error => {
    console.error(error)
    if (isChunkLoadError(error)) showBanner(t('reload_needed'), { reload: true })
    else showBanner(t('startup_failed', error?.message || error))
})
