// Build-time prerender of PUBLIC SEO pages (static HTML, no JS needed to read them) + sitemap.xml + robots.txt + llms.txt.
// Runs after `vite build`. Data comes from Firestore public-read REST (config/categories) when
// VITE_FIREBASE_PROJECT_ID is set, otherwise from the seed file. Set SITE_URL to your real domain.
// Coverage is nationwide, so there are no per-area pages: one hub plus one page per service.
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { categories as seedCats } from '../firebase/seed/data.mjs'

const SITE = (process.env.SITE_URL || 'https://example.pages.dev').replace(/\/$/, '')
const BRAND = process.env.BRAND_NAME || JSON.parse(await readFile(new URL('../src/config/brand.json', import.meta.url), 'utf8')).name
const PROJECT = process.env.VITE_FIREBASE_PROJECT_ID
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
  if (!PROJECT) return { cats: seedCats, source: 'seed file' }
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
    return { cats, source: 'Firestore' }
  } catch (e) {
    console.warn('Firestore read failed, using seed file:', e.message)
    return { cats: seedCats, source: 'seed file (fallback)' }
  }
}

// Static pages share the site's editorial design tokens (kept in sync with src/index.css).
const css = `:root{--bg:#f6f4ee;--sf:#fff;--tx:#0b1020;--mu:#5a6075;--ln:#dedbd0;--bl:#1f4bff;--ye:#ffd23f;--ac:#1f4bff}
@media(prefers-color-scheme:dark){:root{--bg:#0a0e1a;--sf:#131a2e;--tx:#f1f2f8;--mu:#9aa1ba;--ln:#232c48;--ac:#ffd23f}}
*{box-sizing:border-box;margin:0}html{scroll-behavior:smooth;background:var(--bg)}
body{font:400 1rem/1.6 Inter,system-ui,sans-serif;background:var(--bg);color:var(--tx)}
h1,h2,h3,.f{font-family:'Bricolage Grotesque',system-ui,sans-serif;letter-spacing:-.035em;line-height:1.02}
a{color:inherit}
.w{max-width:76rem;margin:0 auto;padding:0 1.25rem}
nav{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--ln)}
nav .w{display:flex;align-items:center;gap:1.4rem;height:4rem}
.logo{display:flex;align-items:center;gap:.55rem;font:800 1.45rem 'Bricolage Grotesque',sans-serif;letter-spacing:-.04em;margin-right:auto;text-decoration:none}
.logo i{display:grid;place-items:center;width:2rem;height:2rem;border-radius:.6rem;background:var(--bl);color:var(--ye);font-style:normal;font-size:1.1rem;transform:rotate(-8deg)}
nav a.l{font-size:.9rem;font-weight:600;color:var(--mu);text-decoration:none}nav a.l:hover{color:var(--tx)}
@media(max-width:39.99rem){nav a.l{display:none}}
main{max-width:46rem;margin:0 auto;padding:3rem 1.25rem 2rem}
h1{font-size:clamp(2.4rem,7vw,4rem);font-weight:800;margin-bottom:1rem}
h2{font-size:clamp(1.6rem,4vw,2.2rem);font-weight:800;margin:2rem 0 .6rem}
h3{font-size:1.2rem;font-weight:800;margin:1.2rem 0 .3rem}
p,li{color:var(--mu)}p{margin:.6rem 0}ul{padding-left:1.2rem;margin:.6rem 0}
main a:not(.cta){color:var(--ac);text-decoration:underline;text-underline-offset:3px}
.cta{display:inline-flex;align-items:center;padding:.85rem 1.5rem;margin-top:1.5rem;border-radius:.9rem;font:800 .95rem 'Bricolage Grotesque',sans-serif;background:var(--bl);color:#fff;text-decoration:none;box-shadow:0 8px 0 -2px rgba(11,16,32,.9)}
.cta:hover{transform:translateY(3px);box-shadow:0 4px 0 -2px rgba(11,16,32,.9)}
.cta.y{background:var(--ye);color:#0b1020}
footer{padding:3rem 1.25rem 2.5rem;font-size:.8rem;color:var(--mu);text-align:center}footer p{max-width:42rem;margin:.6rem auto}footer a{text-decoration:underline;text-underline-offset:3px}`

