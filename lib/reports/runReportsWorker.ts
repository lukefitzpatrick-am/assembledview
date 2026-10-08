/**
 * Hourly campaign-report worker. Claims queued or failed rows one at a time,
 * generates the deck, and stops when the batch or the time budget is used.
 * The route owns the database. Tests inject the claim and save functions.
 */

export const REPORTS_WORKER_BUDGET_MS = 240_000
export const REPORTS_WORKER_CLAIM_RESERVE_MS = 60_000
export const REPORTS_WORKER_DEFAULT_BATCH = 3
export const REPORTS_WORKER_MAX_ATTEMPTS = 3
export const REPORTS_WORKER_STUCK_MS = 30 * 60 * 1000
export const REPORTS_WORKER_TIMEOUT_ERROR = "timed out 3 times"
export const REPORTS_WORKER_ERROR_MAX = 500

export type ClaimedReportRun = {
  id: string
  mbaNumber: string
  periodStart: string
  periodEnd: string
  attempts: number
}

export type ReportWorkerGenerateInput = {
  mbaNumber: string
  period: { kind: "custom"; start: string; end: string }
  store: true
  withCommentary: true
}

export type ReportWorkerGenerateResult = {
  fileName: string
  blobPathname?: string
  commentaryGenerated: boolean
  skipped?: string
}

export type ReportWorkerGeneratedFields = {
  blobPathname: string
  fileName: string
  commentaryGenerated: boolean
}

export type ReportsWorkerSummary = {
  claimed: number
  generated: number
  skipped: number
  failed: number
  durationMs: number
}

export type ReportsWorkerDeps = {
  now?: () => number
  batch: number
  resetStuck: () => Promise<void>
  claimOne: () => Promise<ClaimedReportRun | null>
  generate: (input: ReportWorkerGenerateInput) => Promise<ReportWorkerGenerateResult>
  saveGenerated: (id: string, fields: ReportWorkerGeneratedFields) => Promise<void>
  saveSkipped: (id: string, skipReason: string) => Promise<void>
  saveFailed: (id: string, error: string) => Promise<void>
}

/** Positive integer from `REPORTS_WORKER_BATCH`. Anything else is 3. */
export function reportsWorkerBatchSize(raw: string | undefined): number {
  if (raw == null || raw.trim() === "") return REPORTS_WORKER_DEFAULT_BATCH
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) return REPORTS_WORKER_DEFAULT_BATCH
  return n
}

/** True while more than 60s of the 240s budget is left. */
export function hasClaimBudget(elapsedMs: number): boolean {
  return REPORTS_WORKER_BUDGET_MS - elapsedMs > REPORTS_WORKER_CLAIM_RESERVE_MS
}

/** Queued or failed, and still under three attempts. */
export function isReportRunClaimable(status: string, attempts: number): boolean {
  return (
    (status === "queued" || status === "failed") &&
    attempts < REPORTS_WORKER_MAX_ATTEMPTS
  )
}

/**
 * A row left in `generating` for more than 30 minutes.
 * Under three attempts it goes back to queued. At three it fails.
 */
export function stuckGeneratingResolution(attempts: number): {
  status: "queued" | "failed"
  error: string | null
} {
  if (attempts < REPORTS_WORKER_MAX_ATTEMPTS) {
    return { status: "queued", error: null }
  }
  return { status: "failed", error: REPORTS_WORKER_TIMEOUT_ERROR }
}

export function trimReportRunError(error: unknown): string {
  const message = (error instanceof Error ? error.message : String(error)).trim()
  return message.slice(0, REPORTS_WORKER_ERROR_MAX)
}

export async function runReportsWorker(
  deps: ReportsWorkerDeps,
): Promise<ReportsWorkerSummary> {
  const now = deps.now ?? Date.now
  const started = now()
  let claimed = 0
  let generated = 0
  let skipped = 0
  let failed = 0
  let durationMs = 0

  try {
    await deps.resetStuck()
    while (claimed < deps.batch) {
      if (!hasClaimBudget(now() - started)) break
      const row = await deps.claimOne()
      if (!row) break
      claimed += 1
      try {
        const result = await deps.generate({
          mbaNumber: row.mbaNumber,
          period: {
            kind: "custom",
            start: row.periodStart,
            end: row.periodEnd,
          },
          store: true,
          withCommentary: true,
        })
        if (result.skipped) {
          await deps.saveSkipped(row.id, result.skipped)
          skipped += 1
        } else if (!result.blobPathname) {
          await deps.saveFailed(row.id, "Report was generated without a stored file.")
          failed += 1
        } else {
          await deps.saveGenerated(row.id, {
            blobPathname: result.blobPathname,
            fileName: result.fileName,
            commentaryGenerated: result.commentaryGenerated,
          })
          generated += 1
        }
      } catch (err) {
        await deps.saveFailed(row.id, trimReportRunError(err))
        failed += 1
      }
    }
  } finally {
    durationMs = Math.max(0, now() - started)
    console.log(
      `[reports-worker] claimed=${claimed} generated=${generated} skipped=${skipped} failed=${failed} duration=${durationMs}`,
    )
  }

  return { claimed, generated, skipped, failed, durationMs }
}
