// 上流 (sd-webui-prompt-all-in-one サブモジュール) のフロントエンドとデータを web/ 配下に取り込む。
// - Vue ソース        -> src/aio/src/       (ビルド時に Vite が解決するため web/ 配下に置く)
// - 静的データ         -> public/aio/     (GitHub Pages からそのまま配信)
// - 翻訳APIの定義      -> ブラウザから呼べるものだけに絞り、PLaMo 3 Translate を追加して生成
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = path.resolve(WEB, '..')
const AIO = path.join(ROOT, 'sd-webui-prompt-all-in-one')

if (!fs.existsSync(path.join(AIO, 'src', 'src', 'main.js'))) {
    console.error(`[sync-aio] ${AIO} が空です。git submodule update --init を実行してください。`)
    process.exit(1)
}

const rm = p => fs.rmSync(p, { recursive: true, force: true })
const cp = (from, to) => fs.cpSync(from, to, { recursive: true })
const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8'))
const writeJSON = (p, data) => {
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, JSON.stringify(data))
}

// ---- Vue ソース (src/src と、そこから参照される src/globals.js) ----
const srcOut = path.join(WEB, 'src', 'aio')
rm(srcOut)
fs.mkdirSync(srcOut, { recursive: true })
cp(path.join(AIO, 'src', 'src'), path.join(srcOut, 'src'))
fs.copyFileSync(path.join(AIO, 'src', 'globals.js'), path.join(srcOut, 'globals.js'))

// 上流コードへの最小限のパッチ (コピー側にだけ適用。上流が変わって当たらなくなったらビルドを止める)
const PATCHES = [
    {
        // お気に入りの読み込み完了前は毎回新しい [] を代入してしまい、
        // deep watcher (favorites -> genGroup -> getCurrentTypeFavorites) が無限ループする。
        // Python サーバー経由だと応答順の都合で表面化しなかったが、IndexedDB だと固まる。
        file: 'src/mixins/phystonPrompt/headerMixin.js',
        from: "this.favorites = typeof window.phystonPromptfavorites === 'object' ? window.phystonPromptfavorites : []",
        to: "this.favorites = typeof window.phystonPromptfavorites === 'object' ? window.phystonPromptfavorites : this.favorites",
    },
]
for (const { file, from, to } of PATCHES) {
    const p = path.join(srcOut, file)
    const src = fs.readFileSync(p, 'utf8')
    if (!src.includes(from)) {
        console.error(`[sync-aio] パッチ対象が見つかりません: ${file}\n  ${from}`)
        process.exit(1)
    }
    fs.writeFileSync(p, src.split(from).join(to))
}

// ---- 疑似 gradio DOM (このリポジトリの static/index.html の <body> とそのスタイル) ----
// 上流の Vue アプリはこの DOM の要素 ID (txt2img_prompt など) を探してマウントする
fs.mkdirSync(path.join(WEB, 'src', 'styles'), { recursive: true })
fs.copyFileSync(path.join(ROOT, 'static', 'css', 'main.min.css'), path.join(WEB, 'src', 'styles', 'gradio-shell.css'))
const shellHtml = fs.readFileSync(path.join(ROOT, 'static', 'index.html'), 'utf8').match(/<body[^>]*>([\s\S]*?)<\/body>/i)
if (!shellHtml) {
    console.error('[sync-aio] static/index.html に <body> が見つかりません')
    process.exit(1)
}
fs.writeFileSync(path.join(srcOut, 'gradio-shell.html'), shellHtml[1].replace(/<script[\s\S]*?<\/script>/gi, ''))

// ---- 静的データ ----
const pubOut = path.join(WEB, 'public', 'aio')
rm(pubOut)
cp(path.join(AIO, 'styles'), path.join(pubOut, 'styles'))

