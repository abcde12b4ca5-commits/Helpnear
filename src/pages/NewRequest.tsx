import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { brand } from '../config/brand'
import { useAuth } from '../lib/auth'
import { findBlockedKeyword, getCategories, getZones } from '../lib/catalog'
import { createRequest } from '../lib/requests'
import { friendlyError } from '../lib/errors'
import { ErrorBox, Field, Spinner, btn, input } from '../components/ui'
import type { Category, ContactMethod, Urgency, Zone } from '../lib/types'

export default function NewRequest() {
  const { user, verified } = useAuth()
  const nav = useNavigate()
  const [cats, setCats] = useState<Category[] | null>(null)
  const [zones, setZones] = useState<Zone[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [zoneId, setZoneId] = useState('')
  const [zip, setZip] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [urgency, setUrgency] = useState<Urgency>('this_week')
  const [budget, setBudget] = useState('')
  const [phone, setPhone] = useState('')
  const [contactEmail, setContactEmail] = useState(user?.email ?? '')
  const [method, setMethod] = useState<ContactMethod>('phone')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([getCategories(), getZones()])
      .then(([cs, zs]) => { setCats(cs.filter((c) => c.enabled)); setZones(zs.filter((z) => z.enabled)) })
      .catch((e) => setError(friendlyError(e)))
  }, [])

  const cat = cats?.find((c) => c.id === categoryId)
  const zone = zones.find((z) => z.id === zoneId)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!user || !cat || !zone) { setError('Choose a service and an area.'); return }
    if (!verified) { setError('Please verify your email first (see the banner at the top).'); return }
    if (zip && !/^[0-9]{5}$/.test(zip)) { setError('ZIP code must be 5 digits.'); return }
    if (!phone.trim() && !contactEmail.trim()) { setError('Add a phone number or an email so workers can reach you.'); return }
    const blocked = findBlockedKeyword(`${title} ${description}`, cat.blockedKeywords)
    if (blocked) { setError(`This service isn't available on ${brand.name} (mentions "${blocked}"). Regulated work needs a licensed professional.`); return }
    setBusy(true); setError(null)
    try {
      await createRequest({
        clientId: user.uid, categoryId: cat.id, categoryName: cat.name, zoneId: zone.id, zoneName: zone.name, zip,
        title: title.trim(), description: description.trim(), urgency, budgetRange: budget.trim(),
        contact: { phone: phone.trim(), email: contactEmail.trim(), preferredContactMethod: method },
      })
      nav('/my-requests')
    } catch (err) { setError(friendlyError(err)) } finally { setBusy(false) }
  }

  if (!cats) return error ? <ErrorBox message={error} /> : <Spinner />
  return (
    <form onSubmit={submit} className="max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">Post a request</h1>
      <Field label="Service" htmlFor="cat">
        <select id="cat" required className={input} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Choose a service</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      {cat && <p className="rounded-md bg-gray-100 p-3 text-xs text-gray-700">Allowed: {cat.allowedServices.join('; ')}.{cat.notes ? ` ${cat.notes}` : ''} Work that needs a license (electrical, plumbing, HVAC, gas) is not allowed.</p>}
      <Field label="Area" htmlFor="zone">
        <select id="zone" required className={input} value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
          <option value="">Choose an area</option>
          {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
      </Field>
      <Field label="ZIP code (optional)" htmlFor="zip"><input id="zip" inputMode="numeric" maxLength={5} className={input} value={zip} onChange={(e) => setZip(e.target.value)} /></Field>
      <Field label="Title" htmlFor="title"><input id="title" required minLength={5} maxLength={100} className={input} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Details" htmlFor="desc" hint="Describe the job. Do not include your phone number or address here; it is shared separately."><textarea id="desc" required minLength={10} maxLength={2000} rows={5} className={input} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <Field label="How urgent?" htmlFor="urg">
        <select id="urg" className={input} value={urgency} onChange={(e) => setUrgency(e.target.value as Urgency)}>
          <option value="asap">As soon as possible</option><option value="this_week">This week</option><option value="flexible">Flexible</option>
        </select>
      </Field>
      <Field label="Budget (optional)" htmlFor="budget"><input id="budget" maxLength={40} placeholder="e.g. $100-$150" className={input} value={budget} onChange={(e) => setBudget(e.target.value)} /></Field>
      <fieldset className="space-y-3 rounded-md border border-gray-200 p-3">
        <legend className="px-1 text-sm font-medium">Your contact details</legend>
        <p className="text-xs text-gray-600">Shown only to workers who claim your request.</p>
        <Field label="Phone" htmlFor="phone"><input id="phone" type="tel" maxLength={30} className={input} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Email" htmlFor="cemail"><input id="cemail" type="email" maxLength={120} className={input} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} /></Field>
        <Field label="Preferred contact method" htmlFor="method">
          <select id="method" className={input} value={method} onChange={(e) => setMethod(e.target.value as ContactMethod)}>
            <option value="phone">Phone call</option><option value="text">Text message</option><option value="email">Email</option>
          </select>
        </Field>
      </fieldset>
      <ErrorBox message={error} />
      <button className={btn} disabled={busy}>{busy ? 'Posting...' : 'Post request'}</button>
    </form>
  )
}
