import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { brand } from '../config/brand'
import { db } from '../lib/firebase'
import { useAuth } from '../lib/auth'
import { getAppConfig, getCategories, DEFAULT_CONFIG } from '../lib/catalog'
import { MAX_MATCH_KEYS, RADIUS_OPTIONS, cellsCovering, matchKeysFor } from '../lib/geo'
import { useZipLookup } from '../lib/useZip'
import { friendlyError } from '../lib/errors'
import { ErrorBox, Field, Spinner, btn, card, input } from '../components/ui'
import type { AppConfig, Category } from '../lib/types'

export default function Onboarding() {
  const { user, profile, worker, refresh } = useAuth()
  const nav = useNavigate()
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG)
  const [cats, setCats] = useState<Category[] | null>(null)
  const [selCats, setSelCats] = useState<string[]>(worker?.categories ?? [])
  const [zip, setZip] = useState(worker?.baseZip ?? '')
  const [radius, setRadius] = useState<number>(worker?.radiusMiles ?? 25)
  const { info: zipInfo, checked: zipChecked } = useZipLookup(zip)
  const [confirmed, setConfirmed] = useState<string[]>(worker?.confirmedCategories ?? [])
  const [bio, setBio] = useState(worker?.bio ?? '')
  const [license, setLicense] = useState(worker?.licenseNote ?? '')
  const [insurance, setInsurance] = useState(worker?.insuranceNote ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([getAppConfig(), getCategories()])
      .then(([c, cs]) => { setConfig(c); setCats(cs.filter((x) => x.enabled)) })
      .catch((e) => setError(friendlyError(e)))
  }, [])


  const toggle = (list: string[], set: (v: string[]) => void, id: string, max: number) => {
    if (list.includes(id)) set(list.filter((x) => x !== id))
    else if (list.length < max) set([...list, id])
  }
  const toggleCat = (id: string) => {
    if (selCats.includes(id)) setConfirmed(confirmed.filter((x) => x !== id))
    toggle(selCats, setSelCats, id, Math.min(config.maxCategoriesPerWorker, 5))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!user || !profile) return
    const chosen = selCats.filter((c) => cats?.some((x) => x.id === c && !x.disabledStates?.includes(zipInfo?.state ?? '')))
    if (chosen.length === 0) { setError('Choose at least one service.'); return }
    if (!zipInfo) { setError('Enter a valid US ZIP code for the place you work from.'); return }
    const matchKeys = matchKeysFor(chosen, cellsCovering(zipInfo.lat, zipInfo.lng, radius))
    if (matchKeys.length > MAX_MATCH_KEYS) { setError('That is too much area for this many services. Pick a smaller radius or fewer services.'); return }
    if (!chosen.every((c) => confirmed.includes(c))) { setError('Please confirm the allowed services for every category you selected.'); return }
    setBusy(true); setError(null)
    const base = { displayName: profile.displayName, bio: bio.trim(), categories: chosen, baseZip: zipInfo.zip, city: zipInfo.city, state: zipInfo.state, lat: zipInfo.lat, lng: zipInfo.lng, radiusMiles: radius, matchKeys, confirmedCategories: confirmed.filter((c) => chosen.includes(c)), licenseNote: license.trim(), insuranceNote: insurance.trim() }
    try {
      if (worker) await updateDoc(doc(db, `workers/${user.uid}`), base)
      else await setDoc(doc(db, `workers/${user.uid}`), { ...base, ratingCount: 0, ratingAverage: 0, isListed: true, createdAt: serverTimestamp() })
      await refresh()
      nav('/feed')
    } catch (err) { setError(friendlyError(err)) } finally { setBusy(false) }
  }

  if (!cats) return error ? <ErrorBox message={error} /> : <Spinner />
  return (
    <form onSubmit={submit} className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Your worker profile</h1>
      <section aria-labelledby="svc">
        <h2 id="svc" className="font-semibold">Services you offer (up to {Math.min(config.maxCategoriesPerWorker, 5)})</h2>
        <div className="mt-2 space-y-2">
          {cats.filter((c) => !c.disabledStates?.includes(zipInfo?.state ?? '')).map((c) => (
            <div key={c.id} className={card}>
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={selCats.includes(c.id)} onChange={() => toggleCat(c.id)} /> {c.name}</label>
              {selCats.includes(c.id) && (
                <div className="mt-2 text-xs text-gray-700">
                  <p>Allowed: {c.allowedServices.join('; ')}</p>
                  <label className="mt-2 flex items-start gap-2"><input type="checkbox" className="mt-0.5" checked={confirmed.includes(c.id)} onChange={(e) => setConfirmed(e.target.checked ? [...confirmed, c.id] : confirmed.filter((x) => x !== c.id))} /> I will only perform the allowed services in this category.</label>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
      <section aria-labelledby="areas" className="space-y-3">
        <h2 id="areas" className="font-semibold">Where you work</h2>
        <Field label="Your base ZIP code" htmlFor="bzip" hint="Requests inside your radius around this ZIP are sent to you. Anywhere in the United States.">
          <input id="bzip" required inputMode="numeric" maxLength={5} className={input} value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, ''))} />
        </Field>
        {zipChecked && !zipInfo && <p role="alert" className="text-sm text-red-800">We could not find that ZIP code.</p>}
        {zipInfo && <p className="text-sm text-gray-700" role="status">{zipInfo.city}, {zipInfo.state}</p>}
        <Field label="How far will you travel?" htmlFor="radius">
          <select id="radius" className={input} value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
            {RADIUS_OPTIONS.map((r) => <option key={r} value={r}>{r} miles</option>)}
          </select>
        </Field>
      </section>
      <Field label="About you (optional)" htmlFor="bio"><textarea id="bio" maxLength={500} rows={3} className={input} value={bio} onChange={(e) => setBio(e.target.value)} /></Field>
      <Field label="License number (optional)" htmlFor="lic" hint={`Self-reported. Shown as: Self-reported, not verified by ${brand.name}.`}><input id="lic" maxLength={200} className={input} value={license} onChange={(e) => setLicense(e.target.value)} /></Field>
      <Field label="Insurance (optional)" htmlFor="ins" hint={`Self-reported. Shown as: Self-reported, not verified by ${brand.name}.`}><input id="ins" maxLength={200} className={input} value={insurance} onChange={(e) => setInsurance(e.target.value)} /></Field>
      <ErrorBox message={error} />
      <button className={btn} disabled={busy}>{busy ? 'Saving...' : 'Save profile'}</button>
    </form>
  )
}
