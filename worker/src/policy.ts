// Fair-use rules, applied on a schedule by the edge worker with the service account (it bypasses the security rules).
// Everything here is idempotent: strikes and notifications use fixed document ids, claim changes use update-time preconditions,
// so overlapping runs or a client acting at the same moment cannot double-apply or overwrite a newer change.
// All numbers come from config/app (Admin > Settings). Nothing here runs unless autoRulesEnabled is true.
import { docsUrl, fsBool, fsFetch, fsNum, fsString, fsTime, parseServiceAccount, type Env, type FsFields } from './google'

export interface PolicyConfig {
  autoRulesEnabled: boolean
  penaltyWindowDays: number
  clientFreezeAt: number
  clientReviewAt: number
  workerFreezeAt: number
  workerReviewAt: number
  freezeDays: number
  noResponseHours: number
  noResponseStrikes: boolean
  autoConfirmDays: number
}

const DAY = 86_400_000
const HOUR = 3_600_000
const COUNTED = ['late_cancel', 'no_response', 'dispute'] // 'warning' and 'conduct' belong to the admin's own ladder

export interface PolicyResult { disabled?: boolean; autoConfirmed: number; released: number; strikes: number; frozen: number; flagged: number; stoppedEarly: boolean }

interface Doc { name: string; updateTime?: string; fields?: FsFields }
class BudgetExceeded extends Error {}

const ts = (ms: number) => ({ timestampValue: new Date(ms).toISOString() })
const str = (v: string) => ({ stringValue: v })
const int = (n: number) => ({ integerValue: String(n) })
const claimIds = (name: string) => /requests\/([^/]+)\/claims\/([^/]+)$/.exec(name)?.slice(1) as [string, string] | undefined
const eq = (field: string, value: string) => ({ fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: str(value) } })
const cmp = (field: string, op: 'LESS_THAN_OR_EQUAL' | 'GREATER_THAN_OR_EQUAL', ms: number) => ({ fieldFilter: { field: { fieldPath: field }, op, value: ts(ms) } })

