# Web push: built (see worker/README.md)
- Client: `src/lib/push.ts`, `public/firebase-messaging-sw.js`, Notifications page button. Tokens at `users/{uid}/tokens/{hash}` (rules + test added).
- Server: `worker/src/index.ts` `POST /push`. The claim is re-verified with the service account, one push per claim (`pushLog/{requestId}_{workerId}`, created by the worker only; rules deny client access).
- Still off until the owner deploys the worker and sets the env vars. Email stays off until a custom domain exists (CAN-SPAM, SPF/DKIM/DMARC).
