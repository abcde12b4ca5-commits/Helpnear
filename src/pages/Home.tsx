import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'

// Imported (not hard-coded paths) so Vite gives each file a content hash: they are cached for a year and never go stale.
import handyS from '../assets/img/handy-s.webp'
import lawnS from '../assets/img/lawn-s.webp'
import pressureS from '../assets/img/pressure-s.webp'
import tvS from '../assets/img/tv-s.webp'
import furnS from '../assets/img/furn-s.webp'
// Small tiles for the hero (shown about 280px wide), so the first screen downloads few bytes.
const TILE = { handy: handyS, lawn: lawnS, pressure: pressureS, tv: tvS, furn: furnS }
const bg = (src: string) => ({ backgroundImage: `url(${src})` })

import { TRADES } from '../lib/trades'
const MARQUEE = TRADES.map(([, n]) => n)
const SIDES = [
  { k: 'For workers', title: 'Want more work?', cls: 'w', points: ['Choose your trades, then your area: around your location, or the cities you pick.', 'See new requests near you and send your price.', 'No platform fee on jobs, and every review builds your name.'] },
  { k: 'For clients', title: 'Need a hand?', cls: 'c', points: ['Post the job in a minute and pick your city.', 'Workers who cover your area send you a price.', 'Pick one, pay them directly, and leave a review.'] },
]
const STEPS = [
  { n: '1', title: 'Post it or join', text: 'Clients describe the job. Workers pick their trades and the areas they cover.' },
  { n: '2', title: 'Get prices', text: 'Only workers who cover that city see the request, and they send an offer.' },
  { n: '3', title: 'Done & rated', text: 'They agree the details and the worker is paid directly. Then both leave a review.' },
]
const NUMBERS: { n: number; suffix?: string; prefix?: string; label: string }[] = [
  { n: 50, label: 'states covered' },
  { n: TRADES.length, label: 'trades open' },
  { n: 5, label: 'workers per request, max' },
  { n: 0, prefix: '$', label: 'platform fee on jobs' },
]

