// Python 版 scripts/physton_prompt/history.py の移植。
// タブごとにメモリへ持つと複数タブで互いに上書きしてしまうので、
// 毎回 IndexedDB の最新値をロック付きで読み書きする (storage.update)。
import { storage, clone } from './store.js'

const MAX = 100

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)
const now = () => Math.floor(Date.now() / 1000)

const hKey = type => 'history.' + type
const fKey = type => 'favorite.' + type

const read = async key => (await storage.get(key)) || []
// list を書き換える関数 fn(list) -> result。result が false のときは保存しない
const modify = (key, fn) => storage.update(key, async current => {
    const list = current || []
    const result = await fn(list)
    return { value: result === false ? undefined : list, result }
})

// id の項目を primary 側で更新し、見つかれば secondary 側 (履歴 <-> お気に入り) も同じ内容にする。
// ロックは常に 1 つずつ取るので、取得順によるデッドロックは起きない
async function updateBoth(primaryKey, secondaryKey, id, patch) {
    const apply = list => {
        const item = list.find(x => x.id === id)
        if (!item) return false
        Object.assign(item, patch)
        return true
    }
    const found = await modify(primaryKey, apply)
    if (found) await modify(secondaryKey, apply)
    return found
}

export const history = {
    async getHistories(type) {
        const [histories, favorites] = await Promise.all([read(hKey(type)), read(fKey(type))])
        const favIds = new Set(favorites.map(f => f.id))
        return histories.map(h => ({ ...h, is_favorite: favIds.has(h.id) }))
    },

    getFavorites(type) {
        return read(fKey(type))
    },

    async pushHistory(type, tags, prompt, name = '') {
        const item = { id: uuid(), time: now(), name, tags: clone(tags), prompt }
        await modify(hKey(type), list => {
            while (list.length >= MAX) list.shift()
            list.push(item)
            return true
        })
        return item
    },

    async pushFavorite(type, tags, prompt, name = '') {
        const item = { id: uuid(), time: now(), name, tags: clone(tags), prompt }
        await modify(fKey(type), list => {
            list.push(item)
            return true
        })
        return item
    },

    moveFavorite(type, id, delta) {
        return modify(fKey(type), list => {
            const index = list.findIndex(f => f.id === id)
            const to = index + delta
            if (index < 0 || to < 0 || to >= list.length) return false
            list.splice(to, 0, list.splice(index, 1)[0])
            return true
        })
    },

    moveUpFavorite(type, id) {
        return this.moveFavorite(type, id, -1)
    },

    moveDownFavorite(type, id) {
        return this.moveFavorite(type, id, 1)
    },

    async getLatestHistory(type) {
        const list = await read(hKey(type))
        return list.length ? list[list.length - 1] : null
    },

    setHistory(type, id, tags, prompt, name) {
        return updateBoth(hKey(type), fKey(type), id, { tags: clone(tags), prompt, name })
    },

    setHistoryName(type, id, name) {
        return updateBoth(hKey(type), fKey(type), id, { name })
    },

    setFavoriteName(type, id, name) {
        return updateBoth(fKey(type), hKey(type), id, { name })
    },

    async doFavorite(type, id) {
        const history = (await read(hKey(type))).find(h => h.id === id)
        if (!history) return false
        return modify(fKey(type), list => {
            if (list.some(f => f.id === id)) return false
            list.push(history)
            return true
        })
    },

    unFavorite(type, id) {
        return modify(fKey(type), list => {
            const index = list.findIndex(f => f.id === id)
            if (index < 0) return false
            list.splice(index, 1)
            return true
        })
    },

    removeHistory(type, id) {
        return modify(hKey(type), list => {
            const index = list.findIndex(h => h.id === id)
            if (index < 0) return false
            list.splice(index, 1)
            return true
        })
    },

    async removeHistories(type) {
        await storage.set(hKey(type), [])
        return true
    },
}
