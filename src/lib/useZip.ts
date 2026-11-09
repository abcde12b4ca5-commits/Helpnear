import { useEffect, useState } from 'react'
import { lookupZip, type ZipInfo } from './geo'

/** Looks up a 5-digit ZIP as the user types. `checked` is true once the lookup for the current ZIP finished. */
export function useZipLookup(zip: string): { info: ZipInfo | null; checked: boolean } {
  const [res, setRes] = useState<{ zip: string; info: ZipInfo | null } | null>(null)
  useEffect(() => {
    if (!/^[0-9]{5}$/.test(zip)) return
    let active = true
    lookupZip(zip).then((info) => { if (active) setRes({ zip, info }) })
    return () => { active = false }
  }, [zip])
  const current = res && res.zip === zip ? res : null
  return { info: current?.info ?? null, checked: current !== null }
}