export default function Home() {
  const { user, profile } = useAuth()
  const root = useRef<HTMLDivElement>(null)

  // Scroll effects: hero parallax, reveal-on-scroll, count-up numbers. All skipped for reduced motion.
  useEffect(() => {
    const el = root.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const cols = Array.from(el.querySelectorAll<HTMLElement>('.hn-pc'))
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        const y = window.scrollY
        if (!reduce) cols.forEach((c) => { c.style.transform = `translateY(${y * Number(c.dataset.s)}px)` })
        ticking = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    const reveal = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); reveal.unobserve(e.target) } })
    }, { threshold: 0.15 })
    el.querySelectorAll('.hn-rv').forEach((n) => reveal.observe(n))

    const counters = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return
        counters.unobserve(e.target)
        e.target.querySelectorAll<HTMLElement>('[data-n]').forEach((node) => {
          const target = Number(node.dataset.n), suffix = node.dataset.s ?? '', prefix = node.dataset.p ?? ''
          if (reduce) { node.textContent = `${prefix}${target}${suffix}`; return }
          let t0: number | null = null
          const step = (ts: number) => {
            t0 = t0 ?? ts
            const k = Math.min((ts - t0) / 1400, 1)
            node.textContent = `${prefix}${Math.round(target * (1 - Math.pow(1 - k, 3)))}${suffix}`
            if (k < 1) requestAnimationFrame(step)
          }
          requestAnimationFrame(step)
        })
      })
    }, { threshold: 0.4 })
    const nm = el.querySelector('#nm')
    if (nm) counters.observe(nm)

    return () => { window.removeEventListener('scroll', onScroll); reveal.disconnect(); counters.disconnect() }
  }, [])

  const isWorker = Boolean(user && profile?.role === 'worker')
  const isClient = Boolean(user && profile?.role === 'client')
  // Signed-out visitors get two equally strong buttons; signed-in users get their own dashboard first.
  const hireBtn = isClient ? { to: '/post', label: 'Post a request →' } : { to: '/signup', label: 'I need help →' }
  const workBtn = isWorker ? { to: '/feed', label: 'See requests →' } : { to: '/signup?role=worker', label: 'I’m a worker →' }
  const finalCta = isWorker ? workBtn : isClient ? hireBtn : null

  return (
    <div ref={root}>
      <header className="hn-hero">
        <div className="hn-w hn-hg">
          <div>
            <span className="hn-chip">Now open across the U.S.</span>
            <h1 className="hn-h1">Find work. Find help. <u>Next door.</u></h1>
            <p className="hn-lead">Clients post a job in a minute. Workers who cover that city see it and send a price. Free to use, and you deal with each other directly.</p>
            <div className="hn-cta">
              <Link className="hn-btn hn-btn-lg hn-y" to={workBtn.to}>{workBtn.label}</Link>
              <Link className="hn-btn-ghost hn-btn-lg" to={hireBtn.to}>{isClient ? hireBtn.label : 'Need a worker? Post a job →'}</Link>
            </div>
          </div>
          <div className="hn-px" aria-label="Local workers at work">
            <span className="hn-stk a">4 workers nearby</span>
            <span className="hn-stk b">✓ Job accepted</span>
            <div className="hn-pc" data-s="-.07">
              <div className="hn-pi" role="img" aria-label="Handyman fitting a kitchen cabinet" style={bg(TILE.handy)} />
              <div className="hn-pi" role="img" aria-label="Man pressure washing a driveway" style={bg(TILE.pressure)} />
              <div className="hn-pi" role="img" aria-label="Man assembling a wooden shelf" style={bg(TILE.furn)} />
            </div>
            <div className="hn-pc b2" data-s=".07">
              <div className="hn-pi" role="img" aria-label="Man mowing a green lawn" style={bg(TILE.lawn)} />
              <div className="hn-pi" role="img" aria-label="Two workers mounting a wall TV" style={bg(TILE.tv)} />
              <div className="hn-pi" role="img" aria-label="Handyman fitting a kitchen cabinet" style={bg(TILE.handy)} />
            </div>
          </div>
        </div>
      </header>

      <div className="hn-mq" aria-hidden="true">
        <div className="hn-mt">
          {[...MARQUEE, ...MARQUEE].map((m, i) => <span key={i}>{m}</span>)}
        </div>
      </div>

      <section className="hn-sec" aria-label="Who it is for">
        <div className="hn-w hn-two">
          {SIDES.map((x) => (
            <article key={x.k} className={`hn-side ${x.cls} hn-rv`}>
              <p className="hn-k">{x.k}</p>
              <h2>{x.title}</h2>
              <ul>{x.points.map((t) => <li key={t}>{t}</li>)}</ul>
              <Link className="hn-btn hn-btn-lg" to={x.cls === 'c' ? hireBtn.to : workBtn.to}>{x.cls === 'c' ? hireBtn.label : workBtn.label}</Link>
            </article>
          ))}
        </div>
      </section>

      <section id="services" className="hn-sec" style={{ paddingTop: '1rem' }}>
        <div className="hn-w">
          <p className="hn-k hn-rv">Trades</p>
          <h2 className="hn-h2 hn-rv">Pick a job. We’ll bring the workers.</h2>
          <ul className="hn-tg hn-rv">
            {TRADES.map(([id, name], i) => (
              <li key={id}><a href={`/services/${id}/`}><span>{String(i + 1).padStart(2, '0')}</span>{name}</a></li>
            ))}
          </ul>
          <p className="hn-rv hn-fine">More trades open over time. Trades that need a license, like electrical, plumbing and HVAC, open once we can verify licenses. <a className="hn-bt" href="/services/">See every service →</a></p>
        </div>
      </section>

      <section id="how" className="hn-sec" style={{ paddingTop: '2rem' }}>
        <div className="hn-w">
          <p className="hn-k hn-rv">How it works</p>
          <h2 className="hn-h2 hn-rv">Three steps. No hunting.</h2>
          <div className="hn-hw">
            {STEPS.map((s) => (
              <div key={s.n} className="hn-hr hn-rv">
                <b>{s.n}</b>
                <div><h3>{s.title}</h3><p>{s.text}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="hn-nm hn-rv" id="nm">
        {NUMBERS.map((x) => (
          <div key={x.label}>
            <b data-n={x.n} data-s={x.suffix} data-p={x.prefix}>{`${x.prefix ?? ''}${x.n}${x.suffix ?? ''}`}</b>
            <span>{x.label}</span>
          </div>
        ))}
      </div>

      <div className="hn-fin hn-rv">
        <div>
          <h2 className="hn-h2">Your worker is ready.</h2>
          <div className="hn-cta" style={{ justifyContent: 'center' }}>
            {finalCta ? <Link className="hn-btn hn-btn-lg hn-y" to={finalCta.to}>{finalCta.label}</Link> : (<>
              <Link className="hn-btn hn-btn-lg hn-y" to={workBtn.to}>{workBtn.label}</Link>
              <Link className="hn-btn-ghost hn-btn-lg" to={hireBtn.to}>{hireBtn.label}</Link>
            </>)}
          </div>
        </div>
      </div>
    </div>
  )
}
