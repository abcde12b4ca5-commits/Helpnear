# Decisions log

## D1. Brand name: Helpnear (renamed from Nearhand)
- Meaning: "help" + "near", matching the "near me" search intent.
- Stored in `src/config/brand.ts`. Also appears in: seed legal texts (`firebase/seed/data.mjs`), `index.html`, `scripts/prerender.mjs` default (`BRAND_NAME` env overrides), READMEs, `worker/wrangler.toml` name.
- Risk: similar to "Helpwell" (a Berlin home-services marketplace). Verify trademark (USPTO), domain, helpnear.pages.dev and app stores before public launch.
- If you change the name again, grep for the old name; the seed legal docs must be re-seeded or edited in Admin > Legal because they are stored in Firestore.

## D2. Catalog scope: all legally suitable services
Enabled at launch (15, see spec section 4) plus PROPOSED additions, each DISABLED until legality is verified (Texas, official sources + attorney):
- Move-in/move-out cleaning, Airbnb turnover cleaning
- Garage cleanout, home organizing
- Pet sitting, dog walking
- Mobile car detailing
- Holiday light installation
- Landscaping/mulching, snow removal (only if the zone needs it)
- Labor-only moving help (loading/unloading; household-goods carrier rules NOT verified)
Regulated/high-risk trades (plumbing, electrical, HVAC, irrigation, roofing, pest control, etc.) stay DISABLED until a license-verification feature exists.

## D3. SEO / AI visibility (affects Phase 8, plan it early)
- No ranking or AI-recommendation guarantee. Goal: build the factors that influence them.
- Current stack is a client-side SPA. Public pages need PRERENDERING at build time (static HTML per service x zone), plus sitemap, canonical URLs, structured data, FAQ content, fast loads.
- Pages need real useful content (service explainer, typical price ranges with source, FAQ). No thin or duplicated pages; `noindex` anything empty.
- `*.pages.dev` has weak authority. A custom domain is strongly recommended (small yearly cost, needs explicit approval; also unlocks email).
- Off-site trust (reviews, mentions on forums/local directories) matters as much as on-site work. Timeline: months, not weeks.

## D4. maintenanceMode
Remains a flag in `config/app` (spec section 7), switchable from the admin panel (Phase 5). Not built yet.

## D5. Reviews: aggregates computed on read
Review docs are rules-validated (owner of the request, worker must have claimed, one per request+worker, rating int 1-5). The average is computed from the last 20 reviews on the profile page, so it cannot be forged. `ratingCount/ratingAverage` on worker docs stay 0 (reserved).

## D6. Notifications
In-app only: written by the claiming worker inside the claim transaction (rules require the claim to exist). Unread count = one count query per page load. FCM push is NOT built: see docs/push-notifications-plan.md.

## D7. Chat (Stage 2)
Built and OFF by default (`config/app.chatEnabled=false`). One thread per request+worker, text only, 1000 chars, last 30 messages, listener only on the open thread, block, mute (local), report. Admin can read a thread only after a participant reports it (`reported=true`).

## D8. SEO
`npm run build` runs `scripts/prerender.mjs`: static HTML for /services/, each service, and service x area pages, plus sitemap.xml, robots.txt, llms.txt, JSON-LD (BreadcrumbList, FAQPage; no LocalBusiness, since we are not the contractor). Service pages are indexable. Area pages are `noindex` until `INDEX_ZONE_PAGES=true` (turn on when they carry real local content, to avoid thin/duplicate pages). Set `SITE_URL` to the real domain. No invented prices anywhere.

## D9. Payments: NOT built (blocked on a verified provider for an Egyptian seller). See docs/monetization.md.
## D10. Bot protection: built, OFF until configured
Turnstile + App Check custom provider through the edge worker (`worker/`). Falls back to reCAPTCHA v3 if only `VITE_APPCHECK_SITE_KEY` is set. Enforcement is a manual console step, to be done only after the Unenforced metrics look healthy. Costs/limits of App Check and Workers are unverified.
## D11. Edge worker also sends web push (FCM HTTP v1). See docs/push-notifications-plan.md.
