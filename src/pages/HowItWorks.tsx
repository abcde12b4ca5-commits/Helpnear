import { Link } from 'react-router-dom'
import { brand } from '../config/brand'
import PageHeader from '../components/PageHeader'
import { btn } from '../components/ui'

const STEPS: [string, string][] = [
  ['Clients post a request', 'The service, the city, details, how urgent it is and how many workers they need.'],
  ['Workers get notified', 'Workers who offer that service and cover that city (around their location or in the cities they chose) see the request and can accept it with a price, or decline it.'],
  ['You agree on the work', 'When a worker accepts, they can see your contact details and reach out. You agree on the price and the work, then confirm the agreement in the app.'],
  ['Done and rated', 'After the work, the worker marks the service as done and you confirm it. Confirmed jobs appear in both dashboards, and you can rate the worker.'],
  ['Pay directly', `Payment is handled directly between you and the worker. ${brand.name} never handles job payments.`],
]

export default function HowItWorks() {
  return (
    <article className="max-w-4xl space-y-8">
      <PageHeader eyebrow="How it works" title={`How ${brand.name} works`} sub="From a posted request to a finished job, in five steps." />
      <ol className="hn-tl">
        {STEPS.map(([t, d], i) => (
          <li key={t} className="hn-in" style={{ ['--i' as string]: i }}>
            <span className="hn-tl-n">{i + 1}</span>
            <div className="hn-card"><h2 className="text-xl">{t}</h2><p className="mt-1 text-sm text-mu">{d}</p></div>
          </li>
        ))}
      </ol>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="hn-card hn-in">
          <span className="hn-eyebrow">For clients</span>
          <h2 className="text-xl">Need a hand?</h2>
          <p className="mt-1 text-sm text-mu">Post your request in about a minute. It is free to use, and you deal with the worker directly.</p>
          <Link to="/signup" className={`${btn} mt-4 inline-block`}>Post a request</Link>
        </div>
        <div className="hn-card hn-in">
          <span className="hn-eyebrow">For workers</span>
          <h2 className="text-xl">Looking for work?</h2>
          <p className="mt-1 text-sm text-mu">Pick your services and cities, and get notified when a request matches.</p>
          <Link to="/signup?role=worker" className={`${btn} hn-y mt-4 inline-block`}>Join as a worker</Link>
        </div>
      </div>
      <p className="rounded-xl bg-warn-bg p-3 text-sm text-warn-tx">
        {brand.disclaimer} Licenses and insurance on worker profiles are self-reported and not verified by {brand.name}. Always confirm required licenses and permits yourself.
      </p>
      <p className="text-sm text-mu">Some services (for example electrical, plumbing and HVAC) are not available on {brand.name} because they require a license.</p>
    </article>
  )
}
