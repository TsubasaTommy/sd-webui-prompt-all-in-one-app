import { defineConfig } from 'astro/config'
// 上流の Vue コンポーネントは Vue 3.2 前提 (3.5 だと再帰更新で固まる) なので、
// Vue 3.5 必須の @astrojs/vue ではなく Vite プラグインを直接使う
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

const aioSrc = fileURLToPath(new URL('./src/aio/src', import.meta.url))
const gradioAPIShim = fileURLToPath(new URL('./src/backend/gradioAPI.js', import.meta.url))

// GitHub Actions からは SITE / BASE_PATH を渡す (例: https://<user>.github.io , /<repo>)
export default defineConfig({
    site: process.env.SITE || 'http://localhost:4321',
    base: process.env.BASE_PATH || '/',
    vite: {
        plugins: [vue()],
        resolve: {
            alias: [
                // 上流の Python サーバー呼び出しをブラウザ内実装に差し替える
                { find: /^@\/utils\/gradioAPI(\.js)?$/, replacement: gradioAPIShim },
                { find: /^@\//, replacement: aioSrc + '/' },
            ],
        },
        optimizeDeps: {
            // wllama は wasm / worker を自前で読み込むので事前バンドルしない
            exclude: ['@wllama/wllama'],
        },
        build: {
            target: 'es2022',
            chunkSizeWarningLimit: 4096,
        },
    },
})
