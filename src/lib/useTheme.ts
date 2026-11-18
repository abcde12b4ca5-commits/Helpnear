import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'
const KEY = 'hn-theme'
const current = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')

/** Night / day mode. The first visit follows the device setting; after the visitor taps the switch their choice is remembered in this browser. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(current)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      let chosen: string | null = null
      try { chosen = localStorage.getItem(KEY) } catch { /* private mode: follow the device */ }
      if (chosen === 'light' || chosen === 'dark') return
      const next: Theme = mq.matches ? 'dark' : 'light'
      document.documentElement.dataset.theme = next
      setTheme(next)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  const toggle = useCallback(() => {
    const next: Theme = current() === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try { localStorage.setItem(KEY, next) } catch { /* the choice just will not be remembered */ }
    setTheme(next)
  }, [])
  return [theme, toggle]
}
