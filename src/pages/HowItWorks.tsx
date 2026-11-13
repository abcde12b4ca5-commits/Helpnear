import { brand } from '../config/brand'

export default function HowItWorks() {
  return (
    <article className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">How {brand.name} works</h1>
      <ol className="list-decimal space-y-3 pl-5 text-tx">
        <li><strong>Clients</strong> post a request: the service, the ZIP code, details, how urgent it is and how many workers they need.</li>
        <li><strong>Workers</strong> who offer that service within their travel distance of that ZIP see the request and can accept it with a price, or decline it.</li>
        <li>When a worker accepts, they can see your contact details and reach out. You agree on the price and the work, then confirm the agreement in the app.</li>
        <li>After the work, the worker marks the service as done and you confirm it. Confirmed jobs appear in both dashboards, and you can rate the worker.</li>
        <li>Payment is handled directly between you and the worker. {brand.name} never handles job payments.</li>
      </ol>
      <p className="rounded-xl bg-warn-bg p-3 text-sm text-warn-tx">
        {brand.disclaimer} Licenses and insurance on worker profiles are self-reported and not verified by {brand.name}. Always confirm required licenses and permits yourself.
      </p>
      <p className="text-sm text-mu">Some services (for example electrical, plumbing and HVAC) are not available on {brand.name} because they require a license.</p>
    </article>
  )
}
