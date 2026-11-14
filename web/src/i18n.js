// 表示文言。上流 i18n.json にあるキーはその訳 (100 以上の言語) を使い、
// Web 版で追加した文言は日本語と英語を用意する (その他の言語は英語)。
import common from '@/utils/common'

export const LANGUAGE_EVENT = 'aio:language'

const SHELL = {
    ja: {
        note: 'データはこのブラウザ内にだけ保存されます',
        data: 'データ管理',
        backup: 'バックアップ',
        backup_desc: '履歴・お気に入り・設定はこのブラウザ内 (IndexedDB) に保存されています。別の端末やブラウザに移すときは書き出して読み込んでください。',
        export: '書き出す (.json)',
        include_keys: 'API キーも含める (このファイルは人と共有しないでください)',
        import: '読み込む',
        import_hint: '旧アプリ (Python 版) の storage フォルダ内の .json ファイルもまとめて選択すれば移行できます。',
        csv_title: '翻訳用 CSV (tagcomplete)',
        csv_desc: 'a1111-sd-webui-tagcomplete 形式の翻訳 CSV を追加できます。',
        csv_add: 'CSV を追加',
        none_yet: 'まだありません',
        delete: '削除',
        close: '閉じる',
        storage_title: '保存容量',
        storage_usage: 'このサイトの使用量: 約 {0} MB',
        storage_persisted: 'ブラウザによる自動削除から保護されています。',
        storage_not_persisted: 'ブラウザの空き容量が少なくなると、データが自動で削除されることがあります。定期的にバックアップしてください。',
        model_cache_delete: '翻訳モデルのキャッシュを削除',
        model_cache_deleted: '翻訳モデルのキャッシュを削除しました。',
        exported: '{0} 件のデータを書き出しました。',
        exported_csv: '{0} 件のデータと CSV {1} 件を書き出しました。',
        exported_keys_removed: 'API キーは含めていません。',
        import_confirm: '{0} 件のデータを読み込みます。同じ項目は上書きされます。よろしいですか？',
        import_skipped: '読み込めなかったファイル ({0} 件) は飛ばします: {1}',
        import_nothing: '読み込めるデータがありませんでした。',
        import_done: '読み込みました。ページを再読み込みします…',
        import_failed: '読み込みに失敗しました: {0}',
        csv_added: '{0} 件の CSV を追加しました。翻訳設定の「tagcomplete」で選択できます。',
        csv_failed: '追加できなかったファイル:',
        quota_exceeded: 'ブラウザの保存容量が足りません',
        progress_download: '{0} をダウンロード中… {1} / {2} MB (初回のみ)',
        progress_prepare: '{0} を準備中…',
        progress_cache: '{0} をキャッシュから読み込み中…',
        progress_done: '{0} の準備ができました',
        progress_error: '{0} の読み込みに失敗しました: {1}',
        reload_needed: '新しいバージョンが公開されています。ページを再読み込みしてください。',
        reload: '再読み込み',
        startup_failed: '起動に失敗しました: {0}',
        storage_unavailable: 'このブラウザではデータを保存できません (サイトデータがブロックされているか、プライベートモードです)。ページを閉じると履歴や設定は消えます。',
        export_failed: '書き出しに失敗しました: {0}',
        model_cache_delete_failed: 'キャッシュの削除に失敗しました: {0}',
        web_api_unavailable: 'この翻訳 API は Web 版では使えません。翻訳設定で別の API を選んでください。',
        choose_other_api: '翻訳設定で別の API (MyMemory など) を選んでください。',
        connect_failed: '{0} に接続できませんでした (ネットワークまたは CORS の設定を確認してください): {1}',
        timeout: '{0} が {1} 秒以内に応答しませんでした',
        truncated: '翻訳が途中で打ち切られました (出力が長すぎます)',
        model_load_failed: 'モデルの読み込みに失敗しました: {0}',
        response_mismatch: '{0} の応答が不正です ({1} 件送信、{2} 件受信)',
        no_install_needed: 'Web 版ではパッケージのインストールは不要です。',
        mbart50_unavailable: 'Web 版では mbart50 は使えません。PLaMo 3 Translate を使ってください。',
    },
    en: {
        note: 'Your data is stored only in this browser',
        data: 'Data',
        backup: 'Backup',
        backup_desc: 'Histories, favorites and settings are stored in this browser (IndexedDB). Export and import them to move to another device or browser.',
        export: 'Export (.json)',
        include_keys: 'Include API keys (do not share this file)',
        import: 'Import',
        import_hint: 'To migrate from the Python version, select all .json files in its storage folder.',
        csv_title: 'Translation CSV (tagcomplete)',
        csv_desc: 'Add translation CSV files in the a1111-sd-webui-tagcomplete format.',
        csv_add: 'Add CSV',
        none_yet: 'None yet',
        delete: 'Delete',
        close: 'Close',
        storage_title: 'Storage',
        storage_usage: 'Used by this site: about {0} MB',
        storage_persisted: 'Protected from automatic deletion by the browser.',
        storage_not_persisted: 'The browser may delete this data when disk space runs low. Please back up regularly.',
        model_cache_delete: 'Delete cached translation models',
        model_cache_deleted: 'Cached translation models were deleted.',
        exported: 'Exported {0} items.',
        exported_csv: 'Exported {0} items and {1} CSV files.',
        exported_keys_removed: 'API keys were not included.',
        import_confirm: 'Import {0} items? Existing items with the same name will be overwritten.',
        import_skipped: 'Skipping {0} unreadable files: {1}',
        import_nothing: 'Nothing to import.',
        import_done: 'Imported. Reloading…',
        import_failed: 'Import failed: {0}',
        csv_added: 'Added {0} CSV files. Select one under "tagcomplete" in the translation settings.',
        csv_failed: 'Could not add:',
        quota_exceeded: 'Not enough browser storage',
        progress_download: 'Downloading {0}… {1} / {2} MB (first time only)',
        progress_prepare: 'Preparing {0}…',
        progress_cache: 'Loading {0} from cache…',
        progress_done: '{0} is ready',
        progress_error: 'Failed to load {0}: {1}',
        reload_needed: 'A new version has been published. Please reload the page.',
        reload: 'Reload',
        startup_failed: 'Failed to start: {0}',
        storage_unavailable: 'This browser cannot save data (site data is blocked or private browsing is on). Histories and settings will be lost when you close the page.',
        export_failed: 'Export failed: {0}',
        model_cache_delete_failed: 'Failed to delete the cache: {0}',
        web_api_unavailable: 'This translation API is not available in the web version. Please choose another one in the translation settings.',
        choose_other_api: 'Please choose another API (e.g. MyMemory) in the translation settings.',
        connect_failed: 'Could not connect to {0} (check your network or CORS settings): {1}',
        timeout: '{0} did not respond within {1} seconds',
        truncated: 'The translation was cut off (output too long)',
        model_load_failed: 'Failed to load the model: {0}',
        response_mismatch: 'Invalid response from {0} (sent {1}, received {2})',
        no_install_needed: 'Installing packages is not needed in the web version.',
        mbart50_unavailable: 'mbart50 is not available in the web version. Please use PLaMo 3 Translate.',
    },
}

let languageCode = (typeof navigator !== 'undefined' && navigator.language || 'en').replace('-', '_')
let languages = null // 上流 i18n.json の { code: { lang: {...} } }

export function setLanguages(i18n) {
    languages = Object.fromEntries(i18n.languages.map(l => [l.code, l]))
}

export function setLanguage(code) {
    if (!code || code === languageCode) return
    languageCode = code
    applyShellI18n()
    window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: code }))
}

const fill = (text, params) => params.reduce((s, p, i) => s.split(`{${i}}`).join(String(p)), text)

export function t(key, ...params) {
    const shell = (languageCode.startsWith('ja') ? SHELL.ja : SHELL.en)[key]
    if (shell !== undefined) return fill(shell, params)
    if (languages?.en_US?.lang?.[key] !== undefined) return fill(common.getLang(key, languageCode, languages), params)
    return fill(key, params)
}

// data-i18n="key" の要素の文字列を差し替える
export function applyShellI18n(root = document) {
    document.documentElement.lang = languageCode.startsWith('ja') ? 'ja' : 'en'
    root.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.dataset.i18n)
    })
}
