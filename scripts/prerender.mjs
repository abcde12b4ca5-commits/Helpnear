// Build-time prerender of PUBLIC SEO pages (static HTML, no JS needed to read them) + sitemap.xml + robots.txt + llms.txt.
// Runs after `vite build`. Data comes from Firestore public-read REST (config/categories/zones) when
// VITE_FIREBASE_PROJECT_ID is set, otherwise from the seed file. Set SITE_URL to your real domain.
// Zone pages are `noindex` until INDEX_ZONE_PAGES=true (turn on only once pages carry real local content).
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { categories as seedCats, zones as seedZones } from '../firebase/seed/data.mjs'

const SITE = (process.env.SITE_URL || 'https://example.pages.dev').replace(/\/$/, '')
const BRAND = process.env.BRAND_NAME || JSON.parse(await readFile(new URL('../src/config/brand.json', import.meta.url), 'utf8')).name
const PROJECT = process.env.VITE_FIREBASE_PROJECT_ID
const INDEX_ZONES = process.env.INDEX_ZONE_PAGES === 'true'
const OUT = 'dist'
const DISCLAIMER = `${BRAND} is a platform that connects people. We are not a contractor or an employer. Licenses and insurance shown by workers are self-reported and not verified by ${BRAND}.`

// Helpful, non-numeric guidance per category (no invented prices). Extend over time: richer content ranks better.
const GUIDE = {
  'house-cleaning': ['List the number of bedrooms and bathrooms, pets, and whether you want a one-time deep clean or a recurring visit.', 'Ask what is included, who brings supplies and equipment, and how they handle damage or missed spots.'],
  'window-cleaning': ['Say how many windows, which floors, and whether you need screens and tracks cleaned too.', 'Ask whether they work on upper floors and what safety equipment they use.'],
  'pressure-washing': ['Note the surfaces (concrete, siding, fence, deck) and rough square footage.', 'Ask what pressure they use on each surface, since too much can damage wood and siding.'],
  'carpet-upholstery-cleaning': ['Describe the rooms or furniture, the fabric type, and any stains or pet issues.', 'Ask about drying time and whether the method suits your carpet or fabric.'],
  painting: ['Say which rooms or exterior areas, ceiling height, and whether walls need repair first.', 'Ask who supplies paint and primer, how many coats are included, and how they protect floors and furniture.'],
  handyman: ['Make a list of small jobs so they can be quoted together.', 'Work that needs a license (electrical, plumbing, gas, HVAC) is not allowed here and needs a licensed professional.'],
  'furniture-assembly': ['List each item and brand, and say if it is already in the room.', 'Ask whether they bring their own tools and whether they haul away packaging.'],
  'tv-shelf-mounting': ['Share the TV size, wall type, and whether you want the wires hidden without new electrical wiring.', 'Ask about the mount type and how they locate studs or choose anchors.'],
  'drywall-repair': ['Describe the damage size and whether you want texture and paint matched.', 'Ask how many visits are needed, since patches need drying time.'],
  'flooring-installation': ['Give the room sizes, the flooring type, and whether old flooring must be removed.', 'Ask about subfloor preparation, and check whether permits or HOA rules apply.'],
  'fence-work': ['Say whether it is a repair or new fence, the length, and the material.', 'Check permit and HOA rules before work starts, and confirm property lines.'],
  'deck-work': ['Describe the size, material, and condition of the existing deck.', 'Ask about permits, which are often required for new decks.'],
  'gutter-cleaning': ['Give the number of stories and the rough length of gutters.', 'Ask whether they also flush the downspouts and check for sagging.'],
  'lawn-care': ['Share the lawn size, how often you want service, and gate access.', 'Ask whether trimming, edging, and cleanup after mowing are included.'],
  'yard-cleanup': ['List what needs to go (leaves, brush, small branches) and how much.', 'Tree removal is not covered here; ask about bagging versus hauling away.'],
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

async function loadData() {
  if (!PROJECT) return { cats: seedCats, zones: seedZones, source: 'seed file' }
  try {
    const base = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`
    const read = async (col) => {
      const res = await fetch(`${base}/${col}?pageSize=300`)
      if (!res.ok) throw new Error(`${col}: HTTP ${res.status}`)
      const json = await res.json()
      return (json.documents ?? []).map((d) => ({ id: d.name.split('/').pop(), f: d.fields }))
    }
    const val = (v) => v == null ? undefined : 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue : 'arrayValue' in v ? (v.arrayValue.values ?? []).map(val) : undefined
    const cats = (await read('categories')).map(({ id, f }) => ({ id, name: val(f.name), enabled: val(f.enabled), riskLevel: val(f.riskLevel), allowedServices: val(f.allowedServices) ?? [], notes: val(f.notes) ?? '' }))
    const zones = (await read('zones')).map(({ id, f }) => ({ id, name: val(f.name), city: val(f.city), enabled: val(f.enabled) }))
    return { cats, zones, source: 'Firestore' }
  } catch (e) {
    console.warn('Firestore read failed, using seed file:', e.message)
    return { cats: seedCats, zones: seedZones, source: 'seed file (fallback)' }
  }
}

const css = 'body{font-family:system-ui,sans-serif;max-width:46rem;margin:0 auto;padding:1rem;line-height:1.6;color:#111}a{color:#047857}h1{font-size:1.7rem}footer{margin-top:2rem;font-size:.85rem;color:#444}.cta{display:inline-block;background:#047857;color:#fff;padding:.6rem 1rem;border-radius:.4rem;text-decoration:none;font-weight:600}'

function page({ title, description, path, robots, body, jsonld }) {
  const url = `${SITE}${path}`
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">
<meta name="robots" content="${robots}"><link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:type" content="website"><meta property="og:url" content="${url}">
<style>${css}</style>
<script type="application/ld+json">${JSON.stringify(jsonld)}</script></head>
<body><header><a href="/">${esc(BRAND)}</a> &middot; <a href="/services/">Services</a> &middot; <a href="/how-it-works">How it works</a></header>
<main>${body}</main>
<footer><p>${esc(DISCLAIMER)}</p><p><a href="/legal/terms">Terms</a> &middot; <a href="/legal/privacy">Privacy</a> &middot; <a href="/legal/guidelines">Community Guidelines</a></p></footer></body></html>`
}

const crumbs = (items) => ({ '@type': 'BreadcrumbList', itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${SITE}${path}` })) })
const faqLd = (faq) => ({ '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) })

function faqFor(cat, where) {
  const guide = GUIDE[cat.id] ?? [`Describe the job clearly and say when you need it done.`, `Ask what is included before you agree on the work.`]
  return [
    [`How does ${BRAND} work for ${cat.name.toLowerCase()}${where ? ` in ${where}` : ''}?`, `You post a request with the details and your area. Workers who offer this service in that area can claim it and contact you. You agree on the work and the price directly. ${BRAND} does not handle job payments.`],
    [`What should I include in my request?`, guide[0]],
    [`What should I ask a worker?`, guide[1]],
    [`Does ${BRAND} verify licenses or insurance?`, `No. ${DISCLAIMER} Always confirm any license, permit or insurance you need yourself.`],
    [`Is it free?`, `${BRAND} is free to use at launch.`],
  ]
}

const { cats, zones, source } = await loadData()
const enabledCats = cats.filter((c) => c.enabled && c.riskLevel === 'low')
const enabledZones = zones.filter((z) => z.enabled)
const urls = [{ path: '/', pri: '1.0' }, { path: '/services/', pri: '0.8' }, { path: '/how-it-works', pri: '0.5' }]

async function write(path, html) {
  const dir = `${OUT}${path}`
  await mkdir(dir, { recursive: true })
  await writeFile(`${dir}/index.html`, html)
}

// Hub
await write('/services', page({
  title: `Home services in the Houston area | ${BRAND}`,
  description: `Post a request for cleaning, handyman work, pressure washing, painting, lawn care and more. Local workers in the Houston area can reach out. Free to use.`,
  path: '/services/', robots: 'index,follow',
  jsonld: { '@context': 'https://schema.org', '@graph': [crumbs([['Home', '/'], ['Services', '/services/']])] },
  body: `<h1>Home services in the Houston area</h1><p>Choose a service to learn what to include in your request and how ${esc(BRAND)} works.</p><ul>${enabledCats.map((c) => `<li><a href="/services/${c.id}/">${esc(c.name)}</a></li>`).join('')}</ul><p><a class="cta" href="/signup">Post a request</a></p>`,
}))

for (const cat of enabledCats) {
  const faq = faqFor(cat, '')
  urls.push({ path: `/services/${cat.id}/`, pri: '0.8' })
  await write(`/services/${cat.id}`, page({
    title: `${cat.name} in the Houston area | ${BRAND}`,
    description: `Post a ${cat.name.toLowerCase()} request and let local workers reach out. See what to include and what to ask. Free to use.`,
    path: `/services/${cat.id}/`, robots: 'index,follow',
    jsonld: { '@context': 'https://schema.org', '@graph': [crumbs([['Home', '/'], ['Services', '/services/'], [cat.name, `/services/${cat.id}/`]]), faqLd(faq)] },
    body: `<h1>${esc(cat.name)} in the Houston area</h1>
<p>${esc(BRAND)} connects you with local workers who offer ${esc(cat.name.toLowerCase())}. Post what you need and workers in your area can claim your request.</p>
<h2>What this covers</h2><ul>${cat.allowedServices.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>${cat.notes ? `<p><em>${esc(cat.notes)}</em></p>` : ''}
<h2>Choose your area</h2><ul>${enabledZones.map((z) => `<li><a href="/services/${cat.id}/${slug(z.id)}/">${esc(cat.name)} in ${esc(z.name)}</a></li>`).join('')}</ul>
<h2>Frequently asked questions</h2>${faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')}
<p><a class="cta" href="/signup">Post a ${esc(cat.name.toLowerCase())} request</a></p>`,
  }))
  for (const z of enabledZones) {
    const where = z.name
    const zfaq = faqFor(cat, where)
    const path = `/services/${cat.id}/${slug(z.id)}/`
    if (INDEX_ZONES) urls.push({ path, pri: '0.6' })
    await write(`/services/${cat.id}/${slug(z.id)}`, page({
      title: `${cat.name} in ${where} | ${BRAND}`,
      description: `Request ${cat.name.toLowerCase()} in ${where}. Local workers can claim your request and contact you. Free to use.`,
      path, robots: INDEX_ZONES ? 'index,follow' : 'noindex,follow',
      jsonld: { '@context': 'https://schema.org', '@graph': [crumbs([['Home', '/'], ['Services', '/services/'], [cat.name, `/services/${cat.id}/`], [where, path]]), faqLd(zfaq)] },
      body: `<h1>${esc(cat.name)} in ${esc(where)}</h1>
<p>Post a ${esc(cat.name.toLowerCase())} request for ${esc(where)}. Workers who cover this area can claim it and reach out to you directly.</p>
<h2>What this covers</h2><ul>${cat.allowedServices.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
<h2>Frequently asked questions</h2>${zfaq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')}
<p><a class="cta" href="/signup">Post a request</a></p><p><a href="/services/${cat.id}/">All areas for ${esc(cat.name.toLowerCase())}</a></p>`,
    }))
  }
}

await writeFile(`${OUT}/sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${SITE}${u.path}</loc><priority>${u.pri}</priority></url>`).join('\n')}\n</urlset>\n`)
await writeFile(`${OUT}/robots.txt`, `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /chat/\nSitemap: ${SITE}/sitemap.xml\n`)
await writeFile(`${OUT}/llms.txt`, `# ${BRAND}\n> ${DISCLAIMER}\n\nFree marketplace connecting clients with local home-service workers in the Houston, TX area.\n\n## Services\n${enabledCats.map((c) => `- [${c.name}](${SITE}/services/${c.id}/)`).join('\n')}\n`)
console.log(`prerendered ${enabledCats.length} services x ${enabledZones.length} areas from ${source}; ${urls.length} URLs in sitemap (zone pages ${INDEX_ZONES ? 'indexable' : 'noindex'})`)