function page({ title, description, path, robots, body, jsonld }) {
  const url = `${SITE}${path}`
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">
<meta name="robots" content="${robots},max-image-preview:large,max-snippet:-1"><link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:type" content="website"><meta property="og:url" content="${url}"><meta property="og:site_name" content="${esc(BRAND)}"><meta property="og:image" content="${SITE}/img/handy.jpg"><meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="#1f4bff">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<meta name="color-scheme" content="light dark">
<style>${css}</style>
<script type="application/ld+json">${JSON.stringify(jsonld)}</script></head>
<body><nav aria-label="Main"><div class="w"><a href="/" class="logo" aria-label="${esc(BRAND)} home"><i aria-hidden="true">⌂</i>${esc(BRAND)}</a><a class="l" href="/services/">Services</a><a class="l" href="/how-it-works">How it works</a><a class="l" href="/login">Sign in</a><a class="cta y" style="margin:0;padding:.6rem 1.1rem;box-shadow:none" href="/signup">Get started</a></div></nav>
<main>${body}</main>
<footer><p class="f" style="font-size:1.3rem;color:var(--tx);font-weight:800">${esc(BRAND)}</p><p>${esc(DISCLAIMER)} Electrical, plumbing and HVAC aren’t offered because they require a license.</p><p><a href="/legal/terms">Terms</a> · <a href="/legal/privacy">Privacy</a> · <a href="/legal/guidelines">Community Guidelines</a> · <a href="/legal/disclaimer">Disclaimer</a></p></footer></body></html>`
}

const crumbs = (items) => ({ '@type': 'BreadcrumbList', itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${SITE}${path}` })) })
const faqLd = (faq) => ({ '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) })

function faqFor(cat, where) {
  const guide = GUIDE[cat.id] ?? [`Describe the job clearly and say when you need it done.`, `Ask what is included before you agree on the work.`]
  return [
    [`How does ${BRAND} work for ${cat.name.toLowerCase()}${where ? ` in ${where}` : ''}?`, `You post a request with the details and your ZIP code. Workers who offer this service near you can accept it with a price and contact you. You agree on the work and the price directly. ${BRAND} does not handle job payments.`],
    [`What should I include in my request?`, guide[0]],
    [`What should I ask a worker?`, guide[1]],
    [`Does ${BRAND} verify licenses or insurance?`, `No. ${DISCLAIMER} Always confirm any license, permit or insurance you need yourself.`],
    [`Is it free?`, `${BRAND} is free to use at launch.`],
  ]
}

const { cats, source } = await loadData()
const enabledCats = cats.filter((c) => c.enabled && c.riskLevel === 'low')
const urls = [{ path: '/', pri: '1.0' }, { path: '/services/', pri: '0.8' }, { path: '/how-it-works', pri: '0.5' }]

async function write(path, html) {
  const dir = `${OUT}${path}`
  await mkdir(dir, { recursive: true })
  await writeFile(`${dir}/index.html`, html)
}

// How it works (static copy of the SPA page so crawlers see real content)
await write('/how-it-works', page({
  title: `How ${BRAND} works | Post a job, get prices, pay directly`,
  description: `See how ${BRAND} works: post a request, local workers send prices, you pay the worker directly. Free to use.`,
  path: '/how-it-works', robots: 'index,follow',
  jsonld: { '@context': 'https://schema.org', '@graph': [crumbs([['Home', '/'], ['How it works', '/how-it-works']]), {
    '@type': 'HowTo', name: `How ${BRAND} works`,
    step: [
      { '@type': 'HowToStep', name: 'Post it', text: 'Choose the service, add your ZIP code, details, urgency and how many workers you need.' },
      { '@type': 'HowToStep', name: 'Get prices', text: 'Workers who cover your ZIP code see the request and can accept it with a price.' },
      { '@type': 'HowToStep', name: 'Done and rated', text: 'Agree on the work, pay the worker directly, then confirm the job and leave a review.' },
    ] }] },
  body: `<h1>How ${esc(BRAND)} works</h1>
<ol><li><strong>Clients</strong> post a request: the service, the ZIP code, details, how urgent it is and how many workers they need.</li>
<li><strong>Workers</strong> who offer that service within their travel distance of that ZIP see the request and can accept it with a price, or decline it.</li>
<li>When a worker accepts, they can see your contact details and reach out. You agree on the price and the work, then confirm the agreement in the app.</li>
<li>After the work, the worker marks the service as done and you confirm it. Confirmed jobs appear in both dashboards, and you can rate the worker.</li>
<li>Payment is handled directly between you and the worker. ${esc(BRAND)} never handles job payments.</li></ol>
<p>${esc(DISCLAIMER)} Always confirm required licenses and permits yourself.</p>
<p><a href="/services/">Browse services</a></p><p><a class="cta" href="/signup">Get started free</a></p>`,
}))

// Hub
await write('/services', page({
  title: `Home services across the United States | ${BRAND}`,
  description: `Post a request for cleaning, handyman work, pressure washing, painting, lawn care and more. Local workers near you can reach out. Free to use.`,
  path: '/services/', robots: 'index,follow',
  jsonld: { '@context': 'https://schema.org', '@graph': [crumbs([['Home', '/'], ['Services', '/services/']])] },
  body: `<h1>Home services across the United States</h1><p>Choose a service to learn what to include in your request and how ${esc(BRAND)} works.</p><ul>${enabledCats.map((c) => `<li><a href="/services/${c.id}/">${esc(c.name)}</a></li>`).join('')}</ul><p><a class="cta" href="/signup">Post a request</a></p>`,
}))

for (const cat of enabledCats) {
  const faq = faqFor(cat, '')
  urls.push({ path: `/services/${cat.id}/`, pri: '0.8' })
  await write(`/services/${cat.id}`, page({
    title: `${cat.name} near you | ${BRAND}`,
    description: `Post a ${cat.name.toLowerCase()} request and let local workers reach out. See what to include and what to ask. Free to use.`,
    path: `/services/${cat.id}/`, robots: 'index,follow',
    jsonld: { '@context': 'https://schema.org', '@graph': [crumbs([['Home', '/'], ['Services', '/services/'], [cat.name, `/services/${cat.id}/`]]), faqLd(faq)] },
    body: `<h1>${esc(cat.name)} near you</h1>
<p>${esc(BRAND)} connects you with local workers who offer ${esc(cat.name.toLowerCase())}. Post what you need and workers near you can accept your request.</p>
<h2>What this covers</h2><ul>${cat.allowedServices.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>${cat.notes ? `<p><em>${esc(cat.notes)}</em></p>` : ''}
<h2>Frequently asked questions</h2>${faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')}
<h2>Other services</h2><ul>${enabledCats.filter((o) => o.id !== cat.id).map((o) => `<li><a href="/services/${o.id}/">${esc(o.name)}</a></li>`).join('')}</ul>
<p><a class="cta" href="/signup">Post a ${esc(cat.name.toLowerCase())} request</a></p>`,
  }))
}

await writeFile(`${OUT}/sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${SITE}${u.path}</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod><priority>${u.pri}</priority></url>`).join('\n')}\n</urlset>\n`)
await writeFile(`${OUT}/robots.txt`, `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /chat/\nDisallow: /post\nDisallow: /my-requests\nDisallow: /feed\nDisallow: /dashboard\nDisallow: /onboarding\nDisallow: /notifications\nDisallow: /login\nDisallow: /signup\nSitemap: ${SITE}/sitemap.xml\n`)
await writeFile(`${OUT}/llms.txt`, `# ${BRAND}\n> ${DISCLAIMER}\n\nFree marketplace connecting clients with local home-service workers anywhere in the United States.\n\n## Services\n${enabledCats.map((c) => `- [${c.name}](${SITE}/services/${c.id}/)`).join('\n')}\n`)
console.log(`prerendered ${enabledCats.length} services from ${source}; ${urls.length} URLs in sitemap`)
