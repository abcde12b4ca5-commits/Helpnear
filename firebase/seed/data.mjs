import { readFileSync } from 'node:fs'
const BRAND = JSON.parse(readFileSync(new URL('../../src/config/brand.json', import.meta.url), 'utf8')).name

// Seed data. Zones have NO ZIP lists on purpose: ZIP-to-zone data must come from a verified source (see docs/open-questions.md).
const cat = (id, name, enabled, riskLevel, allowedServices, notes = '', blockedKeywords = [], requiresLicenseCheck = false) => ({
  id, name, enabled, riskLevel, requiresLicenseCheck, allowedServices, blockedKeywords, notes,
})

const HANDYMAN_BLOCKED = ['wiring', 'breaker', 'panel', 'circuit', 'outlet', 'plumbing', 'pipe', 'water heater', 'gas line', 'ac', 'hvac', 'furnace', 'refrigerant', 'irrigation', 'sprinkler']
const GENERAL_BLOCKED = ['wiring', 'breaker', 'gas line', 'refrigerant', 'hvac']
const NOTE_PERMITS = `Local permits may apply. Not verified by ${BRAND}.`

export const categories = [
  cat('house-cleaning', 'House cleaning', true, 'low', ['Regular cleaning', 'Deep cleaning', 'Move-in/move-out cleaning', 'Airbnb turnover cleaning']),
  cat('window-cleaning', 'Window cleaning', true, 'low', ['Interior and exterior window cleaning', 'Screen and track cleaning']),
  cat('pressure-washing', 'Pressure washing', true, 'low', ['Driveways, patios, siding, fences']),
  cat('carpet-upholstery-cleaning', 'Carpet and upholstery cleaning', true, 'low', ['Carpet, rug and upholstery cleaning']),
  cat('painting', 'Painting', true, 'low', ['Interior painting', 'Exterior painting'], '', GENERAL_BLOCKED),
  cat('handyman', 'Handyman (general repairs)', true, 'low', ['Minor non-regulated repairs', 'Door and cabinet adjustments', 'Caulking, patching, small fixes'], 'Regulated work (electrical, plumbing, HVAC, gas, irrigation) is not allowed.', HANDYMAN_BLOCKED),
  cat('furniture-assembly', 'Furniture assembly', true, 'low', ['Assembling flat-pack and ready-to-assemble furniture']),
  cat('tv-shelf-mounting', 'TV and shelf mounting', true, 'low', ['Wall mounting TVs, shelves, mirrors', 'No new electrical wiring'], '', GENERAL_BLOCKED),
  cat('drywall-repair', 'Drywall repair and patching', true, 'low', ['Patching holes, texture matching, minor repair']),
  cat('flooring-installation', 'Flooring installation', true, 'low', ['Laminate, vinyl, tile'], NOTE_PERMITS),
  cat('fence-work', 'Fence repair and installation', true, 'low', ['Fence repair', 'Fence installation'], NOTE_PERMITS),
  cat('deck-work', 'Deck repair and building', true, 'low', ['Deck repair', 'Deck building'], NOTE_PERMITS),
  cat('gutter-cleaning', 'Gutter cleaning', true, 'low', ['Gutter cleaning and debris removal']),
  cat('lawn-care', 'Lawn mowing and yard maintenance', true, 'low', ['Mowing, edging, trimming']),
  cat('yard-cleanup', 'Yard cleanup', true, 'low', ['Leaves, brush, general cleanup. No tree removal.']),
  // Proposed additions: DISABLED until legality is verified (Texas official sources + attorney).
  cat('garage-cleanout', 'Garage cleanout and organizing', false, 'low', ['Sorting and organizing'], 'Proposed. Verify scope: hauling/disposal may be regulated.'),
  cat('pet-sitting', 'Pet sitting and dog walking', false, 'low', ['Pet sitting', 'Dog walking'], 'Proposed. Verify local rules and liability.'),
  cat('car-detailing', 'Mobile car detailing', false, 'low', ['Washing, interior cleaning'], 'Proposed.'),
  cat('holiday-lights', 'Holiday light installation', false, 'low', ['Hanging decorative lights'], 'Proposed. Ladder safety and liability to review.'),
  cat('moving-labor', 'Moving help (labor only)', false, 'regulated', ['Loading and unloading only'], 'Proposed. Household-goods mover rules NOT verified; keep disabled.'),
  // Regulated / high risk: keep disabled until a license-verification feature exists.
  cat('plumbing', 'Plumbing', false, 'regulated', [], 'State-licensed trade in Texas (per secondary sources).', [], true),
  cat('electrical', 'Electrical', false, 'regulated', [], 'Licensed trade in Texas (TDLR, per secondary sources).', [], true),
  cat('hvac', 'HVAC', false, 'regulated', [], 'Licensed trade in Texas (TDLR, per secondary sources).', [], true),
  cat('irrigation', 'Irrigation', false, 'regulated', [], 'Licensed trade in Texas (per secondary sources).', [], true),
  cat('household-moving', 'Household goods moving', false, 'regulated', [], 'State motor-carrier registration. Not verified.', [], true),
  cat('junk-hauling', 'Junk hauling', false, 'high', [], 'Waste-hauling rules not verified.', [], true),
  cat('pest-control', 'Pest control', false, 'regulated', [], 'Pesticide rules not verified.', [], true),
  cat('locksmith', 'Locksmith', false, 'regulated', [], 'Rules not verified.', [], true),
  cat('roofing', 'Roofing', false, 'high', [], 'High risk; rules not verified.', [], true),
  cat('tree-removal', 'Tree removal', false, 'high', [], 'High risk; rules not verified.', [], true),
  cat('pool-service', 'Pool service', false, 'regulated', [], 'Rules not verified.', [], true),
  cat('appliance-repair', 'Appliance repair', false, 'regulated', [], 'Rules not verified.', [], true),
]

