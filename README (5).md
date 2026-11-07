# Helpnear edge worker (Cloudflare Workers)
One small worker, two jobs. It lives in the same repo but is deployed separately (`npm run worker:deploy`).

| Route | Job |
|---|---|
| `POST /appcheck` | Verifies a Cloudflare Turnstile token, then mints a Firebase **App Check** token (custom provider). With App Check enforced, scripts that skip the website cannot burn your free Firestore/Auth quota. |
| `POST /push` | After a worker claims a request, sends a **web push** to the request owner (FCM HTTP v1). The caller's Firebase ID token and the claim itself are verified server-side; one push per claim. |

## Setup
1. `npx wrangler login` (free Cloudflare account).
2. **Turnstile:** Cloudflare dashboard > Turnstile > Add widget. Hostnames: your pages.dev/custom domain and `localhost`. Copy the *site key* (goes in the app) and *secret key* (goes in the worker).
3. **Firebase service account:** Firebase console > Project settings > Service accounts > Generate new private key. Never commit this file.
   Enable these APIs on the Google Cloud project if the worker returns 403: *Firebase App Check API*, *Firebase Cloud Messaging API*.
4. Edit `worker/wrangler.toml`: `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID` (Project settings > Your apps > App ID), `ALLOWED_ORIGINS`, `SITE_URL`.
5. Secrets (paste the whole JSON for the first one):
   ```
   cd worker
   npx wrangler secret put FIREBASE_SA_JSON
   npx wrangler secret put TURNSTILE_SECRET
   npx wrangler deploy
   ```
   Wrangler prints the worker URL.
6. **App env vars** (Cloudflare Pages build variables or `.env`):
   `VITE_WORKER_URL`, `VITE_TURNSTILE_SITE_KEY`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, and `VITE_FIREBASE_VAPID_KEY`
   (Firebase console > Project settings > Cloud Messaging > Web Push certificates > Generate key pair).
7. **App Check in the Firebase console:** register your web app with the *Custom* provider. Leave Firestore and Authentication on **Unenforced**, deploy, use the site, and check the App Check metrics. Only then switch to **Enforced**.
   Warning: once enforced, if the worker is down or Turnstile is misconfigured, the whole app stops working. Keep a way to un-enforce quickly.
8. Push: a client opens Notifications and taps *Enable push notifications*. Their device token is stored at `users/{uid}/tokens/{hash}`.

## Tests (no cloud needed)
`npm run test:worker` covers JWT signing/verification, ID-token checks, CORS, Turnstile failure, App Check minting (claims + endpoint), and the push flow (claim check, dedupe, stale-token cleanup).

## Unverified (test live before relying on it)
- The App Check *custom token* claims (`app_id`, audience, 5-minute expiry) follow the Admin SDK behaviour as I know it; the exchange endpoint and body were checked in the official REST reference, the claim set was not. First live test: call `/appcheck` and confirm it returns a token. If it returns an error, compare against the Firebase Admin SDK `appCheck().createToken()` output.
- Free-tier limits of Workers, App Check and FCM: check the pricing pages.
- Rate limiting per IP is not implemented here. Turnstile already limits scripted abuse of `/appcheck`; `/push` needs a valid verified user and is deduplicated per claim.
