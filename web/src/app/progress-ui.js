// モデルのダウンロード / 読み込みの進捗を画面下部に表示する
import { PROGRESS_EVENT } from '../backend/progress.js'
import { t } from '../i18n.js'

const mb = n => (n / 1024 / 1024).toFixed(0)

export function setupProgress() {
    const box = document.getElementById('aio-progress')
    if (!box) return
    const label = box.querySelector('.aio-progress-label')
    const bar = box.querySelector('.aio-progress-bar > span')
    let hideTimer = null

    window.addEventListener(PROGRESS_EVENT, ({ detail }) => {
        clearTimeout(hideTimer)
        box.hidden = false
        box.classList.toggle('is-error', detail.phase === 'error')
        box.classList.toggle('is-indeterminate', detail.phase === 'cache' || (detail.phase === 'download' && !detail.total))
        if (detail.phase === 'download') {
            bar.style.width = detail.total ? `${((detail.loaded / detail.total) * 100).toFixed(1)}%` : '0'
            label.textContent = detail.total
                ? t('progress_download', detail.label, mb(detail.loaded), mb(detail.total))
                : t('progress_prepare', detail.label)
        } else if (detail.phase === 'cache') {
            bar.style.width = '0'
            label.textContent = t('progress_cache', detail.label)
        } else if (detail.phase === 'done') {
            bar.style.width = '100%'
            label.textContent = t('progress_done', detail.label)
            hideTimer = setTimeout(() => (box.hidden = true), 2500)
        } else if (detail.phase === 'error') {
            label.textContent = t('progress_error', detail.label, detail.message)
            hideTimer = setTimeout(() => (box.hidden = true), 10000)
        }
    })
}
