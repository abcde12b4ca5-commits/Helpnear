// Build-time prerender of PUBLIC SEO pages (static HTML, no JS needed to read them) + sitemap.xml + robots.txt + llms.txt.
// Runs after `vite build`. Data comes from Firestore public-read REST (config/categories) when
// VITE_FIREBASE_PROJECT_ID is set, otherwise from the seed file. Set SITE_URL to your real domain.
// Coverage is nationwide: one hub plus one page per service, plus a city guide page for each major city in src/shared/cities.json (real local content:
// climate, seasonal jobs, local FAQ, nearby cities; no invented prices and no promise that a worker is available) and a /locations/ hub.
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises'
import { categories as seedCats } from '../firebase/seed/data.mjs'
import { DETAIL, SECTION_TITLES } from './service-guides.mjs'

const SITE = (process.env.SITE_URL || 'https://example.pages.dev').replace(/\/$/, '')
const BRAND = process.env.BRAND_NAME || JSON.parse(await readFile(new URL('../src/config/brand.json', import.meta.url), 'utf8')).name
const CITIES = JSON.parse(await readFile(new URL('../src/shared/cities.json', import.meta.url), 'utf8'))
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
// The logo is embedded in the page (about 3 KB), so it can never show as a broken picture if the image file fails to load.
const LOGO_DATA = await readFile(new URL('../src/shared/logo-data.json', import.meta.url), 'utf8').then((t) => JSON.parse(t).mark).catch(() => '/img/logo-mark.png')
const LOGO = `<img src="${LOGO_DATA}" alt="" width="40" height="40" decoding="async">`
const [BRAND_HEAD, BRAND_TAIL] = BRAND.length > 4 && BRAND.startsWith('Help') ? [BRAND.slice(0, 4), BRAND.slice(4)] : [BRAND, '']
const css = `:root{--bg:#f5f8fc;--sf:#fff;--tx:#22324d;--mu:#566782;--ln:#dde5f1;--ye:#2a5eab;--ac:#1f4a8c;--am:#ce7742;color-scheme:light}
:root[data-theme=dark]{--bg:#0c1527;--sf:#121e36;--tx:#eef3fb;--mu:#a8b6cf;--ln:#223152;--ye:#7fa8ea;--ac:#a9c6f5;--am:#e8975f;color-scheme:dark}
*{box-sizing:border-box;margin:0}html{scroll-behavior:smooth;background:var(--bg)}
body{font:400 1rem/1.6 Inter,system-ui,sans-serif;background:var(--bg);color:var(--tx)}
h1,h2,h3,.f{font-family:'Plus Jakarta Sans',system-ui,sans-serif;letter-spacing:-.035em;line-height:1.05;font-weight:800}
a{color:inherit}
.w{max-width:76rem;margin:0 auto;padding:0 1.25rem}
body>nav{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--bg) 90%,transparent);backdrop-filter:blur(14px);border-bottom:1px solid var(--ln);box-shadow:0 1px 2px rgba(15,23,42,.06)}
nav .w{display:flex;align-items:center;gap:1.4rem;height:4rem}
.logo{display:flex;align-items:center;gap:.6rem;font:800 1.3rem 'Plus Jakarta Sans',sans-serif;letter-spacing:-.03em;margin-right:auto;text-decoration:none}
.logo i{display:grid;place-items:center;width:2.4rem;height:2.4rem;border-radius:.9rem;background:#fff;border:1px solid var(--ln);box-shadow:0 1px 2px rgba(34,50,77,.1)}.logo i img{width:2.15rem;height:2.15rem;object-fit:contain}.logo em{font-style:normal;color:var(--ye);margin-left:-.6rem}.logo i svg{width:1.5rem;height:1.5rem}
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
.cta.y{background:var(--am);color:#0f172a}.cta.y:hover{background:#e08a52}
.cta.sm{margin:0;padding:.6rem 1.1rem;box-shadow:none}
#tg{display:grid;place-items:center;width:2.2rem;height:2.2rem;border-radius:50%;border:1px solid var(--ln);background:var(--sf);color:var(--tx);cursor:pointer;font-size:1rem;line-height:1}
main.post-wrap,.crumbs{font-size:.85rem}.crumbs{margin-bottom:1rem;color:var(--mu)}
.post h1{margin-bottom:.4rem}.post h2{margin-top:2.2rem}.post p,.post li{font-size:1.05rem;line-height:1.75;color:var(--tx)}.post li{margin:.35rem 0}
.meta{font-size:.85rem;color:var(--mu)}
.post figure{margin:1.2rem 0}.post img,.pc-i{display:block;width:100%;height:auto;border-radius:1rem;aspect-ratio:3/2;object-fit:cover;border:1px solid var(--ln)}
figcaption{font-size:.75rem;color:var(--mu);margin-top:.4rem}
.post blockquote{border-left:4px solid var(--ye);margin:1.4rem 0;padding:.2rem 1rem;background:var(--sf);border-radius:0 .8rem .8rem 0}
.hn-video{position:relative;aspect-ratio:16/9;margin:1.4rem 0;border-radius:1rem;overflow:hidden;border:1px solid var(--ln)}.hn-video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.cta-box{margin:2.5rem 0;padding:1.6rem;border-radius:1.2rem;background:var(--sf);border:1px solid var(--ln)}.cta-box h2{margin-top:0}.cta-box .cta{margin-top:.6rem;margin-right:.4rem}.cta-box .site-link{margin-top:1rem;color:var(--mu);font-size:.9rem}
.pcs{display:grid;gap:1.4rem;margin:1.6rem 0}@media(min-width:40rem){.pcs{grid-template-columns:1fr 1fr}}
.pc{background:var(--sf);border:1px solid var(--ln);border-radius:1.2rem;padding:1rem;transition:.2s}.pc:hover{transform:translateY(-3px)}.pc h2{font-size:1.25rem;margin:.8rem 0 .3rem}.pc a{text-decoration:none!important;color:var(--tx)!important}
footer .fb{font-size:1.3rem;color:#fff}
footer{padding:3rem 1.25rem 2.5rem;margin-top:3rem;background:#0f172a;border-top:1px solid #1e293b;font-size:.8rem;color:#94a3b8;text-align:center}footer p{max-width:42rem;margin:.6rem auto;color:#94a3b8}footer a{text-decoration:underline;text-underline-offset:3px}footer a:hover{color:#fff}\n.chips{display:flex;flex-wrap:wrap;gap:.5rem;margin:1.2rem 0}.chips a{padding:.4rem .9rem;border:1px solid var(--ln);border-radius:999px;background:var(--sf);font-size:.85rem;font-weight:600;color:var(--tx)!important;text-decoration:none!important}.chips a[aria-current=page]{background:#0f172a;color:#fff!important;border-color:#0f172a}
.toc{margin:1.4rem 0;padding:1rem 1.2rem;border:1px solid var(--ln);border-radius:1rem;background:var(--sf)}.toc-t{margin:0 0 .4rem;font-weight:700;color:var(--tx)}.toc ol{margin:0;padding-left:1.3rem}.toc li{margin:.25rem 0;font-size:.95rem}
.tbl{overflow-x:auto;margin:1.4rem 0;border:1px solid var(--ln);border-radius:1rem}.tbl table{border-collapse:collapse;width:100%;min-width:24rem}.tbl th,.tbl td{padding:.6rem .8rem;text-align:left;border-bottom:1px solid var(--ln);font-size:.95rem}.tbl th{background:var(--sf);font-weight:700}
.cta-inline{margin:1.8rem 0;padding:1rem 1.2rem;border-left:4px solid var(--am);border-radius:0 1rem 1rem 0;background:var(--sf)}.cta-inline p{margin:0 0 .6rem}
.hn-calc{margin:1.6rem 0;padding:1.2rem;border:1px solid var(--ln);border-radius:1rem;background:var(--sf)}.hn-calc h3{margin-top:0}.calc-grid{display:grid;gap:.8rem;grid-template-columns:1fr 1fr}@media(max-width:34rem){.calc-grid{grid-template-columns:1fr}}.calc-grid label{display:flex;flex-direction:column;gap:.25rem;font-size:.85rem;font-weight:600;color:var(--tx)}.calc-grid input{padding:.55rem .7rem;border:1px solid var(--ln);border-radius:.6rem;background:var(--bg);color:var(--tx);font:inherit}.calc-out{margin-top:.8rem;font-weight:600;color:var(--tx)}
.svc-hero{margin-bottom:1.6rem}.svc-hero p.lead{max-width:40rem;font-size:1.1rem}.eyebrow{display:inline-flex;align-items:center;gap:.4rem;margin-bottom:.9rem;padding:.3rem .85rem;border-radius:999px;background:color-mix(in srgb,var(--ye) 12%,transparent);color:var(--ac);font:700 .8rem Inter,sans-serif}.chips{display:flex;flex-wrap:wrap;gap:.5rem;list-style:none;padding:0;margin:1rem 0 0}.chips li{margin:0;padding:.35rem .8rem;border:1px solid var(--ln);border-radius:999px;background:var(--sf);color:var(--tx);font-size:.85rem;font-weight:600}.steps{display:grid;gap:.8rem;list-style:none;padding:0;margin:1.4rem 0 .4rem;counter-reset:st}@media(min-width:40rem){.steps{grid-template-columns:repeat(3,1fr)}}.steps li{counter-increment:st;display:flex;gap:.8rem;align-items:flex-start;margin:0;padding:1rem 1.1rem;border:1px solid var(--ln);border-radius:1rem;background:var(--sf);color:var(--mu);font-size:.92rem;line-height:1.45}.steps li::before{content:counter(st);flex:none;display:grid;place-items:center;width:1.9rem;height:1.9rem;border-radius:50%;background:var(--am);color:#0f172a;font:800 .9rem 'Plus Jakarta Sans',sans-serif}.steps b{display:block;color:var(--tx);font-size:1rem}.grp{display:flex;align-items:baseline;justify-content:space-between;gap:1rem;margin:2.2rem 0 .8rem}.grp h2{margin:0}.grp span{color:var(--mu);font-size:.85rem;font-weight:600}.svc-grid{display:grid;gap:.75rem;grid-template-columns:repeat(auto-fill,minmax(17.5rem,1fr));list-style:none;padding:0;margin:0}.svc-grid li{margin:0}main a.svc{display:flex;align-items:center;gap:.9rem;height:100%;padding:.9rem 1rem;border:1px solid var(--ln);border-radius:1rem;background:var(--sf);color:var(--tx)!important;text-decoration:none!important;transition:transform .2s,border-color .2s,box-shadow .2s}main a.svc:hover,main a.svc:focus-visible{transform:translateY(-2px);border-color:var(--ye);box-shadow:0 10px 26px rgba(15,23,42,.1);outline:none}.svc .ic{flex:none;display:grid;place-items:center;width:3rem;height:3rem;border-radius:.95rem;background:color-mix(in srgb,var(--ye) 10%,var(--bg));font-size:1.45rem;font-style:normal;line-height:1}.svc .tx{display:grid;gap:.15rem;min-width:0}.svc b{font:700 1rem 'Plus Jakarta Sans',sans-serif;letter-spacing:-.01em}.svc small{color:var(--mu);font-size:.8rem;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.svc .go{margin-inline-start:auto;flex:none;color:var(--mu);font-style:normal;font-weight:700;transition:transform .2s,color .2s}.svc:hover .go{color:var(--ye);transform:translateX(3px)}.translated-rtl .svc .go{transform:scaleX(-1)}.translated-rtl .svc:hover .go{transform:scaleX(-1) translateX(3px)}.band{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:1rem;margin:2.8rem 0 0;padding:1.6rem;border:1px solid var(--ln);border-radius:1.4rem;background:var(--sf)}.band h2{margin:0 0 .3rem;font-size:1.5rem}.band p{margin:0}.band .cta{margin:0}main.wide{max-width:76rem;padding-top:2.5rem}@media(prefers-reduced-motion:reduce){main a.svc,.svc .go{transition:none}main a.svc:hover{transform:none}}
.tl{position:relative;display:grid;gap:1rem;list-style:none;margin:1.6rem 0 0;padding:0}.tl::before{content:'';position:absolute;left:1.2rem;top:1.2rem;bottom:1.2rem;width:2px;background:var(--ln)}.tl li{position:relative;display:grid;grid-template-columns:2.4rem 1fr;gap:1rem;align-items:start;margin:0}.tn{position:relative;z-index:1;display:grid;place-items:center;width:2.4rem;height:2.4rem;border-radius:50%;background:var(--am);color:#1a2236;font:800 .95rem 'Plus Jakarta Sans',sans-serif;box-shadow:0 0 0 5px var(--bg)}.tc{padding:1rem 1.2rem;border:1px solid var(--ln);border-radius:1.2rem;background:var(--sf)}.tc h2{margin:0 0 .25rem;font-size:1.2rem;color:var(--tx)}.tc p{margin:0;color:var(--mu);font-size:.95rem}
.note{margin-top:1.4rem}.cta{white-space:nowrap}@media(max-width:30rem){nav .cta{padding:.55rem .85rem;font-size:.82rem}nav .w{gap:.6rem}}.cities{list-style:none;padding:0;display:grid;gap:.4rem .9rem;grid-template-columns:repeat(auto-fill,minmax(10.5rem,1fr))}.cities li{margin:0}
`

