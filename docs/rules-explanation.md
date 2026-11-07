# Security rules: how they work (and known limits)
- Default deny. Public read only for config, categories, zones, legal. Writes there are admin-only.
- Signup: role limited to client/worker, terms version must equal `legal/terms.version`, `signupOpen` must be true.
- Posting: verified email, role client, active status. One batch writes `rate/{uid}` (60s cooldown), the request and its private contact. Request fields are validated; expiry <= 7 days.
- Claiming: one transaction = counter +1 on the request AND a new `claims/{uid}` doc. Rules enforce cap (`config/app.maxClaimsPerRequest`), no double claim, open and unexpired request, worker listed, category and zone match.
- Contact: readable by the owner, admin, or a worker who claimed (when `revealContactOnClaim`).
- Rating fields cannot be changed by users. Reviews (Phase 6) and chat (Stage 2) are denied until built.
## Known limits
- Blocked keywords are client-side and advisory. Reports + moderation are the backstop.
- Workers who are verified can read any OPEN request document (no contact info in it), not only matching ones.
- Per-worker limits (5 categories, 6 zones) are hard-coded in rules; admin config lowers them in the UI only.
- Rules were NOT executed here (emulator download blocked). Run `npm run test:rules` before deploying.
- get()/exists()/getAfter() calls are billed reads and capped (10 per single write, 20 per batch/transaction).
## Added in this pass
- reviews: owner of the request, claimed worker, id = requestId_workerId (one per pair), rating int 1-5.
- notifications: created only inside the claim transaction (existsAfter claim), readable/updatable (read flag) only by the recipient.
- threads/messages: require `chatEnabled`; participants only; blocking stops new messages; admin read only when `reported == true`.
- Admin writes (config, categories, zones, legal, users status, requests status, reports) each commit with an `adminLog` entry.
- Limit: a participant could create a notification for a request they claimed with an arbitrary message (<=140 chars). Bounded by the claim cap.
- Limit: chat `get` of a missing thread is allowed (resource == null) so the client can check existence.
