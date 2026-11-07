import { brand } from '../config/brand'

export default function HowItWorks() {
  return (
    <article className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">How {brand.name} works</h1>
      <ol className="list-decimal space-y-3 pl-5 text-gray-800">
        <li><strong>Clients</strong> post a request: the service, details, area and how urgent it is.</li>
        <li><strong>Workers</strong> who offer that service in that area see the request. The first few workers can claim it.</li>
        <li>After a worker claims it, they can see your contact details and reach out. You agree on the job and the price directly.</li>
        <li>Payment is handled directly between you and the worker. {brand.name} never handles job payments.</li>
      </ol>
      <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
        {brand.disclaimer} Licenses and insurance on worker profiles are self-reported and not verified by {brand.name}. Always confirm required licenses and permits yourself.
      </p>
      <p className="text-sm text-gray-700">Some services (for example electrical, plumbing and HVAC) are not available on {brand.name} because they require a license.</p>
    </article>
  )
}
