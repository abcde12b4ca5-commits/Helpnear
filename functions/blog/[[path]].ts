import { getPost, listPosts, renderIndex, renderPost, shellResponse, type PagesEnv } from '../_lib/blog'

const BRAND = 'Helpnear'
interface Ctx { request: Request; env: PagesEnv; params: { path?: string | string[] }; waitUntil(p: Promise<unknown>): void }
const cacheStore = () => (caches as unknown as { default: Cache }).default

export const onRequestGet = async ({ request, env, params, waitUntil }: Ctx): Promise<Response> => {
  const url = new URL(request.url)
  const parts = ([] as string[]).concat(params.path ?? []).filter(Boolean)
  const cache = cacheStore()
  const hit = await cache.match(request)
  if (hit) return hit
  let res: Response
  try {
    if (parts.length === 0) {
      res = await shellResponse(env, url.origin, { ...renderIndex(await listPosts(env), BRAND), path: '/blog' }, BRAND)
    } else if (parts.length === 1 && /^[a-z0-9-]{3,70}$/.test(parts[0])) {
      const post = await getPost(env, parts[0])
      res = post
        ? await shellResponse(env, url.origin, { ...renderPost(post, await listPosts(env, 12), BRAND, url.origin), path: `/blog/${post.slug}` }, BRAND)
        : await shellResponse(env, url.origin, { title: 'Article not found', description: 'This article is not available.', body: '<h1>Article not found</h1><p>It may have moved. <a href="/blog">See all articles</a>.</p>', jsonld: {}, path: `/blog/${parts[0]}`, status: 404, robots: 'noindex' }, BRAND)
    } else {
      res = await shellResponse(env, url.origin, { title: 'Page not found', description: 'This page is not available.', body: '<h1>Page not found</h1><p><a href="/blog">See all articles</a>.</p>', jsonld: {}, path: url.pathname, status: 404, robots: 'noindex' }, BRAND)
    }
  } catch {
    return new Response('The blog is temporarily unavailable. Please try again in a minute.', { status: 503, headers: { 'retry-after': '60', 'cache-control': 'no-store' } })
  }
  if (res.status === 200) waitUntil(cache.put(request, res.clone()))
  return res
}
