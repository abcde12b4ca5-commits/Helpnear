# Helpnear (working name)
US home-services marketplace, nationwide (ZIP + radius matching). See docs/nationwide-update.md for how requests, accepting, agreeing, done and confirm work, and for the deploy checklist.

US home-services marketplace. Vite + React + TS + Tailwind, Firebase Spark (Auth + Firestore), Cloudflare Pages.

## Run
1. `npm install`
2. Copy `.env.example` to `.env` and fill the Firebase web config. Set `.firebaserc` project id.
3. `npm run dev`

## Firebase
- Deploy rules + indexes: `npx firebase deploy --only firestore`
- Seed (skips existing docs): `GOOGLE_APPLICATION_CREDENTIALS=<sa.json> GCLOUD_PROJECT=<id> npm run seed`
- Rules tests (needs Java + emulator download): `npm run test:rules`
- Local emulators: `npm run emulators`, then `VITE_USE_EMULATORS=true npm run dev`
- First admin: create `admins/{uid}` by hand in the Firebase console.

## Docs
`docs/decisions.md`, `docs/rules-explanation.md`, `docs/read-budget.md`, `docs/open-questions.md`, `docs/user-tasks.md`.
