import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { brand } from '../config/brand'
import { useAuth } from '../lib/auth'
import { findBlockedKeyword, getAppConfig, getCategories } from '../lib/catalog'
import { CELL_PRECISION, encodeGeohash } from '../lib/geo'
import { useZipLookup } from '../lib/useZip'
import { createRequests, getPostCooldownSeconds } from '../lib/requests'
import { friendlyError } from '../lib/errors'
import { auth } from '../lib/firebase'
import { ErrorBox, Field, Spinner, btn, btnGhost, card, input } from '../components/ui'
import type { Category, ContactMethod, Urgency } from '../lib/types'

const isPermissionDenied = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === 'permission-denied'

const MAX_POSITIONS = 5 // keep in sync with firestore.rules (request ids groupId-0 .. groupId-4)
const MAX_TOTAL_WORKERS = 10

interface Position { key: number; categoryId: string; workersNeeded: number; title: string; description: string }
const blankPosition = (key: number): Position => ({ key, categoryId: '', workersNeeded: 1, title: '', description: '' })

export default function NewRequest() {
  const { user, refresh } = useAuth()
  const nav = useNavigate()
  const [cats, setCats] = useState<Category[] | null>(null)
  const [maxWorkers, setMaxWorkers] = useState(5)
  const [positions, setPositions] = useState<Position[]>([blankPosition(1)])
  const [nextKey, setNextKey] = useState(2)
  const [zip, setZip] = useState('')
  const { info: zipInfo, checked: zipChecked } = useZipLookup(zip)
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
  const off = (p: Position) => Boolean(zipInfo && catOf(p.categoryId)?.disabledStates?.includes(zipInfo.state))
  const patch = (key: number, over: Partial<Position>) => setPositions((list) => list.map((p) => (p.key === key ? { ...p, ...over } : p)))
  const addPosition = () => { setPositions((l) => [...l, blankPosition(nextKey)]); setNextKey(nextKey + 1) }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    if (!zipInfo) { setError('Enter a valid US ZIP code for where the work is.'); return }
    if (!phone.trim() && !contactEmail.trim()) { setError('Add a phone number or an email so workers can reach you.'); return }
    if (total > MAX_TOTAL_WORKERS) { setError(`You can ask for at most ${MAX_TOTAL_WORKERS} workers in one post.`); return }
    for (const [i, p] of positions.entries()) {
      const c = catOf(p.categoryId)
      const label = positions.length > 1 ? `Worker group ${i + 1}: ` : ''
      if (!c) { setError(`${label}choose a service.`); return }
      if (off(p)) { setError(`${label}${c.name} is not available in ${zipInfo.state} yet.`); return }
      const blocked = findBlockedKeyword(`${p.title} ${p.description}`, c.blockedKeywords)
      if (blocked) { setError(`${label}this service isn't available on ${brand.name} (mentions "${blocked}"). Regulated work needs a licensed professional.`); return }
    }
    setBusy(true); setError(null)
    try {
      // Refresh the sign-in token first: verifying the email in another tab does not reach this page until the token is renewed.
      await refresh().catch(() => undefined)
      if (!auth.currentUser?.emailVerified) { setError('Please verify your email first. Open the link we sent you, then press "I have verified" in the yellow banner at the top.'); return }
      const wait = await getPostCooldownSeconds(user.uid)
      if (wait > 0) { setError(`Please wait ${wait} more second${wait === 1 ? '' : 's'} before posting again.`); return }
      await createRequests({
        clientId: user.uid, zip: zipInfo.zip, city: zipInfo.city, state: zipInfo.state, lat: zipInfo.lat, lng: zipInfo.lng,
        cell: encodeGeohash(zipInfo.lat, zipInfo.lng, CELL_PRECISION), urgency, budgetRange: budget.trim(),
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
  return (
    <form onSubmit={submit} className="max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">Post a request</h1>
      <Field label="ZIP code where the work is" htmlFor="zip" hint="Workers who cover this ZIP are notified. Anywhere in the United States.">
        <input id="zip" required inputMode="numeric" maxLength={5} className={input} value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, ''))} />
      </Field>
      {zipChecked && !zipInfo && <p role="alert" className="text-sm text-red-800">We could not find that ZIP code.</p>}
      {zipInfo && <p className="text-sm text-gray-700" role="status">{zipInfo.city}, {zipInfo.state}</p>}

      <section aria-labelledby="who" className="space-y-3">
        <h2 id="who" className="font-semibold">Who do you need?</h2>
        <p className="text-xs text-gray-600">
          Need two people for the same job? Set the number of workers to 2 on one group. Need different jobs done (for example a cleaner and a painter)? Add another group, each with its own service and details.
          Workers accept with a price and you agree the price and the work with each worker before they start. Up to {MAX_POSITIONS} groups and {MAX_TOTAL_WORKERS} workers in total.
        </p>
        {positions.map((p, i) => {
          const c = catOf(p.categoryId)
          return (
            <div key={p.key} className={`${card} space-y-3`}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{positions.length > 1 ? `Worker group ${i + 1}` : 'Your request'}</h3>
                {positions.length > 1 && <button type="button" className={btnGhost} onClick={() => setPositions((l) => l.filter((x) => x.key !== p.key))}>Remove</button>}
              </div>
              <Field label="Service" htmlFor={`cat-${p.key}`}>
                <select id={`cat-${p.key}`} required className={input} value={p.categoryId} onChange={(e) => patch(p.key, { categoryId: e.target.value })}>
                  <option value="">Choose a service</option>
                  {cats.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </Field>
              {c && <p className="rounded-md bg-gray-100 p-3 text-xs text-gray-700">Allowed: {c.allowedServices.join('; ')}.{c.notes ? ` ${c.notes}` : ''} Work that needs a license (electrical, plumbing, HVAC, gas) is not allowed.</p>}
              {c && off(p) && zipInfo && <p role="alert" className="text-sm text-red-800">{c.name} is not available in {zipInfo.state} yet.</p>}
              <Field label="How many workers for this job?" htmlFor={`wn-${p.key}`}>
                <select id={`wn-${p.key}`} className={input} value={p.workersNeeded} onChange={(e) => patch(p.key, { workersNeeded: Number(e.target.value) })}>
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
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={btnGhost} disabled={positions.length >= MAX_POSITIONS || total >= MAX_TOTAL_WORKERS} onClick={addPosition}>Add another kind of worker</button>
          <span className="text-sm text-gray-700">Total workers needed: <strong>{total}</strong></span>
        </div>
      </section>

      <Field label="How urgent?" htmlFor="urg">
        <select id="urg" className={input} value={urgency} onChange={(e) => setUrgency(e.target.value as Urgency)}>
          <option value="asap">As soon as possible</option><option value="this_week">This week</option><option value="flexible">Flexible</option>
        </select>
      </Field>
      <Field label="Budget (optional)" htmlFor="budget"><input id="budget" maxLength={40} placeholder="e.g. $100-$150" className={input} value={budget} onChange={(e) => setBudget(e.target.value)} /></Field>
      <fieldset className="space-y-3 rounded-md border border-gray-200 p-3">
        <legend className="px-1 text-sm font-medium">Your contact details</legend>
        <p className="text-xs text-gray-600">Shown only to workers who accept your request.</p>
        <Field label="Phone" htmlFor="phone"><input id="phone" type="tel" maxLength={30} className={input} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Email" htmlFor="cemail"><input id="cemail" type="email" maxLength={120} className={input} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} /></Field>
        <Field label="Preferred contact method" htmlFor="method">
          <select id="method" className={input} value={method} onChange={(e) => setMethod(e.target.value as ContactMethod)}>
            <option value="phone">Phone call</option><option value="text">Text message</option><option value="email">Email</option>
          </select>
        </Field>
      </fieldset>
      <ErrorBox message={error} />
      <button className={btn} disabled={busy}>{busy ? 'Posting...' : positions.length > 1 ? `Post ${positions.length} worker groups` : 'Post request'}</button>
    </form>
  )
}