const zone = (id, name) => ({ id, name, state: 'TX', city: 'Houston', zips: [], enabled: true })
export const zones = [
  zone('hou-central', 'Houston - Central'),
  zone('hou-north', 'Houston - North'),
  zone('hou-northwest', 'Houston - Northwest'),
  zone('hou-northeast', 'Houston - Northeast'),
  zone('hou-east', 'Houston - East'),
  zone('hou-southeast', 'Houston - Southeast'),
  zone('hou-south', 'Houston - South'),
  zone('hou-southwest', 'Houston - Southwest'),
  zone('hou-west', 'Houston - West'),
]

export const appConfig = {
  signupOpen: true,
  maintenanceMode: false,
  maxClaimsPerRequest: 3,
  requestExpiryHours: 72,
  maxCategoriesPerWorker: 5,
  maxZonesPerWorker: 6,
  revealContactOnClaim: true,
  chatEnabled: false,
  freeRequestsPerClient: 0,
  feesEnabled: false,
  promotionFeeUsd: null,
  launchState: 'TX',
  launchCity: 'Houston',
}

const DRAFT = 'DRAFT: requires attorney review before launch. Not legal advice.\n\n'
export const legal = [
  {
    id: 'terms', title: 'Terms of Service', version: '0.1-draft', isDraft: true,
    body: DRAFT +
`1. What ${BRAND} is. ${BRAND} is a platform that connects people. We are not a contractor, employer or agent of any user. We do not set prices, supervise work or guarantee any outcome.

2. Eligibility. You must be at least 18 years old.

3. Your responsibility. Workers are solely responsible for their own licenses, permits, insurance, taxes and the quality and legality of their work. Clients are responsible for choosing whom to hire. Any license or insurance information on a profile is self-reported and is not verified by ${BRAND}.

4. Payments. Clients and workers agree on and settle payment directly. ${BRAND} does not handle job payments.

5. Prohibited services and content. You may not request or offer services that require a license you do not hold, illegal services, or services listed as unavailable on ${BRAND}. No harassment, fraud or misleading content.

6. Contact details. Contact details are shared only with workers who claim a request. Do not misuse them.

7. Moderation and termination. We may remove content and suspend accounts that violate these terms or the Community Guidelines.

8. Future fees. ${BRAND} is free at launch. We may introduce optional fees later with advance notice.

9. Disclaimers and liability. The service is provided "as is". To the extent allowed by law, ${BRAND} is not liable for disputes, damages or losses between users. [ATTORNEY: limitation of liability wording]

10. Disputes. Governing law: [TO BE COMPLETED BY ATTORNEY]. Venue: [TO BE COMPLETED BY ATTORNEY].

11. Contact. [SUPPORT EMAIL], [MAILING ADDRESS]`,
  },
  {
    id: 'privacy', title: 'Privacy Policy', version: '0.1-draft', isDraft: true,
    body: DRAFT +
`What we collect: name, email, area (zone and optional ZIP code), request details, and the contact details you choose to provide for a request. We do not collect Social Security numbers, payment cards, bank details or precise geolocation.

How we use it: to run the service, match requests with workers, prevent abuse and communicate with you.

Who sees it: your contact details for a request are shown only to you and to workers who claim that request. Worker profiles are visible to signed-in users.

Service providers: we use Google Firebase (authentication and database) and Cloudflare (hosting).

Your choices: contact us to access, correct or delete your information. [ATTORNEY: California and Texas privacy rights, retention, cookies, children]

We do not knowingly collect information from anyone under 18.

Contact: [SUPPORT EMAIL], [MAILING ADDRESS]`,
  },
  {
    id: 'guidelines', title: 'Community Guidelines', version: '0.1-draft', isDraft: true,
    body: DRAFT +
`Be honest and respectful. Describe jobs accurately. Only offer services you are qualified and legally allowed to perform. Do not request or offer regulated work (for example electrical, plumbing or HVAC) through ${BRAND}. Do not share other people's contact information. Report anything unsafe or misleading using the Report button. We may remove content or suspend accounts that break these guidelines.`,
  },
  {
    id: 'disclaimer', title: 'Disclaimer', version: '0.1-draft', isDraft: true,
    body: DRAFT +
`${BRAND} is a platform that connects people. We are not a contractor or an employer. We do not verify licenses, insurance, identity, skills or background of any user, and we do not guarantee any work or result. You are responsible for deciding whether to hire or work with anyone. Always confirm required licenses, permits and insurance yourself.`,
  },
]