function page({ title, description, path, robots, body, jsonld, wide = false, keywords = '' }) {
  const url = `${SITE}${path}`
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">${keywords ? `<meta name="keywords" content="${esc(keywords)}">` : ''}
<meta name="robots" content="${robots},max-image-preview:large,max-snippet:-1"><link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:type" content="website"><meta property="og:url" content="${url}"><meta property="og:site_name" content="${esc(BRAND)}"><meta property="og:image" content="${SITE}/img/og-logo.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${esc(BRAND)}: local help for your home"><meta property="og:locale" content="en_US"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${SITE}/img/handy.jpg"><meta name="theme-color" content="#1f4bff">
${FONT_PRELOAD}
<meta name="color-scheme" content="light dark"><meta name="theme-color" content="#2a5eab"><link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="${esc(BRAND)}"><script src="/install.js" defer></script><script>try{var t=localStorage.getItem('hn-theme');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch(e){}</script>
<style>${FONT_FACE}${css}</style>
<script type="application/ld+json">${JSON.stringify(jsonld)}</script></head>
<body><nav aria-label="Main"><div class="w"><a href="/" class="logo" aria-label="${esc(BRAND)} home"><i aria-hidden="true">${LOGO}</i>${esc(BRAND_HEAD)}<em>${esc(BRAND_TAIL)}</em></a><a class="l" href="/services/">Services</a><a class="l" href="/how-it-works">How it works</a><a class="l" href="/blog">Blog</a><a class="l" href="/login">Sign in</a><a class="cta y sm" href="/signup?role=worker">Join as a worker</a><button id=\"tg\" type=\"button\" aria-label=\"Switch between day and night mode\">◐</button></div></nav>
<main${wide ? ' class="wide"' : ''}>${body}</main>
<footer><p class="f fb">${esc(BRAND)}</p><p>${esc(DISCLAIMER)} Electrical, plumbing and HVAC aren’t offered because they require a license.</p><p><a href="/locations/">Cities</a> · <a href="/blog">Blog</a> · <a href="/legal/terms">Terms</a> · <a href="/legal/privacy">Privacy</a> · <a href="/legal/guidelines">Community Guidelines</a> · <a href="/legal/disclaimer">Disclaimer</a></p></footer>
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
  description: `See how ${BRAND} works: post a request, local workers send prices, you pay the worker directly with no platform fee. ${BRAND} never handles job payments.`,
  keywords: 'how it works, post a job online, get quotes from local workers, pay the worker directly, no platform fee, free home service requests',
  path: '/how-it-works', robots: 'index,follow',
  jsonld: { '@context': 'https://schema.org', '@graph': [crumbs([['Home', '/'], ['How it works', '/how-it-works']]), {
    '@type': 'HowTo', name: `How ${BRAND} works`,
    step: [
      { '@type': 'HowToStep', name: 'Post it', text: 'Choose the service, pick your city, details, urgency and how many workers you need.' },
      { '@type': 'HowToStep', name: 'Get prices', text: 'Workers who cover your city see the request and can accept it with a price.' },
      { '@type': 'HowToStep', name: 'Done and rated', text: 'Agree on the work, pay the worker directly, then confirm the job and leave a review.' },
    ] }] },
  body: `<header class="svc-hero"><span class="eyebrow">How it works</span><h1>How ${esc(BRAND)} works</h1><p class="lead">From a posted request to a finished job, in five steps.</p></header>
<ol class="tl"><li><span class="tn">1</span><div class="tc"><h2>Clients post a request</h2><p>The service, the city, details, how urgent it is and how many workers they need.</p></div></li><li><span class="tn">2</span><div class="tc"><h2>Workers get notified</h2><p>Workers who offer that service and cover that city see the request and can accept it with a price, or decline it.</p></div></li><li><span class="tn">3</span><div class="tc"><h2>You agree on the work</h2><p>When a worker accepts, they can see your contact details and reach out. You agree on the price and the work, then confirm the agreement in the app.</p></div></li><li><span class="tn">4</span><div class="tc"><h2>Done and rated</h2><p>After the work, the worker marks the service as done and you confirm it. Confirmed jobs appear in both dashboards, and you can rate the worker.</p></div></li><li><span class="tn">5</span><div class="tc"><h2>Pay directly</h2><p>Payment is handled directly between you and the worker. ${esc(BRAND)} never handles job payments.</p></div></li></ol>
<div class="band"><div><h2>Need a hand, or looking for work?</h2><p>Free to use. Post a request, or join as a worker and get notified when one matches.</p></div><a class="cta y" href="/signup">Get started free</a></div>
<p class="note">${esc(DISCLAIMER)} Always confirm required licenses and permits yourself.</p>
<p><a href="/services/">Browse services</a></p>`,
}))

