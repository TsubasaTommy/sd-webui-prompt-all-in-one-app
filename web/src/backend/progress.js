// モデルのダウンロード進捗などをページ側の UI に伝えるためのイベント
export const PROGRESS_EVENT = 'aio:progress'

export function emitProgress(detail) {
    window.dispatchEvent(new CustomEvent(PROGRESS_EVENT, { detail }))
}
