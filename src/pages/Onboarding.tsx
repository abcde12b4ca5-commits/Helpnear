import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { brand } from '../config/brand'
import { db } from '../lib/firebase'
import { useAuth } from '../lib/auth'
import { getAppConfig, getCategories, DEFAULT_CONFIG } from '../lib/catalog'
import { CELL_PRECISION, MAX_MATCH_KEYS, MAX_WORK_CITIES, RADIUS_OPTIONS, cellsCovering, encodeGeohash, loadCities, matchKeysFor, placeKey, type Place } from '../lib/geo'
import PlacePicker from '../components/PlacePicker'
import { friendlyError } from '../lib/errors'
import { ErrorBox, Field, Spinner, btn, btnGhost, input } from '../components/ui'
import type { AppConfig, Category } from '../lib/types'

export default function Onboarding() {
  const { user, profile, worker, refresh } = useAuth()
  const nav = useNavigate()
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG)
  const [cats, setCats] = useState<Category[] | null>(null)
  const [selCats, setSelCats] = useState<string[]>(worker?.categories ?? [])
  const [mode, setMode] = useState<'radius' | 'cities'>(worker?.workMode ?? 'radius')
  const [center, setCenter] = useState<Place | null>(worker ? { city: worker.city, state: worker.state, lat: worker.lat, lng: worker.lng, zip: worker.baseZip } : null)
  const [radius, setRadius] = useState<number>(worker?.radiusMiles ?? 25)
  const [workCities, setWorkCities] = useState<Place[]>([])
  useEffect(() => {
    if (worker?.workMode !== 'cities' || !worker.cities?.length) return
    loadCities().then((all) => setWorkCities(worker.cities!.map((k) => all.find((p) => placeKey(p) === k)).filter((p): p is Place => Boolean(p)))).catch(() => undefined)
  }, [worker])
  const regionState = mode === 'radius' ? center?.state : workCities[0]?.state
  const addCity = (p: Place) => setWorkCities((l) => (l.some((x) => placeKey(x) === placeKey(p)) || l.length >= MAX_WORK_CITIES ? l : [...l, p]))
  const [confirmed, setConfirmed] = useState<string[]>(worker?.confirmedCategories ?? [])
  const [bio, setBio] = useState(worker?.bio ?? '')
  const [name, setName] = useState(worker?.displayName ?? profile?.displayName ?? '')
  const [q, setQ] = useState('')
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
    const chosen = selCats.filter((c) => cats?.some((x) => x.id === c && !x.disabledStates?.includes(regionState ?? '')))
    if (chosen.length === 0) { setError('Choose at least one service.'); return }
    if (mode === 'radius' && !center) { setError('Choose where you are based: type your city or tap "Use my location".'); return }
    if (mode === 'cities' && workCities.length === 0) { setError('Add at least one city you want to work in.'); return }
    const home = mode === 'radius' ? center! : workCities[0]
    const cells = mode === 'radius' ? cellsCovering(home.lat, home.lng, radius) : [...new Set(workCities.map((c) => encodeGeohash(c.lat, c.lng, CELL_PRECISION)))]
    const matchKeys = matchKeysFor(chosen, cells)
    if (matchKeys.length > MAX_MATCH_KEYS) { setError('That is too much area for this many services. Pick a smaller radius or fewer services.'); return }
    if (!chosen.every((c) => confirmed.includes(c))) { setError('Please confirm the allowed services for every category you selected.'); return }
    setBusy(true); setError(null)
    const cleanName = name.trim()
    if (!cleanName) { setError('Please enter your name.'); return }
    const base = { displayName: cleanName, bio: bio.trim(), categories: chosen, baseZip: home.zip, city: home.city, state: home.state, lat: home.lat, lng: home.lng, radiusMiles: mode === 'radius' ? radius : 25, workMode: mode, cities: mode === 'cities' ? workCities.map(placeKey) : [], matchKeys, confirmedCategories: confirmed.filter((c) => chosen.includes(c)), licenseNote: license.trim(), insuranceNote: insurance.trim() }
    try {
      if (worker) await updateDoc(doc(db, `workers/${user.uid}`), base)
      else await setDoc(doc(db, `workers/${user.uid}`), { ...base, ratingCount: 0, ratingAverage: 0, isListed: true, createdAt: serverTimestamp() })
      if (cleanName !== profile.displayName) await updateDoc(doc(db, `users/${user.uid}`), { displayName: cleanName })
      await refresh()
      nav(worker ? '/profile' : '/feed')
    } catch (err) { setError(friendlyError(err)) } finally { setBusy(false) }
  }

  const maxCats = Math.min(config.maxCategoriesPerWorker, 5)
  if (!cats) return error ? <ErrorBox message={error} /> : <Spinner />
  const visible = cats.filter((c) => !c.disabledStates?.includes(regionState ?? '')).filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()) || c.allowedServices.some((x) => x.toLowerCase().includes(q.trim().toLowerCase())))
  return (
    <form onSubmit={submit} className="max-w-4xl space-y-6">
      <div><h1 className="text-4xl">{worker ? 'Edit your profile' : 'Your worker profile'}</h1><p className="mt-2 text-mu">Pick the services you offer. When a request near you matches, you get notified and can accept or decline.</p></div>
      <Field label="Your name" htmlFor="wname" hint="Shown to clients on your profile."><input id="wname" required maxLength={60} className={input} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <section aria-labelledby="svc">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="svc" className="text-xl">Services you offer</h2>
          <p className="text-sm text-mu" role="status">{selCats.length} of {maxCats} chosen</p>
        </div>
        <input aria-label="Search services" type="search" placeholder="Search services, for example “lawn” or “paint”" className={`${input} mt-3`} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="hn-pick" role="group" aria-labelledby="svc">
          {visible.map((c) => {
            const on = selCats.includes(c.id)
            return <button type="button" key={c.id} className="hn-chipbtn" aria-pressed={on} disabled={!on && selCats.length >= maxCats} onClick={() => toggleCat(c.id)}>{c.name}</button>
          })}
          {visible.length === 0 && <p className="text-sm text-mu">No service matches “{q}”.</p>}
        </div>
        {selCats.length > 0 && (
          <div className="mt-5 space-y-3">
            <h3 className="text-base">Confirm what you will do</h3>
            {selCats.map((id) => {
              const c = cats.find((x) => x.id === id)
              if (!c) return null
              return (
                <div key={id} className="hn-tile on">
                  <p className="text-sm font-semibold">{c.name}</p>
                  <p className="mt-1 text-xs font-normal text-mu">Allowed: {c.allowedServices.join('; ')}</p>
                  <label className="mt-2 flex items-start gap-2 text-xs font-normal text-mu"><input type="checkbox" className="mt-0.5" checked={confirmed.includes(id)} onChange={(e) => setConfirmed(e.target.checked ? [...confirmed, id] : confirmed.filter((x) => x !== id))} /> I will only perform the allowed services in this category.</label>
                </div>
              )
            })}
          </div>
        )}
      </section>
      <section aria-labelledby="areas" className="space-y-3">
        <h2 id="areas" className="text-xl">Where you work</h2>
        <p className="text-sm text-mu">Choose how you want to receive requests. You can change it any time.</p>
        <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="How you receive requests">
          <button type="button" className="hn-tile" data-on={mode === 'radius'} aria-pressed={mode === 'radius'} onClick={() => setMode('radius')}>
            <span className="block text-sm font-semibold">Around my location</span>
            <span className="mt-1 block text-xs font-normal text-mu">Set where you are and how far you will travel. Every request inside that distance reaches you.</span>
          </button>
          <button type="button" className="hn-tile" data-on={mode === 'cities'} aria-pressed={mode === 'cities'} onClick={() => setMode('cities')}>
            <span className="block text-sm font-semibold">Cities I choose</span>
            <span className="mt-1 block text-xs font-normal text-mu">Pick up to {MAX_WORK_CITIES} cities. You get the requests posted in those cities.</span>
          </button>
        </div>
        {mode === 'radius' ? (<>
          {center && <p className="text-sm" role="status">Based in <strong>{center.city}, {center.state}</strong></p>}
          <PlacePicker id="base-place" label={center ? 'Change your location' : 'Where are you based?'} hint="Type your city or let us find it from your location." onPick={setCenter} />
          <Field label="How far will you travel?" htmlFor="radius">
            <select id="radius" className={input} value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
              {RADIUS_OPTIONS.map((r) => <option key={r} value={r}>{r} miles</option>)}
            </select>
          </Field>
        </>) : (<>
          <ul className="flex flex-wrap gap-2" aria-label="Your cities">
            {workCities.map((c) => (
              <li key={placeKey(c)}><button type="button" className="hn-chipbtn" aria-label={`Remove ${c.city}, ${c.state}`} onClick={() => setWorkCities((l) => l.filter((x) => placeKey(x) !== placeKey(c)))}>{c.city}, {c.state} ✕</button></li>
            ))}
          </ul>
          <p className="text-xs text-mu" role="status">{workCities.length} of {MAX_WORK_CITIES} cities</p>
          {workCities.length < MAX_WORK_CITIES && <PlacePicker id="add-city" label="Add a city" hint="Type the name, then tap it in the list." onPick={addCity} />}
        </>)}
      </section>
      <Field label="About you (optional)" htmlFor="bio"><textarea id="bio" maxLength={500} rows={3} className={input} value={bio} onChange={(e) => setBio(e.target.value)} /></Field>
      <Field label="License number (optional)" htmlFor="lic" hint={`Self-reported. Shown as: Self-reported, not verified by ${brand.name}.`}><input id="lic" maxLength={200} className={input} value={license} onChange={(e) => setLicense(e.target.value)} /></Field>
      <Field label="Insurance (optional)" htmlFor="ins" hint={`Self-reported. Shown as: Self-reported, not verified by ${brand.name}.`}><input id="ins" maxLength={200} className={input} value={insurance} onChange={(e) => setInsurance(e.target.value)} /></Field>
      <ErrorBox message={error} />
      <button className={btn} disabled={busy}>{busy ? 'Saving...' : 'Save profile'}</button>
      {worker && <Link className={`${btnGhost} ml-3`} to="/profile">Cancel</Link>}
    </form>
  )
}
