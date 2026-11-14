// サイト全体のメタ情報 (SEO / OGP / 構造化データ / sitemap で共通)
export const SITE_NAME = 'Prompt All-in-One Web'
export const TITLE = 'Prompt All-in-One Web｜Stable Diffusion プロンプト編集・翻訳ツール'
export const DESCRIPTION =
    'Stable Diffusion のプロンプトをタグ単位で編集・整理・翻訳できる無料の Web ツール。インストール不要でブラウザだけで動作し、翻訳は PLaMo 3 Translate を端末内で実行。履歴・お気に入りもブラウザに保存されます。'
export const DESCRIPTION_EN =
    'A free, install-free web tool to edit, organize and translate Stable Diffusion prompts tag by tag. Runs entirely in your browser, with on-device translation by PLaMo 3 Translate.'
export const REPO_URL = 'https://github.com/TsubasaTommy/sd-webui-prompt-all-in-one-app'
export const UPSTREAM_URL = 'https://github.com/Physton/sd-webui-prompt-all-in-one'

// GitHub Pages のサブパスを含むサイトのトップ URL (末尾 /)。SITE / BASE_PATH は astro.config.mjs で設定
export function siteUrl(site, baseUrl) {
    return new URL(baseUrl.replace(/\/?$/, '/'), site).href
}
