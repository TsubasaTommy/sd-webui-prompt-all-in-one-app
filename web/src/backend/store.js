// Python 版 Storage (storage/*.json) のブラウザ版。IndexedDB に保存する。
// IndexedDB が使えない環境 (サイトデータのブロック、一部のプライベートモード) ではメモリに保存して動かし続ける。
import { createStore, get, getMany, set, del, entries } from 'idb-keyval'
import { createQueue } from './queue.js'

export const STORAGE_UNAVAILABLE_EVENT = 'aio:storage-unavailable'

// ---- 保存先 (IndexedDB / メモリ) ----
function memoryBackend() {
    const map = new Map()
    return {
        get: async key => map.get(key),
        getMany: async keys => keys.map(key => map.get(key)),
        set: async (key, value) => void map.set(key, value),
        del: async key => void map.delete(key),
        entries: async () => [...map.entries()],
    }
}

function idbBackend(dbName, storeName) {
    const store = createStore(dbName, storeName)
    return {
        get: key => get(key, store),
        getMany: keys => getMany(keys, store),
        set: (key, value) => set(key, value, store),
        del: key => del(key, store),
        entries: () => entries(store),
    }
}

let idbAvailable = null
function checkIndexedDB() {
    if (!idbAvailable) {
        idbAvailable = new Promise(resolve => {
            try {
                const req = indexedDB.open('prompt-all-in-one-probe')
                req.onsuccess = () => {
                    req.result.close()
                    resolve(true)
                }
                req.onerror = () => resolve(false)
                req.onblocked = () => resolve(true)
            } catch {
                resolve(false)
            }
        }).then(ok => {
            if (!ok) window.dispatchEvent(new CustomEvent(STORAGE_UNAVAILABLE_EVENT))
            return ok
        })
    }
    return idbAvailable
}

function backend(dbName, storeName) {
    let resolved = null
    return async () => {
        if (!resolved) resolved = (await checkIndexedDB()) ? idbBackend(dbName, storeName) : memoryBackend()
        return resolved
    }
}

const kv = backend('prompt-all-in-one', 'storage')
const csvText = backend('prompt-all-in-one-csv', 'csv')
const csvMeta = backend('prompt-all-in-one-csv-meta', 'meta') // name -> size (一覧表示で本文を読まないため)

// JSON で表せる値の深いコピー。保存する前に Vue の Proxy などを剥がすのにも使う
export const clone = data => (data === undefined ? null : JSON.parse(JSON.stringify(data)))

// 利用者がデータを保存したときに、ブラウザによる自動削除の対象から外してもらう。
// 上流アプリは起動時にも設定を書き込むので、クリックやキー入力があった後の保存でだけ頼む
// (ページを開いただけで Firefox の確認ダイアログが出ないように)
let persistRequested = false
let userActed = false
if (typeof window !== 'undefined') {
    for (const type of ['pointerdown', 'keydown']) {
        window.addEventListener(type, () => (userActed = true), { once: true, capture: true })
    }
}
function requestPersist() {
    if (persistRequested || !userActed) return
    persistRequested = true
    navigator.storage?.persisted?.().then(persisted => {
        if (!persisted) return navigator.storage.persist()
    }).catch(() => {})
}

async function write(store, key, value) {
    await (await store()).set(key, value)
    requestPersist()
}

// 同じキーへの read-modify-write を直列化する (Python 版のロックファイル相当)。
// Web Locks API ならタブをまたいで排他できる。使えない環境ではタブ内だけで直列化する。
const queues = new Map()
export function withLock(key, fn) {
    if (typeof navigator !== 'undefined' && navigator.locks) {
        return navigator.locks.request(`prompt-all-in-one:${key}`, fn)
    }
    if (!queues.has(key)) queues.set(key, createQueue())
    return queues.get(key)(fn)
}

const orNull = v => (v === undefined ? null : v)

export const storage = {
    async get(key) {
        return orNull(await (await kv()).get(key))
    },
    async getMany(keys) {
        const values = await (await kv()).getMany(keys)
        return Object.fromEntries(keys.map((key, i) => [key, orNull(values[i])]))
    },
    set(key, data) {
        return withLock(key, () => write(kv, key, clone(data)))
    },
    /**
     * ロックを取ったまま最新の値を読み、fn の戻り値 { value, result } を保存する。
     * value が undefined なら保存しない。
     */
    update(key, fn) {
        return withLock(key, async () => {
            const current = orNull(await (await kv()).get(key))
            const { value, result } = await fn(current)
            if (value !== undefined) await write(kv, key, clone(value))
            return result
        })
    },
    listPush(key, item) {
        return this.update(key, list => ({ value: [...(list || []), item] }))
    },
    listPop(key) {
        return this.update(key, list => {
            list = list || []
            const item = list.pop()
            return { value: list, result: item ?? null }
        })
    },
    listShift(key) {
        return this.update(key, list => {
            list = list || []
            const item = list.shift()
            return { value: list, result: item ?? null }
        })
    },
    listRemove(key, index) {
        return this.update(key, list => {
            list = list || []
            list.splice(index, 1)
            return { value: list }
        })
    },
    async listGet(key, index) {
        const list = (await this.get(key)) || []
        return list[index] ?? null
    },
    listClear(key) {
        return withLock(key, () => write(kv, key, []))
    },

    // ---- バックアップ ----
    async exportAll() {
        return Object.fromEntries(await (await kv()).entries())
    },
    // 書き込み中の read-modify-write (他タブ含む) と混ざらないよう、キーごとにロックを取る
    async importAll(data) {
        await Promise.all(Object.entries(data).map(([k, v]) => withLock(k, () => write(kv, k, clone(v)))))
    },
}

// tagcomplete 用の翻訳 CSV (ユーザーが追加したファイル)。一覧は meta 側が正
export const csvFiles = {
    async list() {
        return (await (await csvMeta()).entries()).map(([name, size]) => ({ name, size }))
    },
    async get(name) {
        return orNull(await (await csvText()).get(name))
    },
    // 本文とサイズは別 DB なので、サイズの保存に失敗したら本文も消して取り残しを防ぐ
    async set(name, text) {
        await write(csvText, name, text)
        try {
            await write(csvMeta, name, new Blob([text]).size)
        } catch (e) {
            await (await csvText()).del(name).catch(() => {})
            throw e
        }
    },
    // 一覧 (meta) から先に消す。途中で失敗しても「一覧にあるのに中身がない」状態にはならない
    async delete(name) {
        await (await csvMeta()).del(name)
        await (await csvText()).del(name)
    },
    // 一覧にあるものだけを書き出す (削除に失敗して本文だけ残ったものは含めない)
    async exportAll() {
        const names = (await this.list()).map(f => f.name)
        const texts = await (await csvText()).getMany(names)
        return Object.fromEntries(names.flatMap((name, i) => (typeof texts[i] === 'string' ? [[name, texts[i]]] : [])))
    },
}
