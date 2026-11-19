// Build-time prerender of PUBLIC SEO pages (static HTML, no JS needed to read them) + sitemap.xml + robots.txt + llms.txt.
// Runs after `vite build`. Data comes from Firestore public-read REST (config/categories) when
// VITE_FIREBASE_PROJECT_ID is set, otherwise from the seed file. Set SITE_URL to your real domain.
// Coverage is nationwide, so there are no per-area pages: one hub plus one page per service.
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises'
import { categories as seedCats } from '../firebase/seed/data.mjs'
import { DETAIL, SECTION_TITLES } from './service-guides.mjs'

const SITE = (process.env.SITE_URL || 'https://example.pages.dev').replace(/\/$/, '')
const BRAND = process.env.BRAND_NAME || JSON.parse(await readFile(new URL('../src/config/brand.json', import.meta.url), 'utf8')).name
const PROJECT = process.env.VITE_FIREBASE_PROJECT_ID
const OUT = 'dist'

// Self-hosted fonts: the build already emitted them into dist/assets (see src/main.tsx). Static pages inline the @font-face rules and preload the two critical files.
const assetFiles = await readdir(`${OUT}/assets`).catch(() => [])
const fontFile = (re) => assetFiles.find((f) => re.test(f))
const FONTS = [
  ['Inter', 400, fontFile(/^inter-latin-400-normal-.*\.woff2$/)],
  ['Inter', 600, fontFile(/^inter-latin-600-normal-.*\.woff2$/)],
  ['Plus Jakarta Sans', 800, fontFile(/^plus-jakarta-sans-latin-800-normal-.*\.woff2$/)],
].filter((f) => f[2])
const FONT_FACE = FONTS.map(([fam, w, f]) => `@font-face{font-family:${fam};font-style:normal;font-display:swap;font-weight:${w};src:url(/assets/${f}) format('woff2')}`).join('')
const FONT_PRELOAD = FONTS.filter((f) => /inter-latin-400|plus-jakarta-sans-latin-800/.test(f[2])).map(([, , f]) => `<link rel="preload" as="font" type="font/woff2" crossorigin href="/assets/${f}">`).join('')
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
  'garage-cleanout': ['List what needs sorting, the rough size of the garage, and whether you want shelving or labeling.', 'Hauling away waste is not included. Ask about hazardous items before the visit.'],
  'home-organizing': ['Say which rooms or closets, and how you want things grouped.', 'Ask whether they bring containers and labels, or work with what you already own.'],
  'move-out-cleaning': ['Share the home size and whether it is empty, plus any appliances to clean inside.', 'Ask about timing for a move-out deadline or a same-day Airbnb turnover.'],
  'pet-sitting': ['Describe your pets, feeding and medication routine, and the dates you need.', 'Ask about a meet-and-greet first and what happens in an emergency.'],
  'dog-walking': ['Share your dog size, temperament, walk length and how often you want walks.', 'Ask how they handle leash rules and the weather.'],
  'car-detailing': ['Say the vehicle type and whether you need interior, exterior or both.', 'Ask whether they bring water and power or need access to yours.'],
  'holiday-lights': ['Describe the roofline or trees, the lights you have, and the date to switch on.', 'Ask about ladder safety and when they take the lights down.'],
  'landscaping-mulching': ['Give the bed sizes, the mulch or plants you want, and any edging work.', 'Ask who buys materials and who hauls away leftovers.'],
  'snow-removal': ['List the driveway, walks and steps, and whether you want visits during or after storms.', 'Ask how they handle de-icing and what they charge for repeat visits.'],
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
const LOGO = '<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M6 18.5L20 7L34 18.5" stroke="#F59E0B" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.5 17.5V26.5C10.5 31.2 20 35.5 20 35.5C20 35.5 29.5 31.2 29.5 26.5V17.5" fill="#10B981" fill-opacity="0.18" stroke="#10B981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M15.5 23.5L18.7 26.7L25 20" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const css = `:root{--bg:#f8fafc;--sf:#fff;--tx:#0f172a;--mu:#556176;--ln:#e2e8f0;--ye:#047857;--ac:#065f46;--am:#f59e0b;color-scheme:light}
:root[data-theme=dark]{--bg:#0b1220;--sf:#111a2e;--tx:#f1f5f9;--mu:#a3b0c5;--ln:#1f2a44;--ye:#34d399;--ac:#6ee7b7;--am:#fbbf24;color-scheme:dark}
*{box-sizing:border-box;margin:0}html{scroll-behavior:smooth;background:var(--bg)}
body{font:400 1rem/1.6 Inter,system-ui,sans-serif;background:var(--bg);color:var(--tx)}
h1,h2,h3,.f{font-family:'Plus Jakarta Sans',system-ui,sans-serif;letter-spacing:-.035em;line-height:1.05;font-weight:800}
a{color:inherit}
.w{max-width:76rem;margin:0 auto;padding:0 1.25rem}
nav{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--bg) 90%,transparent);backdrop-filter:blur(14px);border-bottom:1px solid var(--ln);box-shadow:0 1px 2px rgba(15,23,42,.06)}
nav .w{display:flex;align-items:center;gap:1.4rem;height:4rem}
.logo{display:flex;align-items:center;gap:.6rem;font:800 1.3rem 'Plus Jakarta Sans',sans-serif;letter-spacing:-.03em;margin-right:auto;text-decoration:none}
.logo i{display:grid;place-items:center;width:2.4rem;height:2.4rem;border-radius:.9rem;background:#0f172a;box-shadow:0 1px 2px rgba(15,23,42,.1)}.logo i svg{width:1.5rem;height:1.5rem}
nav a.l{font-size:.9rem;font-weight:600;color:var(--mu);text-decoration:none}nav a.l:hover{color:var(--tx)}
@media(max-width:39.99rem){nav a.l{display:none}}
main{max-width:46rem;margin:0 auto;padding:3rem 1.25rem 2rem}
h1{font-size:clamp(2.4rem,7vw,4rem);margin-bottom:1rem}
h2{font-size:clamp(1.6rem,4vw,2.2rem);margin:2rem 0 .6rem}
h3{font-size:1.2rem;margin:1.2rem 0 .3rem}
p,li{color:var(--mu)}p{margin:.6rem 0}ul{padding-left:1.2rem;margin:.6rem 0}
main a:not(.cta){color:var(--ac);text-decoration:underline;text-underline-offset:3px}
.cta{display:inline-flex;align-items:center;padding:.85rem 1.5rem;margin-top:1.5rem;border-radius:.9rem;font:600 .95rem Inter,sans-serif;background:#0f172a;color:#fff;border:1px solid #334155;text-decoration:none;transition:.2s;box-shadow:0 1px 2px rgba(15,23,42,.1)}
.cta:hover{transform:translateY(-1px);background:#1e293b}
.cta.y{background:var(--am);color:#0f172a}.cta.y:hover{background:#fbbf24}
.cta.sm{margin:0;padding:.6rem 1.1rem;box-shadow:none}
#tg{display:grid;place-items:center;width:2.2rem;height:2.2rem;border-radius:50%;border:1px solid var(--ln);background:var(--sf);color:var(--tx);cursor:pointer;font-size:1rem;line-height:1}
main.post-wrap,.crumbs{font-size:.85rem}.crumbs{margin-bottom:1rem;color:var(--mu)}
.post h1{margin-bottom:.4rem}.post h2{margin-top:2.2rem}.post p,.post li{font-size:1.05rem;line-height:1.75;color:var(--tx)}.post li{margin:.35rem 0}
.meta{font-size:.85rem;color:var(--mu)}
.post figure{margin:1.2rem 0}.post img,.pc-i{display:block;width:100%;height:auto;border-radius:1rem;aspect-ratio:3/2;object-fit:cover;border:1px solid var(--ln)}
figcaption{font-size:.75rem;color:var(--mu);margin-top:.4rem}
.post blockquote{border-left:4px solid var(--ye);margin:1.4rem 0;padding:.2rem 1rem;background:var(--sf);border-radius:0 .8rem .8rem 0}
.hn-video{position:relative;aspect-ratio:16/9;margin:1.4rem 0;border-radius:1rem;overflow:hidden;border:1px solid var(--ln)}.hn-video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.cta-box{margin:2.5rem 0;padding:1.6rem;border-radius:1.2rem;background:var(--sf);border:1px solid var(--ln)}.cta-box h2{margin-top:0}.cta-box .cta{margin-top:.6rem;margin-right:.4rem}
.pcs{display:grid;gap:1.4rem;margin:1.6rem 0}@media(min-width:40rem){.pcs{grid-template-columns:1fr 1fr}}
.pc{background:var(--sf);border:1px solid var(--ln);border-radius:1.2rem;padding:1rem;transition:.2s}.pc:hover{transform:translateY(-3px)}.pc h2{font-size:1.25rem;margin:.8rem 0 .3rem}.pc a{text-decoration:none!important;color:var(--tx)!important}
footer .fb{font-size:1.3rem;color:#fff}
footer{padding:3rem 1.25rem 2.5rem;margin-top:3rem;background:#0f172a;border-top:1px solid #1e293b;font-size:.8rem;color:#94a3b8;text-align:center}footer p{max-width:42rem;margin:.6rem auto;color:#94a3b8}footer a{text-decoration:underline;text-underline-offset:3px}footer a:hover{color:#fff}`

function page({ title, description, path, robots, body, jsonld }) {
  const url = `${SITE}${path}`
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">
<meta name="robots" content="${robots},max-image-preview:large,max-snippet:-1"><link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:type" content="website"><meta property="og:url" content="${url}"><meta property="og:site_name" content="${esc(BRAND)}"><meta property="og:image" content="${SITE}/img/handy.jpg"><meta property="og:image:width" content="900"><meta property="og:image:height" content="735"><meta property="og:image:alt" content="${esc(BRAND)}: local help for your home"><meta property="og:locale" content="en_US"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${SITE}/img/handy.jpg"><meta name="theme-color" content="#1f4bff">
${FONT_PRELOAD}
<meta name="color-scheme" content="light dark"><script>try{var t=localStorage.getItem('hn-theme');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch(e){}</script>
<style>${FONT_FACE}${css}</style>
<script type="application/ld+json">${JSON.stringify(jsonld)}</script></head>
<body><nav aria-label="Main"><div class="w"><a href="/" class="logo" aria-label="${esc(BRAND)} home"><i aria-hidden="true">${LOGO}</i>${esc(BRAND)}</a><a class="l" href="/services/">Services</a><a class="l" href="/how-it-works">How it works</a><a class="l" href="/blog">Blog</a><a class="l" href="/login">Sign in</a><a class="cta y sm" href="/signup?role=worker">Join as a worker</a><button id=\"tg\" type=\"button\" aria-label=\"Switch between day and night mode\">◐</button></div></nav>
<main>${body}</main>
<footer><p class="f fb">${esc(BRAND)}</p><p>${esc(DISCLAIMER)} Electrical, plumbing and HVAC aren’t offered because they require a license.</p><p><a href="/legal/terms">Terms</a> · <a href="/legal/privacy">Privacy</a> · <a href="/legal/guidelines">Community Guidelines</a> · <a href="/legal/disclaimer">Disclaimer</a></p></footer>
<script>document.getElementById('tg').addEventListener('click',function(){var n=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=n;try{localStorage.setItem('hn-theme',n)}catch(e){}})</script></body></html>`
}

const crumbs = (items) => ({ '@type': 'BreadcrumbList', itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${SITE}${path}` })) })
const faqLd = (faq) => ({ '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) })

function faqFor(cat, where) {
  const guide = GUIDE[cat.id] ?? [`Describe the job clearly and say when you need it done.`, `Ask what is included before you agree on the work.`]
  return [
    [`How does ${BRAND} work for ${cat.name.toLowerCase()}${where ? ` in ${where}` : ''}?`, `You post a request with the details and the city where the work is. Workers who offer this service near you can accept it with a price and contact you. You agree on the work and the price directly. ${BRAND} does not handle job payments.`],
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
      { '@type': 'HowToStep', name: 'Post it', text: 'Choose the service, pick your city, details, urgency and how many workers you need.' },
      { '@type': 'HowToStep', name: 'Get prices', text: 'Workers who cover your city see the request and can accept it with a price.' },
      { '@type': 'HowToStep', name: 'Done and rated', text: 'Agree on the work, pay the worker directly, then confirm the job and leave a review.' },
    ] }] },
  body: `<h1>How ${esc(BRAND)} works</h1>
<ol><li><strong>Clients</strong> post a request: the service, the city, details, how urgent it is and how many workers they need.</li>
<li><strong>Workers</strong> who offer that service and cover that city see the request and can accept it with a price, or decline it.</li>
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
    jsonld: { '@context': 'https://schema.org', '@graph': [crumbs([['Home', '/'], ['Services', '/services/'], [cat.name, `/services/${cat.id}/`]]), faqLd(faq), { '@type': 'Service', name: cat.name, serviceType: cat.name, description: `Post a ${cat.name.toLowerCase()} request and local workers near you can accept it and send a price.`, url: `${SITE}/services/${cat.id}/`, areaServed: { '@type': 'Country', name: 'United States' }, provider: { '@type': 'Organization', name: BRAND, url: `${SITE}/` } }] },
    body: `<h1>${esc(cat.name)} near you</h1>
<p>${esc(BRAND)} connects you with local workers who offer ${esc(cat.name.toLowerCase())}. Post what you need and workers near you can accept your request.</p>
<h2>What this covers</h2><ul>${cat.allowedServices.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>${cat.notes ? `<p><em>${esc(cat.notes)}</em></p>` : ''}
${(DETAIL[cat.id] ?? []).map((items, i) => `<h2>${SECTION_TITLES[i]}</h2><ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`).join('\n')}
<h2>Frequently asked questions</h2>${faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')}
<h2>Other services</h2><ul>${enabledCats.filter((o) => o.id !== cat.id).map((o) => `<li><a href="/services/${o.id}/">${esc(o.name)}</a></li>`).join('')}</ul>
<p><a class="cta" href="/signup">Post a ${esc(cat.name.toLowerCase())} request</a></p>`,
  }))
}

await writeFile(`${OUT}/sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${SITE}${u.path}</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod><priority>${u.pri}</priority></url>`).join('\n')}\n</urlset>\n`)
await writeFile(`${OUT}/robots.txt`, `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /chat/\nDisallow: /post\nDisallow: /my-requests\nDisallow: /profile\nDisallow: /feed\nDisallow: /dashboard\nDisallow: /onboarding\nDisallow: /notifications\nDisallow: /login\nDisallow: /signup\nSitemap: ${SITE}/sitemap.xml\nSitemap: ${SITE}/sitemap-blog.xml\n`)
await writeFile(`${OUT}/llms.txt`, `# ${BRAND}\n> ${DISCLAIMER}\n\nFree marketplace connecting clients with local home-service workers anywhere in the United States.\n\n## Services\n${enabledCats.map((c) => `- [${c.name}](${SITE}/services/${c.id}/)`).join('\n')}\n`)
// Template for the blog pages that functions/ renders at the edge: same head, menu, footer and styles as every static page.
// The .tpl extension keeps it out of the sitemap and is scanned by scripts/headers.mjs, so the inline code in it is allowed by the CSP.
await writeFile(`${OUT}/_blog-shell.tpl`, page({ title: '%%TITLE%%', description: '%%DESC%%', path: '%%PATH%%', robots: 'index,follow', body: '%%BODY%%', jsonld: '%%JSONLD%%' }))

// Agent discovery (ARD): the site has no MCP server or API, so the only honest entry is the llms.txt index above. Without these files the single-page-app
// fallback answers /.well-known/ai-catalog.json with the HTML home page, which Lighthouse reports as "Malformed JSON".
const host = new URL(SITE).hostname
const catalog = JSON.stringify({
  specVersion: '1.0',
  entries: [{
    identifier: `urn:air:${host}:docs:llms-txt`,
    displayName: `${BRAND} site index (llms.txt)`,
    type: 'text/markdown',
    url: `${SITE}/llms.txt`,
    description: `Plain-text index of the home services that ${BRAND} covers, with a link to each service page.`,
    representativeQueries: [`What home services can I request on ${BRAND}?`, `Does ${BRAND} cover lawn care or pressure washing?`, `How do I find a local handyman with ${BRAND}?`],
  }],
}, null, 2) + '\n'
await mkdir(`${OUT}/.well-known`, { recursive: true })
await writeFile(`${OUT}/.well-known/ai-catalog.json`, catalog)
await writeFile(`${OUT}/.well-known/ard.json`, catalog)
console.log(`prerendered ${enabledCats.length} services from ${source}; ${urls.length} URLs in sitemap`)