// Hub
const ICONS = {
  'house-cleaning': '🧹', 'move-out-cleaning': '🧽', 'window-cleaning': '🪟', 'carpet-upholstery-cleaning': '🛋️', 'pressure-washing': '💦', 'trash-bin-cleaning': '🗑️', 'car-detailing': '🚗',
  handyman: '🔧', 'furniture-assembly': '🪑', 'tv-shelf-mounting': '📺', 'drywall-repair': '🧱', 'flooring-installation': '🪵', painting: '🎨', 'furniture-refinishing': '🖌️', 'blinds-curtains': '🏠', 'fence-work': '🚧', 'deck-work': '🏡',
  'lawn-care': '🌱', 'yard-cleanup': '🍃', 'gardening-planting': '🌷', 'landscaping-mulching': '🌳', 'gutter-cleaning': '🍂', 'snow-removal': '❄️', 'holiday-lights': '💡',
  'garage-cleanout': '📦', 'home-organizing': '🗂️', 'home-tech-help': '💻', 'laundry-help': '🧺', 'sewing-alterations': '🧵', 'event-setup-help': '🎉',
  'errand-running': '🛍️', 'pet-sitting': '🐾', 'dog-walking': '🐕', 'house-sitting': '🔑', photography: '📷', 'bike-help': '🚲',
}
const HUB_GROUPS = [
  ['Cleaning', ['house-cleaning', 'move-out-cleaning', 'window-cleaning', 'carpet-upholstery-cleaning', 'pressure-washing', 'trash-bin-cleaning', 'car-detailing']],
  ['Repairs and installation', ['handyman', 'furniture-assembly', 'tv-shelf-mounting', 'drywall-repair', 'flooring-installation', 'painting', 'furniture-refinishing', 'blinds-curtains', 'fence-work', 'deck-work']],
  ['Yard and outdoors', ['lawn-care', 'yard-cleanup', 'gardening-planting', 'landscaping-mulching', 'gutter-cleaning', 'snow-removal', 'holiday-lights']],
  ['Home help and organizing', ['garage-cleanout', 'home-organizing', 'home-tech-help', 'laundry-help', 'sewing-alterations', 'event-setup-help']],
  ['Errands, pets and more', ['errand-running', 'pet-sitting', 'dog-walking', 'house-sitting', 'photography', 'bike-help']],
]
const hubCard = (c) => `<li><a class="svc" href="/services/${c.id}/"><i class="ic" aria-hidden="true">${ICONS[c.id] ?? '🛠️'}</i><span class="tx"><b>${esc(c.name)}</b><small>${esc((GUIDE[c.id] ?? [`Post a request and local workers can send you a price.`])[0])}</small></span><i class="go" aria-hidden="true">→</i></a></li>`
const grouped = new Set(HUB_GROUPS.flatMap(([, ids]) => ids))
const hubSections = [...HUB_GROUPS.map(([name, ids]) => [name, ids.map((id) => enabledCats.find((c) => c.id === id)).filter(Boolean)]), ['More services', enabledCats.filter((c) => !grouped.has(c.id))]]
  .filter(([, list]) => list.length)
  .map(([name, list]) => `<div class="grp"><h2>${esc(name)}</h2><span>${list.length} ${list.length === 1 ? 'service' : 'services'}</span></div><ul class="svc-grid">${list.map(hubCard).join('')}</ul>`).join('')
