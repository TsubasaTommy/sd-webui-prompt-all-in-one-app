// データ管理: バックアップ / 復元 / 翻訳用 CSV の追加 / 保存容量。
// データはすべてこのブラウザの IndexedDB にあるので、別の端末へ移すときはここから書き出す。
import { storage, csvFiles } from '../backend/store.js'
import { loadApiPrivacy } from '../backend/static-data.js'
import { stripApiKeys, keepStoredApiKeys } from '../backend/privacy.js'
import { t, LANGUAGE_EVENT } from '../i18n.js'

function download(filename, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: filename })
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ファイル名に使うローカル日付 (toISOString は UTC なので日本の朝だと前日になる)
function localDate(d = new Date()) {
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

async function renderCsvList(list) {
    const files = await csvFiles.list()
    list.replaceChildren(...files.map(({ name, size }) => {
        const li = document.createElement('li')
        const span = document.createElement('span')
        span.textContent = `${name} (${(size / 1024).toFixed(0)} KB)`
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.textContent = t('delete')
        btn.addEventListener('click', async () => {
            await csvFiles.delete(name)
            renderCsvList(list)
        })
        li.append(span, btn)
        return li
    }))
    if (!files.length) {
        const li = document.createElement('li')
        li.className = 'aio-empty'
        li.textContent = t('none_yet')
        list.append(li)
    }
}

async function renderStorage(dialog) {
    const usage = dialog.querySelector('.aio-storage-usage')
    const persist = dialog.querySelector('.aio-storage-persist')
    try {
        const { usage: used = 0 } = (await navigator.storage?.estimate?.()) || {}
        usage.textContent = t('storage_usage', (used / 1024 / 1024).toFixed(0))
        const persisted = await navigator.storage?.persisted?.()
        persist.textContent = t(persisted ? 'storage_persisted' : 'storage_not_persisted')
    } catch {
        usage.textContent = ''
        persist.textContent = ''
    }
}

export function setupDataTools() {
    const dialog = document.getElementById('aio-data-dialog')
    if (!dialog) return
    const status = dialog.querySelector('.aio-status')
    const csvList = dialog.querySelector('.aio-csv-list')
    const includeKeys = dialog.querySelector('[data-option="include-keys"]')
    const say = msg => (status.textContent = msg)

    const refresh = () => {
        renderCsvList(csvList)
        renderStorage(dialog)
    }
    window.addEventListener(LANGUAGE_EVENT, () => dialog.open && refresh())

    document.getElementById('aio-open-data').addEventListener('click', () => {
        say('')
        refresh()
        dialog.showModal()
    })

    dialog.querySelector('[data-action="export"]').addEventListener('click', async () => {
        try {
            const [stored, csv, privacy] = await Promise.all([storage.exportAll(), csvFiles.exportAll(), loadApiPrivacy()])
            // 既定では API キーを含めない (バックアップファイルを共有・アップロードしても漏れないように)。
            // どの項目が秘密かわからない翻訳 API の設定は丸ごと除く
            const data = includeKeys.checked
                ? stored
                : Object.fromEntries(Object.entries(stored).flatMap(([key, value]) => {
                    const stripped = stripApiKeys(key, value, privacy)
                    return stripped === undefined ? [] : [[key, stripped]]
                }))
            download(`prompt-all-in-one-backup-${localDate()}.json`, JSON.stringify({ format: 'prompt-all-in-one-web', version: 2, data, csv }, null, 2))
            const count = Object.keys(data).length
            const csvCount = Object.keys(csv).length
            const lines = [csvCount ? t('exported_csv', count, csvCount) : t('exported', count)]
            if (!includeKeys.checked) lines.push(t('exported_keys_removed'))
            say(lines.join('\n'))
        } catch (err) {
            say(t('export_failed', err?.message || err))
        }
    })

    // バックアップ JSON、または旧アプリの storage/*.json (複数可) を読み込む
    dialog.querySelector('[data-action="import"]').addEventListener('change', async e => {
        const files = [...e.target.files]
        e.target.value = ''
        if (!files.length) return
        try {
            const merged = {}
            const csv = {}
            const skipped = []
            for (const file of files) {
                // 空や壊れたファイル、旧 storage フォルダの *.lock は飛ばす (Python 版 Storage も読めないファイルは無視していた)
                if (!/\.json$/i.test(file.name)) {
                    skipped.push(file.name)
                    continue
                }
                let json
                try {
                    json = JSON.parse(await file.text())
                } catch {
                    skipped.push(file.name)
                    continue
                }
                if (json && json.format === 'prompt-all-in-one-web') {
                    Object.assign(merged, json.data || {})
                    Object.assign(csv, json.csv || {})
                } else if (json !== null) {
                    // 旧アプリの storage フォルダ: ファイル名 (拡張子なし) がキー
                    merged[file.name.replace(/\.json$/i, '')] = json
                } else {
                    skipped.push(file.name)
                }
            }
            const count = Object.keys(merged).length + Object.keys(csv).length
            const skippedMsg = skipped.length ? '\n' + t('import_skipped', skipped.length, skipped.join(', ')) : ''
            if (!count) {
                say(t('import_nothing') + skippedMsg)
                return
            }
            if (!confirm(t('import_confirm', count) + skippedMsg)) return
            // キーを含まないバックアップでも、この端末に保存済みの API キーは消さない
            const [privacy, current] = await Promise.all([loadApiPrivacy(), storage.getMany(Object.keys(merged))])
            for (const key of Object.keys(merged)) merged[key] = keepStoredApiKeys(key, merged[key], current[key], privacy)
            await storage.importAll(merged)
            for (const [name, text] of Object.entries(csv)) await csvFiles.set(name, text)
            say(t('import_done'))
            setTimeout(() => location.reload(), 800)
        } catch (err) {
            say(t('import_failed', err.message))
        }
    })

    dialog.querySelector('[data-action="csv"]').addEventListener('change', async e => {
        const files = [...e.target.files]
        e.target.value = ''
        const failed = []
        for (const file of files) {
            try {
                await csvFiles.set(file.name, await file.text())
            } catch (err) {
                failed.push(`${file.name}: ${err.name === 'QuotaExceededError' ? t('quota_exceeded') : err.message}`)
            }
        }
        refresh()
        const added = files.length - failed.length
        const lines = []
        if (added) lines.push(t('csv_added', added))
        if (failed.length) lines.push(t('csv_failed'), ...failed)
        say(lines.join('\n'))
    })

    dialog.querySelector('[data-action="clear-model"]').addEventListener('click', async () => {
        try {
            const { clearModelCache } = await import('../backend/translate/plamo-browser.js')
            await clearModelCache()
            say(t('model_cache_deleted'))
        } catch (err) {
            say(t('model_cache_delete_failed', err?.message || err))
        } finally {
            renderStorage(dialog)
        }
    })

    dialog.querySelector('[data-action="close"]').addEventListener('click', () => dialog.close())
}
