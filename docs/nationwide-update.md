# Nationwide update (all US states, accept / agree / done / confirm)

## What changed for users
- **Coverage is the whole US.** No zones. A client enters the ZIP of the job. A worker enters a base ZIP and a radius (10, 25 or 50 miles).
- **Matching:** a request goes to workers whose service matches and whose circle covers the request's ZIP.
- **Client chooses how many workers, and for which jobs.** One post holds 1 to 5 *worker groups* (10 workers in total). Same job for 2 people: one group with "2 workers". Different jobs (for example a cleaner and a painter): add another group, each with its own service, title, details and worker count. Each group is a separate request in the system, so workers accept, the client agrees, and the job is done and confirmed per worker. The client dashboard shows the groups together as one job ("price agreed with X of N workers"). Per-group worker count is limited by the admin setting `maxWorkersPerRequest` (rules cap 10).
- **Worker accepts with a price and a short scope note, or declines** (declining only hides it for that worker).
- **Agreement:** the client sees each accepted worker with price and note and presses "Agree to price and work". The worker can mark the job done only after that. If the worker edits price or scope, the agreement resets.
- **Done:** the worker marks the service done and enters the final amount. The client **confirms** (or sends it back with "Not done yet").
- **Cancel:** either side can cancel before "done" with a reason. The worker slot is freed so another worker can accept.
- **Dashboards:** workers get *My jobs* (tabs, in progress / waiting / completed / cancelled, completed count, total earned). Clients get *My requests* (requests posted, work in progress, services completed, total confirmed, workers per request, agree / confirm / cancel / rate).
- **Earnings** count only client-confirmed jobs and use the final amount. There is no payment processing yet: money is arranged directly. Add a payment provider later and keep `finalCents` as the amount.
- **Reviews** now require a confirmed job.
- **Notifications** (in-app, both roles) and web push for: new matching request, accepted, agreed, done, confirmed, reopened, cancelled.
- **Per-state switch:** Admin > Categories has "States where this service is OFF" (rules enforce it when a request is created). Regulated / high-risk categories stay locked as before.
- **Admin > Coverage:** workers and open requests per state, and states with open requests but no workers.

## Data model changes
- `workers/{uid}`: `zones` removed. New: `baseZip, city, state, lat, lng, radiusMiles, matchKeys` (`categoryId|cell` for every service x covered cell).
- `workers/{uid}/private/declined`: `{ ids: [...] }` (max 300).
- `requests/{id}`: `zoneId/zoneName` removed. New: `city, state, lat, lng, cell, workersNeeded, groupId, groupSize`. Request ids are `groupId-0` to `groupId-4`; `rate/{uid}` now also stores the `groupId` of the last post, and the rules tie both together so one 60-second cooldown allows at most 5 requests. `status` adds `filled`. `claimsCount` = workers currently accepted. `lastWorkerId` is set only when a worker is released.
- `requests/{id}/claims/{workerId}`: now a job record: `status (accepted|done|confirmed|cancelled), clientAgreed, quotedCents, note, finalCents, doneAt, confirmedAt, cancelledBy, cancelReason`, plus denormalised `clientId, categoryId, categoryName, title, workerName` so dashboards need no extra reads.
- `config/app`: `maxClaimsPerRequest, maxZonesPerWorker, launchState, launchCity` removed, `maxWorkersPerRequest` added (rules fall back to 10 when missing, so existing config docs keep working).
- `categories/{id}`: `disabledStates: string[]` (rules treat a missing field as empty).
- `zones` collection no longer used (you can delete it). Money is integer cents.

## How matching works
`scripts/build-zips.mjs` turns the `zipcodes` npm package into `public/zip/<first 3 digits>.json` (about 42,500 US ZIPs, 931 small files, fetched on demand). A ZIP gives a lat/lng. A point maps to a 4-character geohash cell (about 0.35 x 0.18 degrees). A 10 / 25 / 50 mile circle covers roughly 6 / 15-23 / 46-71 cells. The feed queries `matchKey in [...]` in chunks of 30 and then filters by exact distance, so cells are only a coarse first filter.

## Deploy checklist for this update
1. `npm install` (an `.npmrc` with `legacy-peer-deps=true` is included: the rules-testing package asks for firebase 12, the app uses 13).
2. `firebase deploy --only firestore` (new rules + indexes). The collection-group indexes can take a few minutes to build. If the console shows an index link for the dashboard totals, open it once.
3. Existing worker profiles (old `zones` model) are sent to the profile page once to pick a ZIP and radius.
4. Edge worker: redeploy (`npm run worker:deploy`). Optional variable `MAX_NEW_PUSH` (default 10, max 40).
5. Rebuild the site (`npm run build` creates the ZIP files automatically).

## Known limits (be aware)
- **Rules tests were written but NOT run** by the author of this update: the Firestore emulator could not be downloaded in that environment. Run `npm run test:rules` and fix anything that fails before deploying. Worker tests (21), type check, lint and the production build all passed.
- **Worker area is self-declared.** Rules cannot compute distance, so a worker could claim a larger area than they cover. Rules do check category and `matchKeys` membership on accept, and the ZIP of a request is client-supplied too. Reports and admin moderation are the backstop, as before.
- **Worker profile is visible to signed-in users**, now including base ZIP, city and state (ZIP centroid, not an address).
- **Push for new requests is capped** (default 10 workers per request, arbitrary among matches) because of the Cloudflare free plan's 50 subrequests per call. Others still see the request in their feed. On iPhone, web push needs the site added to the Home Screen; test it.
- **Firebase Spark limits** (50k reads / 20k writes per day) will be reached quickly at national scale. Upgrade to Blaze with a budget alert when needed (as you decided). Feed cost: one query per 30 match keys (up to about 12 queries for a 50 mile radius with 5 services).
- ZIP data comes from an npm package and is not verified against USPS or Census. ZIP codes change; refresh it periodically.
- Licensing: the platform only introduces people, but regulated trades (electrical, plumbing, HVAC and similar) are still locked off in the admin as in the original project. I am not a lawyer; have an attorney confirm before you enable anything regulated or launch in a new state.
- Not built: payments, disputes handled by admins (use reports), email notifications, request photos.

## Update: cancelling and fair use
- Clients can **cancel a whole request** (all workers who have not finished are released and told) or just stop taking more workers.
- Strikes, freezes, automatic release / confirmation and disputes: see `docs/discipline.md`. All numbers are in Admin > Settings.
- Extra indexes (collection group `claims`): `status, createdAt asc` / `status, doneAt asc` / `status, cancelledAt asc`. Full list of indexes: `firebase/firestore.indexes.json` (`firebase deploy --only firestore:indexes`).
- Redeploy the edge worker (it now has a cron trigger and `/run-policy`).