await write('/services', page({
  title: `Home services across the United States | ${BRAND}`,
  description: `Post a home job for cleaning, handyman work, pressure washing, painting, lawn care and more. Local workers send you a price. Free, no platform fee.`,
  keywords: 'home services near me, free home service requests, house cleaning, handyman, pressure washing, painting, lawn care, local workers, no platform fee',
  path: '/services/', robots: 'index,follow', wide: true,
  jsonld: { '@context': 'https://schema.org', '@graph': [crumbs([['Home', '/'], ['Services', '/services/']])] },
  body: `<header class="svc-hero"><span class="eyebrow">${enabledCats.length} services</span><h1>Home services across the United States</h1><p class="lead">Choose a service to learn what to include in your request and how ${esc(BRAND)} works.</p><ul class="chips"><li>Free to use</li><li>No platform fee on jobs</li><li>Workers near you send a price</li></ul><ol class="steps"><li><span><b>Post the job</b>Describe it in a minute and pick your city.</span></li><li><span><b>Workers reply</b>Workers who cover your area send you a price.</span></li><li><span><b>Pick one</b>Choose a worker, deal with them directly and leave a review.</span></li></ol></header>${hubSections}<div class="band"><div><h2>Ready when you are</h2><p>Post your request and local workers can reach out.</p></div><a class="cta y" href="/signup">Post a request</a></div>`,
}))

