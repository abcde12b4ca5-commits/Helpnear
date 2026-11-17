import { useEffect } from 'react'

// Site-wide scroll effects: a progress bar under the top edge, and a soft rise-in for cards and tiles as they enter the screen.
// Only opacity and transform change, so nothing moves the layout. Skipped completely for visitors who ask for reduced motion.
const SELECTOR = 'main .hn-card, main .hn-tg li, main .hn-hr, main [data-reveal]'

export function useScrollFx(path: string): void {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const bar = document.getElementById('hn-progress')
    let ticking = false
    const onScroll = () => {
      if (ticking || !bar) return
      ticking = true
      requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight
        bar.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`
        ticking = false
      })
    }
    if (!reduce) { window.addEventListener('scroll', onScroll, { passive: true }); onScroll() }

    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } })
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' })

    const tag = () => {
      document.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => {
        if (el.dataset.fx) return
        el.dataset.fx = '1'
        if (reduce || el.classList.contains('in')) { el.classList.add('in'); return }
        const index = Array.prototype.indexOf.call(el.parentElement?.children ?? [], el)
        el.style.setProperty('--d', String(Math.min(Math.max(index, 0), 6)))
        el.classList.add('hn-rv')
        io.observe(el)
      })
      document.querySelectorAll<HTMLElement>('.hn-rv:not(.in):not([data-fx])').forEach((el) => { el.dataset.fx = '1'; if (reduce) el.classList.add('in'); else io.observe(el) })
    }
    tag()
    let queued = false
    const mo = new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; tag() }) })
    const main = document.getElementById('main')
    if (main) mo.observe(main, { childList: true, subtree: true })
    return () => { window.removeEventListener('scroll', onScroll); io.disconnect(); mo.disconnect() }
  }, [path])
}
