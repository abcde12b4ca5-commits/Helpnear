import { useEffect, useState } from 'react'
import { loadCities, nearestPlace, searchCities, type Place } from '../lib/geo'
import { btnGhost, input } from './ui'

// Pick a US city by typing its name ("austin" or "austin, tx"), or tap "Use my location". No ZIP code anywhere.
// Calls onPick with the chosen place. The parent decides what to do with it (one place for a request, several for a worker).
export default function PlacePicker({ id, label, hint, onPick, locate = true }: { id: string; label: string; hint?: string; onPick: (p: Place) => void; locate?: boolean }) {
  const [text, setText] = useState('')
  const [cities, setCities] = useState<Place[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [locating, setLocating] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => { if (text.length >= 2 && !cities && !failed) loadCities().then(setCities).catch(() => setFailed(true)) }, [text, cities, failed])
  const results = cities ? searchCities(cities, text) : []
  const pick = (p: Place) => { onPick(p); setText(''); setNote(null) }

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) { setNote('Your browser cannot share your location. Type your city instead.'); return }
    setLocating(true); setNote(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const list = cities ?? (await loadCities()); setCities(list)
          const p = nearestPlace(list, pos.coords.latitude, pos.coords.longitude)
          if (p) pick(p); else setNote('We could not match your location to a city. Type your city instead.')
        } catch { setFailed(true); setNote('The city list could not load. Check your connection and try again.') } finally { setLocating(false) }
      },
      () => { setLocating(false); setNote('Location is turned off for this site. Allow it in your browser, or type your city instead.') },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    )
  }

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold">{label}</label>
      {hint && <p className="text-xs text-mu">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        <input id={id} type="search" autoComplete="off" className={`${input} min-w-0 flex-1`} placeholder="Type a city, for example Austin, TX" value={text} onChange={(e) => setText(e.target.value)} />
        {locate && <button type="button" className={btnGhost} onClick={useMyLocation} disabled={locating}>{locating ? 'Finding you...' : 'Use my location'}</button>}
      </div>
      {results.length > 0 && (
        <ul className="overflow-hidden rounded-xl border border-ln" aria-label="Matching cities">
          {results.map((p) => (
            <li key={`${p.state}|${p.city}`}><button type="button" className="w-full px-4 py-2 text-left text-sm hover:bg-sf" onClick={() => pick(p)}>{p.city}, {p.state}</button></li>
          ))}
        </ul>
      )}
      {text.trim().length >= 2 && cities && results.length === 0 && <p className="text-sm text-mu" role="status">No city found for “{text}”. Try the spelling or add the state, for example “Dallas, TX”.</p>}
      {failed && <p className="text-sm text-danger-tx" role="alert">The city list could not load. Check your connection and reload the page.</p>}
      {note && <p className="text-sm text-mu" role="status">{note}</p>}
    </div>
  )
}