for (const cat of enabledCats) {
  const faq = faqFor(cat, '')
  urls.push({ path: `/services/${cat.id}/`, pri: '0.8' })
  await write(`/services/${cat.id}`, page({
    title: `${cat.name} near you | ${BRAND}`,
    description: `Post a ${cat.name.toLowerCase()} request and local workers near you send a price. See what to include and what to ask. Free, no platform fee.`,
    keywords: ((n) => (n.length > 22 ? `${n} near me, ${n} jobs near me, free home service requests, no platform fee` : `${n} near me, hire a ${n}, free ${n} quotes, local ${n} workers, ${n} jobs near me, no platform fee`))(cat.name.replace(/\s*\(.*?\)\s*/g, ' ').trim().toLowerCase()),
    path: `/services/${cat.id}/`, robots: 'index,follow',
    jsonld: { '@context': 'https://schema.org', '@graph': [crumbs([['Home', '/'], ['Services', '/services/'], [cat.name, `/services/${cat.id}/`]]), faqLd(faq), { '@type': 'Service', name: cat.name, serviceType: cat.name, description: `Post a ${cat.name.toLowerCase()} request and local workers near you can accept it and send a price.`, url: `${SITE}/services/${cat.id}/`, areaServed: { '@type': 'Country', name: 'United States' }, provider: { '@type': 'Organization', name: BRAND, url: `${SITE}/` } }] },
    body: `<h1>${esc(cat.name)} near you</h1>
<p>${esc(BRAND)} connects you with local workers who offer ${esc(cat.name.toLowerCase())}. Post what you need and workers near you can accept your request.</p>
<h2>What this covers</h2><ul>${cat.allowedServices.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>${cat.notes ? `<p><em>${esc(cat.notes)}</em></p>` : ''}
${(DETAIL[cat.id] ?? []).map((items, i) => `<h2>${SECTION_TITLES[i]}</h2><ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`).join('\n')}
<h2>Frequently asked questions</h2>${faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')}
<h2>Popular cities</h2><ul class="cities">${CITIES.slice(0, 8).map((c) => `<li><a href="/locations/${c.slug}/">${esc(c.name)}, ${c.state}</a></li>`).join('')}</ul>
<h2>Other services</h2><ul>${enabledCats.filter((o) => o.id !== cat.id).map((o) => `<li><a href="/services/${o.id}/">${esc(o.name)}</a></li>`).join('')}</ul>
<p><a class="cta" href="/signup">Post a ${esc(cat.name.toLowerCase())} request</a></p>`,
  }))
}

