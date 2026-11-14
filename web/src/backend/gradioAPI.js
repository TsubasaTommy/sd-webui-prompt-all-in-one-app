// 上流の src/utils/gradioAPI.js (Python サーバーへの HTTP 呼び出し) を、
// ブラウザ内だけで完結する実装に差し替えたもの。メソッド名と戻り値は上流と同じ。
// vite の alias で "@/utils/gradioAPI" がこのファイルに解決される。
import common from '@/utils/common'
import { storage, csvFiles } from './store.js'
import { history } from './history.js'
import { translate } from './translate/index.js'
import { genOpenAI } from './translate/remote.js'
import { maskApiConfig, unmaskApiConfig } from './privacy.js'
import { fetchStatic, loadTranslateApis as translateApis, loadI18n, loadApiPrivacy, findApi } from './static-data.js'
import { UPSTREAM_COMMIT } from '../aio/version.js'
import { t, setLanguage, setLanguages } from '../i18n.js'

const CSV_KEY_PREFIX = '\\extensions\\sd-webui-prompt-all-in-one\\tags\\'
const DEFAULT_API = 'plamo3_browser'
const FALLBACK_API = 'myMemory_free' // PLaMo 3 Translate が対応していない言語向け

// fetchStatic の値は共有キャッシュなので、上流コードへ渡すときは複製する
// (HTTP だった上流と同じく毎回新しいオブジェクトを渡す。上流コードが受け取った値を書き換えるため)

// 上流 App.vue と同じ順で、初回に使われる言語を決める (保存値 -> ブラウザの言語 -> i18n の既定)
async function initialLanguage(i18n) {
    // 保存先が読めなくても起動は続ける (ブラウザの言語で始める)
    const stored = await storage.get('languageCode').catch(() => null)
    if (stored && i18n.languages.some(l => l.code === stored)) return stored
    const browserLang = navigator.language || ''
    const match = browserLang && i18n.languages.find(l => common.isSameLang(l.code, browserLang))
    return match ? match.code : i18n.default
}

// 旧版から移行した設定などで、Web 版にない翻訳 API が保存されていたら未設定扱いにする (既定の API が使われる)
function sanitize(key, value, apis, privacy) {
    if (key === 'translateApi' && value !== null && !findApi(apis, value)) return null
    return maskApiConfig(key, value, privacy)
}

// 保存済みの値と突き合わせて、* で伏せた API キーを本物に戻してから保存する
async function saveData(key, data) {
    const privacy = await loadApiPrivacy()
    await storage.update(key, stored => ({ value: unmaskApiConfig(key, data, stored, privacy) }))
    if (key === 'languageCode') setLanguage(data) // Web 版で追加した文言も切り替える
}

// 画面から渡される api_config は伏せ字のことがあるので、保存済みの値で戻す (Python 版 translate / gen_openai と同じ)
async function realApiConfig(dataKey, config) {
    return unmaskApiConfig(dataKey, config || {}, await storage.get(dataKey), await loadApiPrivacy())
}

// tagcomplete の CSV はファイル名で保存しているので、旧版のパス形式のキーでも引けるようにする
const csvName = key => String(key).split(/[\\/]/).pop()

export default class GradioAPI {
    apiBaseURL = ''

    // About 画面は上流リポジトリのコミットへリンクするので、取り込んだサブモジュールのコミットを返す
    async getVersion() {
        return { version: UPSTREAM_COMMIT, latest_version: UPSTREAM_COMMIT }
    }

    async getRemoteVersions() {
        return []
    }

    async getConfig() {
        const [i18n, apis] = await Promise.all([loadI18n(), translateApis()])
        const translate_apis = structuredClone(apis)
        const lang = await initialLanguage(i18n)
        setLanguages(i18n)
        setLanguage(lang)
        // PLaMo が対応していない言語なら、最初から使える API を既定にする
        const supports = key => findApi(apis, key)?.support?.[lang]
        if (!supports(DEFAULT_API) && supports(FALLBACK_API)) translate_apis.default = FALLBACK_API
        return { i18n: structuredClone(i18n), translate_apis, packages_state: [], python: '' }
    }

    async installPackage(name, _package) {
        return { state: false, message: t('no_install_needed') }
    }

    async getExtensions() {
        return []
    }

    async tokenCounter(text, steps) {
        return { token_count: 0, max_length: 75 }
    }

    async getData(key) {
        const [apis, privacy, value] = await Promise.all([translateApis(), loadApiPrivacy(), storage.get(key)])
        return sanitize(key, value, apis, privacy)
    }

