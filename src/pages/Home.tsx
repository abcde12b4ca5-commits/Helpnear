import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'

const IMG = {
  handy: '/img/handy.jpg',
  lawn: '/img/lawn.jpg',
  pressure: '/img/pressure.jpg',
  tv: '/img/tv.jpg',
  furn: '/img/furn.jpg',
}
const bg = (src: string) => ({ backgroundImage: `url(${src})` })

const SERVICES = [
  { n: '01', title: 'Handyman', label: 'handyman', text: 'Cabinets, shelves, doors and small fixes. Describe it once and get quotes from people nearby.', img: IMG.handy, alt: 'Handyman fitting a kitchen cabinet', bg: '#ffd23f', fg: '#0b1020' },
  { n: '02', title: 'Lawn care', label: 'lawn care', text: 'Mowing, edging and full yard cleanups, one-time or every week.', img: IMG.lawn, alt: 'Man mowing a green lawn', bg: '#1f4bff', fg: '#fff' },
  { n: '03', title: 'Pressure washing', label: 'pressure washing', text: 'Driveways, patios, fences and siding, washed back to new.', img: IMG.pressure, alt: 'Man pressure washing a driveway', bg: '#0b1020', fg: '#fff' },
  { n: '04', title: 'TV mounting', label: 'tv mounting', text: 'Level, secure and cable-tidy mounting on any wall.', img: IMG.tv, alt: 'Two workers mounting a wall TV', bg: '#ff7a45', fg: '#0b1020' },
  { n: '05', title: 'Furniture assembly', label: 'furniture assembly', text: 'Beds, desks and shelving built right, with the boxes hauled away.', img: IMG.furn, alt: 'Man assembling a wooden shelf', bg: '#19c37d', fg: '#0b1020' },
]
const MARQUEE = ['Handyman', 'Lawn care', 'Pressure washing', 'TV mounting', 'Furniture assembly', 'Cleaning', 'Painting', 'Gutters']
const STEPS = [
  { n: '1', title: 'Post it', text: 'Choose the service, add your ZIP and a few details.' },
  { n: '2', title: 'Get prices', text: 'Only workers who cover your area see it, and send you an offer.' },
  { n: '3', title: 'Done & rated', text: 'Pay the worker directly, then leave a review for your neighbors.' },
]
const NUMBERS: { n: number; suffix?: string; prefix?: string; label: string }[] = [
  { n: 50, label: 'states covered' },
  { n: 15, suffix: '+', label: 'services' },
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
  const primary = isWorker ? { to: '/feed', label: 'See requests →' } : isClient ? { to: '/post', label: 'Post a request →' } : { to: '/signup', label: 'Post a request →' }
  const secondary = isWorker ? { to: '/dashboard', label: 'My jobs' } : isClient ? { to: '/my-requests', label: 'My requests' } : { to: '/signup?role=worker', label: 'I’m a worker' }
  const finalCta = user ? primary : { to: '/signup', label: 'Get started free →' }
  const serviceLink = (label: string) => isWorker ? { to: '/feed', text: `See ${label} requests →` } : { to: isClient ? '/post' : '/signup', text: `Post a ${label} job →` }

  return (
    <div ref={root}>
      <header className="hn-hero">
        <div className="hn-w hn-hg">
          <div>
            <span className="hn-chip">Now open across the U.S.</span>
            <h1 className="hn-h1">Hire local. <u>Get it done.</u></h1>
            <p className="hn-lead">Post your home job in a minute. Workers who cover your ZIP code see it and send you a price. Free to use, and you pay them directly.</p>
            <div className="hn-cta">
              <Link className="hn-btn hn-btn-lg" to={primary.to}>{primary.label}</Link>
              <Link className="hn-btn hn-btn-lg hn-y" to={secondary.to}>{secondary.label}</Link>
            </div>
          </div>
          <div className="hn-px" aria-label="Local workers at work">
            <span className="hn-stk a">4 workers nearby</span>
            <span className="hn-stk b">✓ Job accepted</span>
            <div className="hn-pc" data-s="-.07">
              <div className="hn-pi" role="img" aria-label="Handyman fitting a kitchen cabinet" style={bg(IMG.handy)} />
              <div className="hn-pi" role="img" aria-label="Man pressure washing a driveway" style={bg(IMG.pressure)} />
              <div className="hn-pi" role="img" aria-label="Man assembling a wooden shelf" style={bg(IMG.furn)} />
            </div>
            <div className="hn-pc b2" data-s=".07">
              <div className="hn-pi" role="img" aria-label="Man mowing a green lawn" style={bg(IMG.lawn)} />
              <div className="hn-pi" role="img" aria-label="Two workers mounting a wall TV" style={bg(IMG.tv)} />
              <div className="hn-pi" role="img" aria-label="Handyman fitting a kitchen cabinet" style={bg(IMG.handy)} />
            </div>
          </div>
        </div>
      </header>

      <div className="hn-mq" aria-hidden="true">
        <div className="hn-mt">
          {[...MARQUEE, ...MARQUEE].map((m, i) => <span key={i}>{m}</span>)}
        </div>
      </div>

      <section id="services" className="hn-sec">
        <div className="hn-w">
          <p className="hn-k hn-rv">Services</p>
          <h2 className="hn-h2 hn-rv">Pick a job. We’ll bring the neighbors.</h2>
          <div className="hn-stack">
            {SERVICES.map((s, i) => {
              const l = serviceLink(s.label)
              return (
                <article key={s.n} className="hn-sk" style={{ ['--i' as string]: i, background: s.bg, color: s.fg }}>
                  <div className="hn-st">
                    <span className="hn-no">{s.n}</span>
                    <h3>{s.title}</h3>
                    <p>{s.text}</p>
                    <Link className="hn-bt" to={l.to}>{l.text}</Link>
                  </div>
                  <div className="hn-im" role="img" aria-label={s.alt} style={bg(s.img)} />
                </article>
              )
            })}
          </div>
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

      <div className="hn-fin hn-rv" role="img" aria-label="Two workers mounting a wall TV">
        <div>
          <h2 className="hn-h2">Your neighbor is ready.</h2>
          <Link className="hn-btn hn-btn-lg hn-y" style={{ marginTop: '1.5rem' }} to={finalCta.to}>{finalCta.label}</Link>
        </div>
      </div>
    </div>
  )
}
