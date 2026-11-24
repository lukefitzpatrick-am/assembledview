/**
 * Site Watch crons (gate D1): the 6am enqueue and the 5-minute worker.
 * The worker claims one run at a time and works it until its time budget
 * runs out; an unfinished run goes back to the queue and resumes next call.
 */
import "server-only"

import type { Db } from "@/db"
import { getMelbourneTodayISO } from "@/lib/dates/melbourne"
import { getOpsEmailRecipients, sendHtmlEmail } from "@/lib/email/sendHtmlEmail"

import { criticalEmail } from "./email"
import { fetchUrl } from "./fetchPage"
import { advanceRun } from "./scan"
import {
  claimNextRun,
  criticalForEmail,
  deleteOldRuns,
  enqueueRuns,
  expireOldQueuedRuns,
  failRun,
  finishRun,
  markEmailed,
  requeueRun,
  resetStuckRuns,
  scanStore,
  syncSitesFromClients,
} from "./store"

/** Stop starting groups this long before the route's 300 s limit. */
const WORKER_BUDGET_MS = 240_000

export async function runEnqueue(db: Db, now = new Date()) {
  const scanDate = getMelbourneTodayISO(now)
  const sitesAdded = await syncSitesFromClients(db)
  const expired = await expireOldQueuedRuns(db, scanDate)
  if (expired) console.warn(`[site-watch] ${expired} queued run(s) from earlier days were never reached`)
  const queued = await enqueueRuns(db, scanDate)
  const deleted = await deleteOldRuns(db, scanDate)
  return { scanDate, sitesAdded, expired, queued, runsDeleted: deleted }
}

export async function runWorker(db: Db, started = Date.now()) {
  const deadline = started + WORKER_BUDGET_MS
  await resetStuckRuns(db)
  const store = scanStore(db)
  const summary = { finished: 0, requeued: 0, failed: 0, emailed: 0 }
  while (Date.now() + 40_000 < deadline) {
    const claimed = await claimNextRun(db)
    if (!claimed) break
    const { site, run } = claimed
    try {
      if (!(await advanceRun(site, run, { store, fetchUrl, deadline }))) {
        await requeueRun(db, run.id)
        summary.requeued++
        break
      }
      await finishRun(db, run.id)
      summary.finished++
    } catch (err) {
      console.error("[site-watch] run failed", run.id, err)
      const final = await failRun(db, run.id, err instanceof Error ? err.message : String(err))
      summary.failed++
      // Under three attempts it runs again; on the last, email what it found so far.
      if (!final) continue
    }
    try {
      const critical = await criticalForEmail(db, run.id)
      if (critical) {
        await sendHtmlEmail({ to: getOpsEmailRecipients(), ...criticalEmail(critical) })
        await markEmailed(db, run.id)
        summary.emailed++
      }
    } catch (err) {
      // The scan is saved; a failed email is logged, not retried (the changes stay in AV).
      console.error("[site-watch] critical email failed", run.id, err)
    }
  }
  return summary
}
