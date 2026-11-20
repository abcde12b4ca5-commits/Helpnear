// Article tools served by the site itself (Cloudflare Pages Functions), so no separate worker is needed.
//   POST /api/articles/angles | generate | publish | images | run-now   admin only (Firebase ID token), same origin so no CORS
//   POST /api/articles/cron                                              the scheduled run, called by .github/workflows/articles.yml with the header x-cron-secret
// Needs, in Cloudflare Pages > Settings: the Workers AI binding named AI, the secret FIREBASE_SA_JSON and the secret CRON_SECRET.
import { handleAngles, handleGenerate, handleImages, handlePublish, handleRunNow, runArticleJob } from '../../../worker/src/articles'
import type { Env } from '../../../worker/src/google'

const DEFAULT_PROJECT = 'helpnear-48ff5' // the same fallback functions/_lib/blog.ts uses
type Handler = (req: Request, env: Env, cors: Record<string, string>) => Promise<Response>
const ADMIN: Record<string, Handler> = { angles: handleAngles, generate: handleGenerate, publish: handlePublish, images: handleImages, 'run-now': handleRunNow }
const reply = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

/** Compares two secrets without stopping at the first different character. */
export function sameSecret(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export const onRequestPost = async ({ request, env, params }: { request: Request; env: Record<string, unknown>; params: { action?: string | string[] } }): Promise<Response> => {
  const e = env as Partial<Env> & { CRON_SECRET?: string }
  const action = String(Array.isArray(params.action) ? params.action[0] : params.action ?? '')
  if (!e.FIREBASE_SA_JSON) return reply({ error: 'Articles are not set up yet: add the secret FIREBASE_SA_JSON in Cloudflare Pages > Settings > Variables and secrets, then redeploy.' }, 503)
  const full = { ...e, FIREBASE_PROJECT_ID: e.FIREBASE_PROJECT_ID || DEFAULT_PROJECT, SITE_URL: e.SITE_URL || new URL(request.url).origin } as Env
  if (action === 'cron') {
    if (!sameSecret(e.CRON_SECRET ?? '', request.headers.get('x-cron-secret') ?? '')) return reply({ error: 'unauthorized' }, 401)
    try { return reply(await runArticleJob(full), 200) } catch (err) { return reply({ error: err instanceof Error ? err.message : 'failed' }, 500) }
  }
  const handler = ADMIN[action]
  return handler ? handler(request, full, {}) : reply({ error: 'not found' }, 404)
}