// テーマ CSS 内の Python サーバー用 URL (/physton_prompt/styles?file=...) を、CSS からの相対パスに書き換える
const stylesOut = path.join(pubOut, 'styles')
const walk = dir => fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
let rewrittenUrls = 0
for (const file of walk(stylesOut).filter(f => f.endsWith('.css'))) {
    const src = fs.readFileSync(file, 'utf8')
    const cssDir = path.posix.dirname(path.relative(stylesOut, file).split(path.sep).join('/'))
    const out = src.replace(/url\((['"]?)\/physton_prompt\/styles\?file=([^'")]+)\1\)/g, (_, quote, target) => {
        rewrittenUrls++
        return `url(${quote}${path.posix.relative(cssDir, decodeURIComponent(target))}${quote})`
    })
    if (out !== src) fs.writeFileSync(file, out)
}
fs.copyFileSync(path.join(AIO, 'i18n.json'), path.join(pubOut, 'i18n.json'))

// group_tags: 上流が gitignore しているユーザー用ファイルは、手元にあっても配布しない (CI とローカルで中身を揃える)
const LOCAL_GROUP_TAGS = new Set(['custom.yaml', 'prepend.yaml', 'append.yaml'])
const groupTags = fs.readdirSync(path.join(AIO, 'group_tags')).filter(f => f.endsWith('.yaml') && !LOCAL_GROUP_TAGS.has(f))
fs.mkdirSync(path.join(pubOut, 'group_tags'), { recursive: true })
for (const f of groupTags) fs.copyFileSync(path.join(AIO, 'group_tags', f), path.join(pubOut, 'group_tags', f))
writeJSON(path.join(pubOut, 'group_tags', 'index.json'), groupTags.map(f => f.replace(/\.yaml$/, '')))

// 取り込んだ上流のコミット (About 画面のリンク先)
let commit = ''
try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: AIO, encoding: 'utf8' }).trim()
} catch {
    console.warn('[sync-aio] サブモジュールのコミットを取得できませんでした')
}
// UPSTREAM_COMMIT: About 画面のリンク先 / BUILD_ID: 静的データと CSS のキャッシュ更新用 (デプロイごとに変わる)
fs.writeFileSync(path.join(srcOut, 'version.js'), [
    `export const UPSTREAM_COMMIT = ${JSON.stringify(commit)}`,
    `export const BUILD_ID = ${JSON.stringify(`${(commit || 'dev').slice(0, 12)}-${Date.now().toString(36)}`)}`,
    '',
].join('\n'))

// 拡張テーマ CSS の一覧 (Python 版 get_extension_css_list と同じ形)
const extDir = path.join(AIO, 'styles', 'extensions')
const extensionCss = fs.existsSync(extDir) ? fs.readdirSync(extDir).flatMap(dir => {
    const manifest = path.join(extDir, dir, 'manifest.json')
    const style = path.join(extDir, dir, 'style.min.css')
    if (!fs.existsSync(manifest) || !fs.existsSync(style)) return []
    const manifestText = fs.readFileSync(manifest, 'utf8')
    try {
        JSON.parse(manifestText)
    } catch {
        console.warn(`[sync-aio] manifest.json が読めないテーマを除外: ${dir}`)
        return []
    }
    return [{
        dir,
        dataName: 'extensionSelect.' + dir,
        selected: false,
        manifest: manifestText,
        style: `extensions/${dir}/style.min.css`,
    }]
}) : []
writeJSON(path.join(pubOut, 'extension_css.json'), extensionCss)

// ---- 翻訳 API 定義 ----
// PLaMo 3 Translate の対応言語 (モデルカード記載の 53 言語)
const PLAMO_LANGS = new Set(['ja', 'en', 'zh-hans', 'zh-hant', 'ko', 'ar', 'az', 'be', 'bg', 'bn', 'ca', 'ceb', 'de', 'es', 'et', 'eu', 'fa', 'fr', 'gu', 'he', 'hi', 'hr', 'hu', 'hy', 'id', 'it', 'jv', 'ka', 'kk', 'km', 'lt', 'lv', 'ml', 'mr', 'ms', 'my', 'ne', 'nl', 'pa', 'pl', 'ru', 'si', 'sk', 'sl', 'sr', 'sw', 'ta', 'te', 'th', 'tl', 'ur', 'uz', 'vi'])
const PLAMO_OVERRIDES = { zh_CN: 'zh-hans', zh_HK: 'zh-hant', zh_TW: 'zh-hant', fil_PH: 'tl' }
const plamoSupport = {}
for (const { code } of readJSON(path.join(AIO, 'i18n.json')).languages) {
    const lang = PLAMO_OVERRIDES[code] ?? code.split('_')[0]
    if (PLAMO_LANGS.has(lang)) plamoSupport[code] = lang
}