export async function runPolicy(env: Env, now = Date.now()): Promise<PolicyResult> {
  const sa = parseServiceAccount(env)
  const base = docsUrl(env.FIREBASE_PROJECT_ID)
  const limit = Math.max(5, Number.parseInt(env.CRON_SUBREQUEST_LIMIT ?? '40', 10) || 40)
  const maxItems = Math.min(20, Math.max(1, Number.parseInt(env.CRON_MAX_ITEMS ?? '5', 10) || 5))
  let used = 0
  const call = async (url: string, init: RequestInit = {}): Promise<Response> => {
    if (used >= limit) throw new BudgetExceeded()
    used++
    return fsFetch(sa, url, init)
  }
  const result: PolicyResult = { autoConfirmed: 0, released: 0, strikes: 0, frozen: 0, flagged: 0, stoppedEarly: false }

  const getDoc = async (path: string): Promise<Doc | null> => {
    const res = await call(`${base}/${path}`)
    return res.ok ? ((await res.json()) as Doc) : null
  }
  const query = async (structuredQuery: Record<string, unknown>): Promise<Doc[]> => {
    const res = await call(`${base}:runQuery`, { method: 'POST', body: JSON.stringify({ structuredQuery }) })
    if (!res.ok) throw new Error(`runQuery ${res.status}`)
    return ((await res.json()) as { document?: Doc }[]).flatMap((r) => (r.document ? [r.document] : []))
  }
  const claims = (filters: unknown[], orderField: string, n: number) => query({
    from: [{ collectionId: 'claims', allDescendants: true }],
    where: { compositeFilter: { op: 'AND', filters } },
    orderBy: [{ field: { fieldPath: orderField }, direction: 'ASCENDING' }],
    limit: n,
  })
  /** Creates a document with a fixed id. Returns false when it already exists (409), so repeats do nothing. */
  const create = async (collectionPath: string, id: string, fields: FsFields): Promise<boolean> => {
    const res = await call(`${base}/${collectionPath}?documentId=${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ fields }) })
    return res.ok
  }
  const notify = (toId: string, requestId: string, kind: string, message: string) => create(`notifications/${toId}/items`, `${requestId}_${toId}_${kind}`, {
    type: str('system'), requestId: str(requestId), fromId: str('system'), message: str(message.slice(0, 140)), read: { booleanValue: false }, createdAt: ts(now),
  } as FsFields)
  const patch = async (name: string, fields: FsFields, updateTime?: string): Promise<boolean> => {
    const mask = Object.keys(fields).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&')
    const pre = updateTime ? `&currentDocument.updateTime=${encodeURIComponent(updateTime)}` : ''
    const res = await call(`https://firestore.googleapis.com/v1/${name}?${mask}${pre}`, { method: 'PATCH', body: JSON.stringify({ fields }) })
    return res.ok
  }

  try {
    const cfgDoc = await getDoc('config/app')
    const f = cfgDoc?.fields
    const cfg: PolicyConfig = {
      autoRulesEnabled: f?.autoRulesEnabled ? fsBool(f, 'autoRulesEnabled') : true,
      penaltyWindowDays: fsNum(f, 'penaltyWindowDays', 30), clientFreezeAt: fsNum(f, 'clientFreezeAt', 3), clientReviewAt: fsNum(f, 'clientReviewAt', 5),
      workerFreezeAt: fsNum(f, 'workerFreezeAt', 2), workerReviewAt: fsNum(f, 'workerReviewAt', 4), freezeDays: fsNum(f, 'freezeDays', 7),
      noResponseHours: fsNum(f, 'noResponseHours', 48), noResponseStrikes: f?.noResponseStrikes ? fsBool(f, 'noResponseStrikes') : true,
      autoConfirmDays: fsNum(f, 'autoConfirmDays', 7),
    }
    if (!cfg.autoRulesEnabled) return { ...result, disabled: true }
    const touched = new Map<string, 'client' | 'worker'>()

    // 1) A job marked done and ignored by the client is confirmed automatically (protects the worker).
    for (const d of await claims([eq('status', 'done'), cmp('doneAt', 'LESS_THAN_OR_EQUAL', now - cfg.autoConfirmDays * DAY)], 'doneAt', maxItems)) {
      const ids = claimIds(d.name)
      if (!ids) continue
      const ok = await patch(d.name, { status: str('confirmed'), confirmedAt: ts(now), autoConfirmed: { booleanValue: true } }, d.updateTime)
      if (!ok) continue // the client confirmed or reopened in the meantime
      result.autoConfirmed++
      await notify(ids[1], ids[0], 'autoconfirm', `Confirmed automatically after ${cfg.autoConfirmDays} days without an answer from the client: ${fsString(d.fields, 'title')}`)
    }

    // 2) A worker who accepted but never got a price agreed within the time limit is released (slot freed, optional strike).
    const stale = await claims([eq('status', 'accepted'), cmp('createdAt', 'LESS_THAN_OR_EQUAL', now - cfg.noResponseHours * HOUR)], 'createdAt', maxItems * 2)
    let handled = 0
    for (const d of stale) {
      if (handled >= maxItems) break
      const ids = claimIds(d.name)
      if (!ids || fsBool(d.fields, 'clientAgreed')) continue
      handled++
      const [requestId, workerId] = ids
      const req = await getDoc(`requests/${requestId}`)
      if (!req?.fields) continue
      const status = fsString(req.fields, 'status')
      const reason = `No agreed price within ${cfg.noResponseHours} hours`
      const res = await call(`${base}:commit`, {
        method: 'POST',
        body: JSON.stringify({ writes: [
          { update: { name: d.name, fields: { status: str('cancelled'), cancelledBy: str('system'), cancelReason: str(reason), cancelledAt: ts(now), cancelWasLate: { booleanValue: false } } },
            updateMask: { fieldPaths: ['status', 'cancelledBy', 'cancelReason', 'cancelledAt', 'cancelWasLate'] }, currentDocument: { updateTime: d.updateTime } },
          { update: { name: req.name, fields: { claimsCount: int(Math.max(0, fsNum(req.fields, 'claimsCount') - 1)), status: str(status === 'filled' ? 'open' : status), lastWorkerId: str(workerId) } },
            updateMask: { fieldPaths: ['claimsCount', 'status', 'lastWorkerId'] }, currentDocument: { updateTime: req.updateTime } },
        ] }),
      })
      if (!res.ok) continue // someone changed the claim or request meanwhile: try again next run
      result.released++
      const title = fsString(d.fields, 'title')
      await notify(workerId, requestId, 'released', `You were released from "${title}": ${reason}.`)
      await notify(fsString(d.fields, 'clientId'), requestId, 'released', `A worker was released from "${title}": ${reason}. Another worker can accept now.`)
      if (cfg.noResponseStrikes && await create('strikes', `${requestId}_${workerId}_noresp`, {
        userId: str(workerId), role: str('worker'), type: str('no_response'), requestId: str(requestId), note: str(reason), createdAt: ts(now), by: str('system'),
      })) { result.strikes++; touched.set(workerId, 'worker') }
    }

    // 3) Late cancellations (cancelled after the client agreed) become strikes. Only cancellations since the last run are read.
    const meta = await getDoc('meta/cron')
    const since = fsTime(meta?.fields, 'lastCancelScan') || now - 2 * DAY
    let lastTs = 0
    for (const d of await claims([eq('status', 'cancelled'), cmp('cancelledAt', 'GREATER_THAN_OR_EQUAL', since)], 'cancelledAt', maxItems * 3)) {
      const ids = claimIds(d.name)
      const by = fsString(d.fields, 'cancelledBy')
      const at = fsTime(d.fields, 'cancelledAt')
      if (ids && fsBool(d.fields, 'cancelWasLate') && (by === 'worker' || by === 'client')) {
        const userId = by === 'worker' ? ids[1] : fsString(d.fields, 'clientId')
        if (userId && await create('strikes', `${ids[0]}_${ids[1]}_late`, {
          userId: str(userId), role: str(by), type: str('late_cancel'), requestId: str(ids[0]), note: str('Cancelled after the price was agreed'), createdAt: ts(now), by: str('system'),
        })) { result.strikes++; touched.set(userId, by) }
      }
      lastTs = Math.max(lastTs, at)
    }
    if (lastTs > 0) await patch(`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/meta/cron`, { lastCancelScan: ts(lastTs + 1) })

    // 4) Users who got a new strike: freeze or flag for review when they reach the limits (set in Admin > Settings).
    let evaluated = 0
    for (const [userId, role] of touched) {
      if (evaluated++ >= maxItems) break
      const strikes = await query({ from: [{ collectionId: 'strikes' }], where: eq('userId', userId), limit: 100 })
      const count = strikes.filter((s) => COUNTED.includes(fsString(s.fields, 'type')) && fsTime(s.fields, 'createdAt') >= now - cfg.penaltyWindowDays * DAY).length
      const freezeAt = role === 'client' ? cfg.clientFreezeAt : cfg.workerFreezeAt
      const reviewAt = role === 'client' ? cfg.clientReviewAt : cfg.workerReviewAt
      if (count < freezeAt) continue
      const user = await getDoc(`users/${userId}`)
      if (!user?.fields) continue
      const reason = `${count} strikes in ${cfg.penaltyWindowDays} days (late cancellations or no response)`
      const fields: FsFields = {}
      if (fsTime(user.fields, 'frozenUntil') <= now) {
        Object.assign(fields, { frozenUntil: ts(now + cfg.freezeDays * DAY), frozenReason: str(reason) })
        result.frozen++
      }
      if (count >= reviewAt && !fsBool(user.fields, 'needsReview')) {
        Object.assign(fields, { needsReview: { booleanValue: true }, reviewReason: str(reason) })
        result.flagged++
      }
      if (Object.keys(fields).length === 0) continue
      await patch(user.name, fields)
      if (fields.frozenUntil) await create(`notifications/${userId}/items`, `freeze_${userId}_${Math.floor(now / DAY)}`, {
        type: str('system'), requestId: str('account'), fromId: str('system'), createdAt: ts(now), read: { booleanValue: false },
        message: str(`Your account is limited for ${cfg.freezeDays} days: ${reason}.`.slice(0, 140)),
      } as FsFields)
    }
  } catch (e) {
    if (!(e instanceof BudgetExceeded)) throw e
    result.stoppedEarly = true // the rest is picked up by the next run
  }
  return result
}
