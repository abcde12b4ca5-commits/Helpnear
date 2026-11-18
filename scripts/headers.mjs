// Runs after `vite build` and the prerender: finds every inline <script> and <style> in the built HTML, hashes them, builds the CSP and writes it
// into dist/_headers (which Cloudflare Pages reads). Hashes are computed from the FINAL files, so they can never drift from the real content.
// CSP_MODE=report-only switches the header to Content-Security-Policy-Report-Only (blocks nothing) if you ever need to roll back quickly.
import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildCsp } from './csp.mjs'

const OUT = 'dist'
async function htmlFiles(dir) {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await htmlFiles(p)))
    else if (e.name.endsWith('.html') || e.name.endsWith('.tpl')) out.push(p)
  }
  return out
}
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('base64')

const scripts = new Set(), styles = new Set()
for (const f of await htmlFiles(OUT)) {
  const html = await readFile(f, 'utf8')
  for (const m of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1] ?? ''
    if (/\ssrc\s*=/.test(attrs)) continue // external files are allowed by 'self'
    if (/type\s*=\s*["']?(application\/ld\+json|application\/json)/i.test(attrs)) continue // data blocks are never executed
    if (m[2].trim()) scripts.add(sha(m[2]))
  }
  for (const m of html.matchAll(/<style(\s[^>]*)?>([\s\S]*?)<\/style>/gi)) if (m[2].trim()) styles.add(sha(m[2]))
  // an inline style="" attribute in HTML would be blocked by this policy: fail the build instead of shipping a broken page
  const attr = html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, '').match(/\sstyle\s*=\s*["']/i)
  if (attr) throw new Error(`${f} contains an inline style="..." attribute; the Content-Security-Policy would block it. Use a CSS class instead.`)
}

const csp = buildCsp({
  workerUrl: process.env.VITE_WORKER_URL ?? '',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.VITE_FIREBASE_PROJECT_ID ?? '',
  useEmulators: process.env.VITE_USE_EMULATORS === 'true',
  scriptHashes: [...scripts], styleHashes: [...styles],
})
const header = process.env.CSP_MODE === 'report-only' ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy'
const file = `${OUT}/_headers`
const src = await readFile(file, 'utf8')
if (!src.includes('__CSP__')) throw new Error('dist/_headers has no __CSP__ placeholder')
const lineStart = src.indexOf('Content-Security-Policy: __CSP__')
if (lineStart < 0) throw new Error('dist/_headers: expected the line "Content-Security-Policy: __CSP__"')
await writeFile(file, src.replace('Content-Security-Policy: __CSP__', `${header}: ${csp}`))
console.log(`CSP written to ${file} (${header}; ${scripts.size} inline script hash, ${styles.size} inline style hash)`)
