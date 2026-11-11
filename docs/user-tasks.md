# What you (the owner) must do
1. Create Firebase project (Spark), enable Email/Password auth, create Firestore (production mode). Put the project id in `.firebaserc` and the web config in `.env`.
2. Run `npm run test:rules` locally (Java + Firebase CLI). Fix anything that fails, then `firebase deploy --only firestore`.
3. Run `npm run seed` once (needs a service account JSON, never commit it).
4. Sign up in the app, then create `admins/{your-uid}` in the Firestore console.
5. Create the Cloudflare Pages project (build `npm run build`, output `dist`). Add the pages.dev domain to Firebase Auth authorized domains.
6. Send the 4 legal drafts to a US attorney (terms, privacy, guidelines, disclaimer). Fill support email, mailing address, governing law, then bump the version in `legal/*`.
7. Verify Texas licensing rules from official sources before enabling any extra category.
8. Import ZIP-to-zone data for Houston (zones are seeded without ZIPs).
9. Decide: custom domain (SEO + email), final name, trademark check.
10. Recruit the first 20-50 workers in Houston BEFORE advertising to clients.
11. Check Spark limits at firebase.google.com/pricing and decide on Turnstile/App Check.
12. Set `SITE_URL` (and `VITE_FIREBASE_PROJECT_ID`) as Cloudflare Pages build variables so the sitemap, canonicals and prerendered catalog are correct. Submit `/sitemap.xml` in Google Search Console.
13. Turn chat on from Admin > Settings only after you have tested it and reviewed the privacy text. It is OFF by default.
14. When ready for area pages in search, set `INDEX_ZONE_PAGES=true` after adding real local content.
15. Create Firestore index prompts: if the console shows an index link for any query, open it once (the needed ones are already in firestore.indexes.json).
16. (Optional, recommended before launch) Deploy the edge worker for Turnstile/App Check/push: follow worker/README.md. Test with enforcement OFF first.
17. Run `npm run test:worker` (works anywhere) and `npm run test:rules` (needs Java + emulator).
