// sitemap.xml (Google Search Console などに登録する用)。
// GitHub Pages のプロジェクトサイトでは /<repo>/robots.txt は検索エンジンに読まれないため、robots.txt からは参照しない
import { siteUrl } from '../site.js'

export function GET({ site }) {
    const url = siteUrl(site, import.meta.env.BASE_URL)
    const lastmod = new Date().toISOString().slice(0, 10)
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${url}</loc>
    <lastmod>${lastmod}</lastmod>
  </url>
</urlset>
`
    return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
}