const plamoHelp = [
    { title: '[Hugging Face] PLaMo 3 Translate (PLaMo Community License)', url: 'https://huggingface.co/pfnet/plamo-3-translate-0.8b' },
]

const plamoBrowser = {
    key: 'plamo3_browser',
    name: 'PLaMo 3 Translate (in browser / WebGPU)',
    concurrent: 1,
    support: plamoSupport,
    help: [
        ...plamoHelp,
        { title: 'The model is downloaded only once (0.8B: ~0.6 GB / 2B: ~1.4 GB) and cached in the browser. Translation runs entirely on your device.', url: 'https://huggingface.co/pfnet/plamo-3-translate-0.8b-GGUF' },
    ],
    config: [
        { key: 'model', title: 'Model', type: 'select', default: '0.8b', options: ['0.8b', '2b'] },
    ],
}

const plamoLocal = {
    key: 'plamo3_local',
    name: 'PLaMo 3 Translate (local server: Ollama / LM Studio / llama-server)',
    concurrent: 1,
    support: plamoSupport,
    help: plamoHelp,
    config: [
        {
            key: 'api_base', title: 'API Base', type: 'input', default: 'http://localhost:11434/v1',
            desc: '<ul><li>Ollama: http://localhost:11434/v1 (set OLLAMA_ORIGINS to this page\'s origin before starting)</li><li>LM Studio: http://localhost:1234/v1 (enable CORS in the server settings)</li><li>llama-server: http://localhost:8080/v1 (or the port given with --port)</li></ul>',
        },
        { key: 'model', title: 'Model', type: 'input', default: 'hf.co/pfnet/plamo-3-translate-2b-GGUF:Q4_K_M', desc: 'e.g. Ollama: hf.co/pfnet/plamo-3-translate-8b-GGUF:Q4_K_M / LM Studio: plamo-3-translate-2b' },
        { key: 'api_key', title: 'API Key (optional)', type: 'input', privacy: true },
    ],
}

// ブラウザから直接 (CORS で) 呼べる既存 API だけを残す
const BROWSER_OK = new Set(['openai', 'microsoft', 'google', 'myMemory', 'myMemory_free'])
const upstream = readJSON(path.join(AIO, 'translate_apis.json'))
const apis = [{ type: 'offline_api', children: [plamoBrowser, plamoLocal] }]
for (const group of upstream.apis) {
    const children = group.children.filter(item => BROWSER_OK.has(item.key))
    if (children.length) apis.push({ ...group, children })
}
writeJSON(path.join(pubOut, 'translate_apis.json'), { default: 'plamo3_browser', apis })

// API キーなど秘密の項目一覧。旧版から移行した、Web 版にない API (deepl / baidu など) の設定も
// バックアップから確実に取り除けるよう、上流の全 API と Web 版の API の両方から作る
const privacy = {}
for (const item of [...upstream.apis, ...apis].flatMap(g => g.children)) {
    const keys = (item.config || []).filter(c => c.privacy && c.type === 'input').map(c => c.key)
    privacy[item.key] = [...new Set([...(privacy[item.key] || []), ...keys])]
}
writeJSON(path.join(pubOut, 'api_privacy.json'), privacy)

console.log(`[sync-aio] done: ${apis.flatMap(g => g.children).length} translate APIs, ${extensionCss.length} extension themes, ${rewrittenUrls} theme URLs rewritten`)
