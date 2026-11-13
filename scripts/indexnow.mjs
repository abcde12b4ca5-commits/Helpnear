// Free: tells Bing, Yandex, Seznam etc. about every URL in the sitemap (IndexNow). Run after each deploy:
//   SITE_URL=https://your-domain npm run indexnow
import { readFile } from 'node:fs/promises'
const SITE = (process.env.SITE_URL || '').replace(/\/$/, '')
if (!SITE) { console.error('Set SITE_URL first'); process.exit(1) }
const KEY = '96e4c9acc2979bda469462f54a5bc37c'
const xml = await readFile(new URL('../dist/sitemap.xml', import.meta.url), 'utf8')
const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ host: new URL(SITE).host, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList }),
})
console.log('IndexNow', res.status, urlList.length, 'URLs')
