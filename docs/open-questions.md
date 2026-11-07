# Open questions / unverified (spec section 15)
- [ ] Spark limits / Blaze needs  - [ ] Firestore `in` max (assumed 30) + rules get() billing
- [ ] Turnstile + App Check cost  - [ ] Texas licensing (official sources + attorney)
- [ ] Houston ZIP-to-zone source  - [ ] pages.dev name availability + trademark
- [ ] Payment provider for Egypt  - [ ] Liability/privacy/terms (attorney)
- [ ] Prerendering approach for Phase 8 (Vite SSG vs prerender plugin) - decide in plan
- [ ] Custom domain: approve cost? (affects SEO + email)
- [ ] Legality of proposed extra categories (see docs/decisions.md D2)
- Decided: name Helpnear (D1). Assumed defaults: email/password only, Cloudinary deferred.

- [ ] Rules tests were never executed in the build environment: run `npm run test:rules` (21 + new review/notification/chat tests).
- [ ] App Check + Workers + FCM free-tier limits: verify. App Check custom-token claims in worker/src/index.ts need one live test (worker/README.md).
- [ ] Prerender uses the Firestore REST read at build time when VITE_FIREBASE_PROJECT_ID is set; rebuild (or add a deploy hook) after admin catalog changes.
- [ ] Area pages stay noindex until they have unique local content.
