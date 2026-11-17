import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { brand } from '../config/brand'
import { useAuth } from '../lib/auth'
import { findBlockedKeyword, getAppConfig, getCategories } from '../lib/catalog'
import { CELL_PRECISION, encodeGeohash } from '../lib/geo'
import PlacePicker from '../components/PlacePicker'
import type { Place } from '../lib/geo'
import { createRequests, getPostCooldownSeconds } from '../lib/requests'
import { friendlyError } from '../lib/errors'
import { ErrorBox, Field, Pill, Spinner, btn, btnGhost, card, input } from '../components/ui'
import type { Category, ContactMethod, Urgency } from '../lib/types'

const isPermissionDenied = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === 'permission-denied'

const MAX_POSITIONS = 5 // keep in sync with firestore.rules (request ids groupId-0 .. groupId-4)
const MAX_TOTAL_WORKERS = 10

interface Position { key: number; categoryId: string; workersNeeded: number; title: string; description: string }
const blankPosition = (key: number): Position => ({ key, categoryId: '', workersNeeded: 1, title: '', description: '' })

export default function NewRequest() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [cats, setCats] = useState<Category[] | null>(null)
  const [maxWorkers, setMaxWorkers] = useState(5)
  const [positions, setPositions] = useState<Position[]>([blankPosition(1)])
  const [nextKey, setNextKey] = useState(2)
  const [place, setPlace] = useState<Place | null>(null)
  const [urgency, setUrgency] = useState<Urgency>('this_week')
  const [budget, setBudget] = useState('')
  const [phone, setPhone] = useState('')
  const [contactEmail, setContactEmail] = useState(user?.email ?? '')
  const [method, setMethod] = useState<ContactMethod>('phone')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([getCategories(), getAppConfig()])
      .then(([cs, cfg]) => { setCats(cs.filter((c) => c.enabled)); setMaxWorkers(Math.min(cfg.maxWorkersPerRequest, MAX_TOTAL_WORKERS)) })
      .catch((e) => setError(friendlyError(e)))
  }, [])

  const total = positions.reduce((n, p) => n + p.workersNeeded, 0)
  const catOf = (id: string) => cats?.find((c) => c.id === id)
  const off = (p: Position) => Boolean(place && catOf(p.categoryId)?.disabledStates?.includes(place.state))
  const patch = (key: number, over: Partial<Position>) => setPositions((list) => list.map((p) => (p.key === key ? { ...p, ...over } : p)))
  const addPosition = () => { setPositions((l) => [...l, blankPosition(nextKey)]); setNextKey(nextKey + 1) }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    if (!place) { setError('Choose the city where the work is, or tap "Use my location".'); return }
    if (!phone.trim() && !contactEmail.trim()) { setError('Add a phone number or an email so workers can reach you.'); return }
    if (total > MAX_TOTAL_WORKERS) { setError(`You can ask for at most ${MAX_TOTAL_WORKERS} workers in one post.`); return }
    for (const [i, p] of positions.entries()) {
      const c = catOf(p.categoryId)
      const label = positions.length > 1 ? `Worker group ${i + 1}: ` : ''
      if (!c) { setError(`${label}choose a service.`); return }
      if (off(p)) { setError(`${label}${c.name} is not available in ${place.state} yet.`); return }
      const blocked = findBlockedKeyword(`${p.title} ${p.description}`, c.blockedKeywords)
      if (blocked) { setError(`${label}this service isn't available on ${brand.name} (mentions "${blocked}"). Regulated work needs a licensed professional.`); return }
    }
    setBusy(true); setError(null)
    try {
      const wait = await getPostCooldownSeconds(user.uid)
      if (wait > 0) { setError(`Please wait ${wait} more second${wait === 1 ? '' : 's'} before posting again.`); return }
      await createRequests({
        clientId: user.uid, zip: place.zip, city: place.city, state: place.state, lat: place.lat, lng: place.lng,
        cell: encodeGeohash(place.lat, place.lng, CELL_PRECISION), urgency, budgetRange: budget.trim(),
        contact: { phone: phone.trim(), email: contactEmail.trim(), preferredContactMethod: method },
        positions: positions.map((p) => ({ categoryId: p.categoryId, categoryName: catOf(p.categoryId)?.name ?? '', workersNeeded: p.workersNeeded, title: p.title.trim(), description: p.description.trim() })),
      })
      nav('/my-requests')
    } catch (err) {
      console.error('post failed', err)
      setError(isPermissionDenied(err) ? 'We could not post your request right now. Please try again in a minute. If it keeps happening, contact support.' : friendlyError(err))
    } finally { setBusy(false) }
  }

  if (!cats) return error ? <ErrorBox message={error} /> : <Spinner />
  const URG: [Urgency, string][] = [['asap', 'As soon as possible'], ['this_week', 'This week'], ['flexible', 'Flexible']]
  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_20rem]">
    <form onSubmit={submit} className="space-y-5">
      <div className="hn-in"><h1 className="text-4xl">Post a request</h1><p className="mt-2 text-mu">Takes about a minute. Workers who cover your city are notified.</p></div>
      <div className="hn-in max-w-xl" style={{ ['--i' as string]: 1 }}>
        <PlacePicker id="place" label="Where is the work?" hint="Pick the city, or let us find it from your location. We never show your exact address: you share it with the worker you choose." onPick={setPlace} />
        {place && <p className="mt-1 text-sm text-ok" style={{ color: 'var(--ok)' }} role="status">✓ {place.city}, {place.state}</p>}
      </div>

      <section aria-labelledby="who" className="space-y-3">
        <h2 id="who" className="text-2xl">Who do you need?</h2>
        <p className="text-sm text-mu">
          Need two people for the same job? Set the number of workers to 2 on one group. Need different jobs done (for example a cleaner and a painter)? Add another group.
          Workers accept with a price and you agree the price and the work with each worker before they start. Up to {MAX_POSITIONS} groups and {MAX_TOTAL_WORKERS} workers in total.
        </p>
        {positions.map((p, i) => {
          const c = catOf(p.categoryId)
          return (
            <div key={p.key} className={`${card} hn-in space-y-4`} style={{ ['--i' as string]: i + 2 }}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg">{positions.length > 1 ? `Worker group ${i + 1}` : 'Your request'}</h3>
                {positions.length > 1 && <button type="button" className={btnGhost} onClick={() => setPositions((l) => l.filter((x) => x.key !== p.key))}>Remove</button>}
              </div>
              <div role="group" aria-label="Service" className="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
                {cats.map((x) => <button type="button" key={x.id} className="hn-tile" aria-pressed={p.categoryId === x.id} onClick={() => patch(p.key, { categoryId: x.id })}>{x.name}</button>)}
              </div>
              {c && <p className="rounded-xl bg-bg p-3 text-xs text-mu">Allowed: {c.allowedServices.join('; ')}.{c.notes ? ` ${c.notes}` : ''} Work that needs a license (electrical, plumbing, HVAC, gas) is not allowed.</p>}
              {c && off(p) && place && <p role="alert" className="text-sm text-danger-tx">{c.name} is not available in {place.state} yet.</p>}
              <Field label="How many workers for this job?" htmlFor={`wn-${p.key}`}>
                <select id={`wn-${p.key}`} className={`${input} max-w-[8rem]`} value={p.workersNeeded} onChange={(e) => patch(p.key, { workersNeeded: Number(e.target.value) })}>
                  {Array.from({ length: maxWorkers }, (_, n) => n + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>
              <Field label="Title" htmlFor={`t-${p.key}`}><input id={`t-${p.key}`} required minLength={5} maxLength={100} className={input} value={p.title} onChange={(e) => patch(p.key, { title: e.target.value })} /></Field>
              <Field label="Details" htmlFor={`d-${p.key}`} hint="Describe what this worker (or these workers) will do. Do not include your phone number or address here; it is shared separately.">
                <textarea id={`d-${p.key}`} required minLength={10} maxLength={2000} rows={4} className={input} value={p.description} onChange={(e) => patch(p.key, { description: e.target.value })} />
              </Field>
            </div>
          )
        })}
        <button type="button" className={btnGhost} disabled={positions.length >= MAX_POSITIONS || total >= MAX_TOTAL_WORKERS} onClick={addPosition}>+ Add another kind of worker</button>
      </section>

      <fieldset>
        <legend className="mb-1.5 text-sm text-mu">How urgent?</legend>
        <div className="flex flex-wrap gap-2">
          {URG.map(([v, label]) => <button type="button" key={v} className="hn-tile" aria-pressed={urgency === v} onClick={() => setUrgency(v)}>{label}</button>)}
        </div>
      </fieldset>
      <div className="max-w-xs"><Field label="Budget (optional)" htmlFor="budget"><input id="budget" maxLength={40} placeholder="e.g. $100-$150" className={input} value={budget} onChange={(e) => setBudget(e.target.value)} /></Field></div>
      <fieldset className={`${card} grid gap-4 sm:grid-cols-2`}>
        <legend className="sr-only">Your contact details</legend>
        <div className="sm:col-span-2"><h3 className="text-lg">Your contact details</h3><p className="text-xs text-mu">Shown only to workers who accept your request.</p></div>
        <Field label="Phone" htmlFor="phone"><input id="phone" type="tel" maxLength={30} className={input} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Email" htmlFor="cemail"><input id="cemail" type="email" maxLength={120} className={input} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} /></Field>
        <div className="sm:col-span-2">
          <Field label="Preferred contact method" htmlFor="method">
            <select id="method" className={`${input} max-w-xs`} value={method} onChange={(e) => setMethod(e.target.value as ContactMethod)}>
              <option value="phone">Phone call</option><option value="text">Text message</option><option value="email">Email</option>
            </select>
          </Field>
        </div>
      </fieldset>
      <ErrorBox message={error} />
      <button className={`${btn} hn-btn-lg`} disabled={busy}>{busy ? 'Posting...' : positions.length > 1 ? `Post ${positions.length} worker groups` : 'Post request'}</button>
    </form>
    <aside className={`${card} hn-in h-max space-y-3 lg:sticky lg:top-24`} style={{ ['--i' as string]: 3 }} aria-label="Summary">
      <Pill tone="y">Summary</Pill>
      <h3 className="text-xl">{positions[0]?.title.trim() || 'Your request'}</h3>
      {([['Where', place ? `${place.city}, ${place.state}` : '-'], ['Groups', String(positions.length)], ['Total workers', String(total)], ['Urgency', URG.find(([v]) => v === urgency)?.[1] ?? ''], ['Fee', 'Free']] as const).map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 text-sm"><span className="text-mu">{k}</span><b className="text-right">{v}</b></div>
      ))}
      <p className="flex items-center gap-2 pt-2 text-sm text-mu"><span className="hn-dot" aria-hidden="true" />{place ? `Workers who cover ${place.city} are notified` : 'Workers who cover your city are notified'}</p>
    </aside>
    </div>
  )
}
