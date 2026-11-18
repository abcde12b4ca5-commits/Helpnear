import { listPosts, type PagesEnv } from './_lib/blog'

export const onRequestGet = async ({ request, env }: { request: Request; env: PagesEnv }): Promise<Response> => {
  const origin = new URL(request.url).origin
  const posts = await listPosts(env, 500).catch(() => null)
  if (!posts) return new Response('temporarily unavailable', { status: 503, headers: { 'retry-after': '60' } })
  const urls = [`<url><loc>${origin}/blog</loc>${posts[0] ? `<lastmod>${posts[0].publishedAt.slice(0, 10)}</lastmod>` : ''}<priority>0.7</priority></url>`,
    ...posts.map((p) => `<url><loc>${origin}/blog/${p.slug}</loc><lastmod>${p.publishedAt.slice(0, 10)}</lastmod><priority>0.6</priority></url>`)]
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=900' } })
}