// Cities: a hub and one guide page per major city. Local facts come from src/shared/cities.json; the rest is the same honest, nationwide explanation.
const catName = new Map(enabledCats.map((c) => [c.id, c.name]))
const cityBySlug = new Map(CITIES.map((c) => [c.slug, c]))
urls.push({ path: '/locations/', pri: '0.7' })
await write('/locations', page({
  title: `Home services by city | ${BRAND}`,
  description: `Pick your city to see what homes there need through the year and post a home or yard job. ${BRAND} works in all 50 states and is free, with no platform fee.`,
  keywords: 'home services by city, local handyman near me, house cleaning near me, lawn care near me, free home service requests, all 50 states',
  path: '/locations/', robots: 'index,follow',
  jsonld: { '@context': 'https://schema.org', '@graph': [crumbs([['Home', '/'], ['Cities', '/locations/']]), { '@type': 'CollectionPage', name: `Home services by city | ${BRAND}`, url: `${SITE}/locations/` }] },
  body: `<h1>Home services by city</h1><p>${esc(BRAND)} works across the United States. Choose a city to see what homes there need through the year, which jobs come up most, and how to post yours.</p><ul class="cities">${[...CITIES].sort((a, b) => a.name.localeCompare(b.name)).map((c) => `<li><a href="/locations/${c.slug}/">${esc(c.name)}, ${c.state}</a></li>`).join('')}</ul><p>Not on the list? Post your job anyway: workers who cover your ZIP code can see it.</p><p><a class="cta" href="/signup">Post a job</a></p>`,
}))
for (const c of CITIES) {
  const where = `${c.name}, ${c.state}`
  const path = `/locations/${c.slug}/`
  const jobs = c.jobs.filter((j) => catName.has(j.service))
  const faq = [
    [`Does ${BRAND} have workers in ${where}?`, `${BRAND} is open nationwide. Workers choose the ZIP codes they cover, so availability depends on who has signed up near you. When you post a request, workers who cover your ZIP code can see it and reply with a price. We cannot promise that a worker will be available for a specific job.`],
    [c.faq.q, c.faq.a],
    [`Does ${BRAND} verify licenses or insurance?`, `No. ${DISCLAIMER} Always confirm any license, permit or insurance you need yourself.`],
    [`Is it free to post a job in ${where}?`, `${BRAND} is free to use at launch.`],
  ]
  urls.push({ path, pri: '0.6' })
  await write(path.replace(/\/$/, ''), page({
    title: `Home services in ${where} | ${BRAND}`,
    description: `Post a home or yard job in ${where} and local workers send prices. See what ${c.name} homes need each season. Free, no platform fee.`,
    keywords: `home services in ${where}, handyman ${c.name}, house cleaning ${c.name}, lawn care ${c.name}, pressure washing ${c.name}, free home service requests`,
    path, robots: 'index,follow',
    jsonld: { '@context': 'https://schema.org', '@graph': [crumbs([['Home', '/'], ['Cities', '/locations/'], [where, path]]), faqLd(faq), { '@type': 'Service', name: `Home services in ${where}`, serviceType: 'Home and yard services marketplace', areaServed: { '@type': 'City', name: c.name, containedInPlace: { '@type': 'State', name: c.stateName } }, provider: { '@type': 'Organization', name: BRAND, url: SITE } }] },
    body: `<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/locations/">Cities</a> / ${esc(c.name)}</nav>
<h1>Home services in ${esc(where)}</h1>
<p>${esc(c.climate)} ${esc(c.homes)}</p>
<p>${esc(BRAND)} lets ${esc(c.name)} neighbors post a home or yard job for free and get prices from local workers who cover their ZIP code. You choose who to hire and you pay the worker directly.</p>
<h2>What ${esc(c.name)} homes need through the year</h2><ul>${c.seasons.map((x) => `<li><strong>${esc(x.label)}.</strong> ${esc(x.text)}</li>`).join('')}</ul>
${jobs.length ? `<h2>Popular jobs in ${esc(c.name)}</h2><ul>${jobs.map((j) => `<li><a href="/services/${j.service}/">${esc(catName.get(j.service))}</a>: ${esc(j.why)}</li>`).join('')}</ul>` : ''}
<h2>How it works in ${esc(c.name)}</h2><ol><li>Post your job with the service, your ZIP code, the details and when you need it done.</li><li>Workers who cover your ZIP code can accept it with a price, or decline.</li><li>You pick the worker, agree on the work and pay them directly, then leave a review.</li></ol>
<h2>Frequently asked questions</h2>${faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')}
<h2>Cities nearby</h2><ul class="cities">${c.nearby.map((n) => cityBySlug.get(n)).filter(Boolean).map((n) => `<li><a href="/locations/${n.slug}/">${esc(n.name)}, ${n.state}</a></li>`).join('')}</ul>
<p>Looking for ideas? Read our <a href="/blog">home service guides</a> or <a href="/services/">browse all services</a>.</p>
<p><a class="cta" href="/signup">Post a job in ${esc(c.name)}</a> <a class="cta y" href="/signup?role=worker">Join as a worker in ${esc(c.name)}</a></p>`,
  }))
}

