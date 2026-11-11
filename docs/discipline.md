# Fair-use rules (strikes, freezes, disputes)

Every number below is editable in **Admin > Settings** ("Fair use: ..."). Defaults in brackets.

## What counts as a strike
- **Late cancellation:** a job cancelled *after the client agreed the price*, by the worker or the client. Cancelling before the agreement is free.
- **No response:** a worker accepted, but no price was agreed within [48] hours. The worker is released automatically and gets a strike (switch off with "A worker who accepts and never agrees a price in time gets a strike").
- **Dispute strike:** an admin may give a strike to the side at fault when deciding a dispute.
- Strikes count for [30] days. Warnings and "conduct" entries from the admin ladder are separate and never counted automatically.

## What happens at the limits
| | Client | Worker |
|---|---|---|
| Freeze (cannot post / cannot accept) for [7] days | at [3] strikes | at [2] strikes |
| Flagged "needs review" for an admin (also frozen) | at [5] | at [4] |

A frozen user sees a red banner with the end date and reason. Admins can lift a freeze at any time (Admin > Users > Unfreeze).

## Automatic actions (scheduled worker, every 15 minutes)
- **Auto-confirm:** a job marked done that the client ignored for [7] days is confirmed (protects the worker). The worker is told.
- **Auto-release:** accepted but no agreed price after [48] hours: the slot is freed and the client is told.
- **Strikes and freezes:** late cancellations since the last run become strikes; users reaching the limits are frozen or flagged.
- All of it is idempotent (fixed document ids and update-time guards), so a client acting at the same moment, or overlapping runs, cannot double-apply. Turn it all off with "Automatic fair-use rules ON".
- Admin > Settings > **Run the fair-use rules now** runs the same code immediately and prints what it did.

## Disputes
- Either side can press **Report a problem** once the price is agreed. The client pressing **Not done yet** [2] times makes it a dispute automatically.
- Admin > **Disputes** (oldest first): confirm the job (you set the final amount), send it back to work, or cancel it (frees the worker slot). Add a note both sides see, and optionally a strike for the side at fault.

## Admin tools (Admin > Users and Moderation)
- **Strikes:** list and remove.
- **Escalate (warning, freeze, ban):** for upheld reports. 1st time a warning, 2nd a freeze, 3rd and later a ban. Also available as a button on each open report.
- **Freeze days / Unfreeze / clear review.**
- **Ban (fraud):** suspends the user and, for a worker, removes all confirmed jobs from completed jobs and earnings.
- Every admin change is written to the audit log.

## Indexes needed by this feature (collection group `claims`)
`status asc, createdAt asc` (release + disputes list) / `status asc, doneAt asc` (auto-confirm) / `status asc, cancelledAt asc` (late-cancel scan). They are in `firebase/firestore.indexes.json`.

## Limits and honest notes
- **Needs the edge worker deployed with its cron trigger** (`worker/wrangler.toml` has `crons = ["*/15 * * * *"]`) and the `FIREBASE_SA_JSON` secret. Without it nothing automatic happens, but the admin tools and the rules enforcing freezes still work.
- Free Cloudflare plan: 50 outgoing requests per run, so each run handles a few items per task (`CRON_MAX_ITEMS`, default 5; budget `CRON_SUBREQUEST_LIMIT`, default 40). A backlog is cleared over several runs.
- Strikes from the scheduled worker are evaluated only when a new strike appears. Strikes expire silently after the window; a freeze ends by itself on its date.
- The policy text must be in your Terms before it is enforced, and an attorney should review it. Appeals go through support: an admin can remove strikes and unfreeze.
- The rules tests for this feature were written but **not run** (emulator not available to the author). Worker tests (31) pass.