    async getDatas(keys) {
        if (typeof keys === 'string') keys = keys.split(',')
        const [apis, privacy, values] = await Promise.all([translateApis(), loadApiPrivacy(), storage.getMany(keys)])
        return Object.fromEntries(keys.map(key => [key, sanitize(key, values[key], apis, privacy)]))
    }

    async setData(key, data) {
        await saveData(key, data)
        return true
    }

    async setDatas(datas) {
        await Promise.all(Object.entries(datas).map(([key, data]) => saveData(key, data)))
        return true
    }

    async getDataListItem(key, index) {
        return storage.listGet(key, index)
    }

    async pushDataList(key, item) {
        await storage.listPush(key, item)
        return true
    }

    async popDataList(key) {
        return storage.listPop(key)
    }

    async shiftDataList(key) {
        return storage.listShift(key)
    }

    async removeDataList(key, index) {
        await storage.listRemove(key, index)
        return true
    }

    async clearDataList(key) {
        await storage.listClear(key)
        return true
    }

    async getHistories(type) {
        return history.getHistories(type)
    }

    async getFavorites(type) {
        return history.getFavorites(type)
    }

    async pushHistory(type, tags, prompt, name = '') {
        await history.pushHistory(type, tags, prompt, name)
        return true
    }

    async pushFavorite(type, tags, prompt, name = '') {
        await history.pushFavorite(type, tags, prompt, name)
        return true
    }

    async moveUpFavorite(type, id) {
        return history.moveUpFavorite(type, id)
    }

    async moveDownFavorite(type, id) {
        return history.moveDownFavorite(type, id)
    }

    async getLatestHistory(type) {
        return history.getLatestHistory(type)
    }

    async setHistory(type, id, tags, prompt, name) {
        return history.setHistory(type, id, tags, prompt, name)
    }

    async setHistoryName(type, id, name) {
        return history.setHistoryName(type, id, name)
    }

    async setFavoriteName(type, id, name) {
        return history.setFavoriteName(type, id, name)
    }

    async doFavorite(type, id) {
        return history.doFavorite(type, id)
    }

    async unFavorite(type, id) {
        return history.unFavorite(type, id)
    }

    async deleteHistory(type, id) {
        return history.removeHistory(type, id)
    }

    async deleteHistories(type) {
        return history.removeHistories(type)
    }

    async translate(text, from_lang, to_lang, api, api_config = {}) {
        const config = await realApiConfig('translate_api.' + api, api_config)
        const data = await translate(text, from_lang, to_lang, api, config, await translateApis())
        if (data.translated_text) data.translated_text = common.unescapeHtml(data.translated_text)
        return data
    }

    async translates(texts, from_lang, to_lang, api, api_config = {}) {
        const config = await realApiConfig('translate_api.' + api, api_config)
        const data = await translate(texts, from_lang, to_lang, api, config, await translateApis())
        if (Array.isArray(data.translated_text)) {
            data.translated_text = data.translated_text.map(item => common.unescapeHtml(item))
        }
        return data
    }

    async getCSVs() {
        return (await csvFiles.list()).map(({ name, size }) => ({
            key: CSV_KEY_PREFIX + name,
            name,
            size,
            path: name,
        }))
    }

    async getCSV(key) {
        const text = await csvFiles.get(csvName(key))
        if (text === null) throw Object.assign(new Error('Not Found'), { response: { status: 404 } })
        return text
    }

    async styles(file, hash = '') {
        return fetchStatic('aio/styles/' + file, 'text')
    }

    async getExtensionCssList() {
        const list = await fetchStatic('aio/extension_css.json')
        const selected = await storage.getMany(list.map(item => item.dataName))
        return list.map(item => ({ ...item, selected: selected[item.dataName] }))
    }

    async getExtraNetworks() {
        return []
    }

    async genOpenAI(messages, api_config) {
        try {
            return { success: true, result: await genOpenAI(messages, await realApiConfig('chatgpt_key', api_config)) }
        } catch (e) {
            return { success: false, message: String(e?.message || e) }
        }
    }

    async mbart50Initialize() {
        return { success: false, message: t('mbart50_unavailable') }
    }

    async getGroupTags(lang) {
        // Python 版はローカルの custom / prepend / append.yaml も読んだが、Web 版では編集できないので配布分だけ使う
        const names = await fetchStatic('aio/group_tags/index.json')
        const name = names.includes(lang) ? lang : 'default'
        const text = await fetchStatic(`aio/group_tags/${name}.yaml`, 'text').catch(() => '')
        return text ? text + '\n\n' : ''
    }
}