await writeFile(`${OUT}/sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${SITE}${u.path}</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod><priority>${u.pri}</priority></url>`).join('\n')}\n</urlset>\n`)
await writeFile(`${OUT}/robots.txt`, `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /chat/\nDisallow: /post\nDisallow: /my-requests\nDisallow: /profile\nDisallow: /feed\nDisallow: /dashboard\nDisallow: /onboarding\nDisallow: /notifications\nDisallow: /login\nDisallow: /signup\nSitemap: ${SITE}/sitemap.xml\nSitemap: ${SITE}/sitemap-blog.xml\n`)
await writeFile(`${OUT}/llms.txt`, `# ${BRAND}\n> Free marketplace connecting clients with local home-service workers anywhere in the United States. ${DISCLAIMER}\n\n## Key pages\n- [How ${BRAND} works](${SITE}/how-it-works): post a request, workers send prices, you pay the worker directly\n- [All services](${SITE}/services/): every home service that can be requested\n- [Cities](${SITE}/locations/): city guides with seasonal home needs and local FAQs\n- [Blog](${SITE}/blog): home service guides and cost guides\n- [Terms](${SITE}/legal/terms), [Privacy](${SITE}/legal/privacy), [Community Guidelines](${SITE}/legal/guidelines), [Disclaimer](${SITE}/legal/disclaimer)\n\n## Services\n${enabledCats.map((c) => `- [${c.name}](${SITE}/services/${c.id}/)`).join('\n')}\n`)
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
