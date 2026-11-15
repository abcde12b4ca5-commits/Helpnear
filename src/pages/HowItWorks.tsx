import { brand } from '../config/brand'

const STEPS: [string, string][] = [
  ['Clients post a request', 'The service, the ZIP code, details, how urgent it is and how many workers they need.'],
  ['Workers get notified', 'Workers who offer that service within their travel distance of that ZIP see the request and can accept it with a price, or decline it.'],
  ['You agree on the work', 'When a worker accepts, they can see your contact details and reach out. You agree on the price and the work, then confirm the agreement in the app.'],
  ['Done and rated', 'After the work, the worker marks the service as done and you confirm it. Confirmed jobs appear in both dashboards, and you can rate the worker.'],
  ['Pay directly', `Payment is handled directly between you and the worker. ${brand.name} never handles job payments.`],
]

export default function HowItWorks() {
  return (
    <article className="max-w-3xl space-y-6">
      <h1 className="hn-in text-4xl">How {brand.name} works</h1>
      <ol className="space-y-3">
        {STEPS.map(([t, d], i) => (
          <li key={t} className="hn-card hn-in flex gap-4" style={{ ['--i' as string]: i }}>
            <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-ye font-display font-semibold text-ink">{i + 1}</span>
            <div><h2 className="text-xl">{t}</h2><p className="mt-1 text-sm text-mu">{d}</p></div>
          </li>
        ))}
      </ol>
      <p className="rounded-xl bg-warn-bg p-3 text-sm text-warn-tx">
        {brand.disclaimer} Licenses and insurance on worker profiles are self-reported and not verified by {brand.name}. Always confirm required licenses and permits yourself.
      </p>
      <p className="text-sm text-mu">Some services (for example electrical, plumbing and HVAC) are not available on {brand.name} because they require a license.</p>
    </article>
  )
}
