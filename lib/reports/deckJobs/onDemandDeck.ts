/**
 * On-demand deck queue, job, and status. The row is the job.
 * report_runs has no note column. A deck note is stored in error as "note:…".
 * A failed row keeps its error text as the failure.
 */
import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import * as schema from "@/db/schema"

export const ON_DEMAND_DECK_KIND = "on_demand_deck"
export const ON_DEMAND_NOTE_PREFIX = "note:"
export const ON_DEMAND_STALE_QUEUE_MINUTES = 2
export const ON_DEMAND_GENERATING_TIMEOUT_MINUTES = 10
export const ON_DEMAND_TIMEOUT_ERROR = "Timed out"

export type OnDemandDeckRow = {
  id: string
  kind: string
  mbaNumber: string
  periodStart: string
  periodEnd: string
  status: string
  attempts: number
  blobPathname: string | null
  fileName: string | null
  error: string | null
  requestedByEmail: string | null
  createdAt: string
  startedAt: string | null
}

export type OnDemandEnqueueInput = {
  mbaNumber: string
  periodStart: string
  periodEnd: string
  requestedByEmail: string | null
}

export type OnDemandEnqueueRepo = {
  insertQueued(input: OnDemandEnqueueInput): Promise<{ id: string } | null>
  findInflight(
    mbaNumber: string,
    periodStart: string,
  ): Promise<{ id: string; status: string } | null>
}

export type BuiltOnDemandDeck = {
  buffer: Buffer
  fileName: string
  note?: string
}

export type OnDemandDeckStatusBody = {
  status: string
  fileName: string | null
  downloadUrl: string | null
  error: string | null
  note: string | null
  createdAt: string
}

/** Same build call as Review & Report, on the window already stored on the row. */
export function onDemandGenerateInput(run: {
  mbaNumber: string
  periodStart: string
  periodEnd: string
}): {
  mbaNumber: string
  period: { kind: "custom"; start: string; end: string }
  store: false
  withCommentary: true
} {
  return {
    mbaNumber: run.mbaNumber,
    period: { kind: "custom", start: run.periodStart, end: run.periodEnd },
    store: false,
    withCommentary: true,
  }
}

export function onDemandInsert<TSchema extends Record<string, unknown>>(
  db: PostgresJsDatabase<TSchema>,
  input: OnDemandEnqueueInput,
) {
  return db
    .insert(schema.reportRuns)
    .values({
      kind: ON_DEMAND_DECK_KIND,
      mbaNumber: input.mbaNumber,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status: "queued",
      requestedByEmail: input.requestedByEmail,
    })
    .onConflictDoNothing({
      target: [
        schema.reportRuns.kind,
        schema.reportRuns.mbaNumber,
        schema.reportRuns.periodStart,
      ],
      where: sql`kind = 'on_demand_deck' AND status IN ('queued', 'generating')`,
    })
    .returning({ id: schema.reportRuns.id, status: schema.reportRuns.status })
}

export async function enqueueOnDemandDeck(
  repo: OnDemandEnqueueRepo,
  input: OnDemandEnqueueInput,
): Promise<{ runId: string; status: string }> {
  const inserted = await repo.insertQueued(input)
  if (inserted) return { runId: inserted.id, status: "queued" }
  const existing = await repo.findInflight(input.mbaNumber, input.periodStart)
  if (!existing) {
    throw new Error("An in-flight on-demand deck was not found")
  }
  return { runId: existing.id, status: existing.status }
}

function ageMs(iso: string | null, now: number): number | null {
  if (!iso) return null
  const parsed = Date.parse(iso)
  if (Number.isNaN(parsed)) return null
  return now - parsed
}

/** Queued for more than 2 minutes. Equal to the cutoff stays queued. */
export function isStaleQueued(
  row: { status: string; createdAt: string },
  now: number,
): boolean {
  if (row.status !== "queued") return false
  const age = ageMs(row.createdAt, now)
  return age != null && age > ON_DEMAND_STALE_QUEUE_MINUTES * 60_000
}

/** Generating for more than 10 minutes. */
export function isStuckGenerating(
  row: { status: string; startedAt: string | null },
  now: number,
): boolean {
  if (row.status !== "generating") return false
  const age = ageMs(row.startedAt, now)
  return age != null && age > ON_DEMAND_GENERATING_TIMEOUT_MINUTES * 60_000
}

export async function executeOnDemandDeck(
  run: OnDemandDeckRow,
  deps: {
    build: (run: OnDemandDeckRow) => Promise<BuiltOnDemandDeck>
    store: (
      mba: string,
      fileName: string,
      buffer: Buffer,
    ) => Promise<{ pathname: string; filename: string }>
    markGenerated: (
      id: string,
      fields: { blobPathname: string; fileName: string; error: string | null },
    ) => Promise<void>
    markFailed: (id: string, message: string) => Promise<void>
  },
): Promise<void> {
  try {
    const built = await deps.build(run)
    const stored = await deps.store(run.mbaNumber, built.fileName, built.buffer)
    const note = built.note?.trim()
    await deps.markGenerated(run.id, {
      blobPathname: stored.pathname,
      fileName: built.fileName,
      error: note ? `${ON_DEMAND_NOTE_PREFIX}${note}` : null,
    })
  } catch (err) {
    const message = err instanceof Error && err.message ? err.message : "Deck build failed"
    await deps.markFailed(run.id, message)
  }
}

export async function runOnDemandDeckSafetyNet(deps: {
  failTimedOut: () => Promise<number>
  claimStale: () => Promise<OnDemandDeckRow | null>
  run: (run: OnDemandDeckRow) => Promise<void>
}): Promise<{ ran: boolean; timedOut: number }> {
  const timedOut = await deps.failTimedOut()
  const claimed = await deps.claimStale()
  if (!claimed) return { ran: false, timedOut }
  await deps.run(claimed)
  return { ran: true, timedOut }
}

export function onDemandDeckStatusBody(run: OnDemandDeckRow): OnDemandDeckStatusBody {
  const storedNote =
    run.status === "generated" && run.error?.startsWith(ON_DEMAND_NOTE_PREFIX)
      ? run.error.slice(ON_DEMAND_NOTE_PREFIX.length)
      : null
  return {
    status: run.status,
    fileName: run.fileName,
    downloadUrl:
      run.status === "generated" && run.blobPathname
        ? `/api/reports/download?path=${encodeURIComponent(run.blobPathname)}`
        : null,
    error: storedNote ? null : run.error,
    note: storedNote,
    createdAt: run.createdAt,
  }
}

export async function loadOnDemandDeckStatus(
  runId: string,
  deps: {
    findRun: (id: string) => Promise<OnDemandDeckRow | null>
    canSeeMba: (mbaNumber: string) => Promise<boolean>
  },
): Promise<{ error: "not_found" | "forbidden" } | { body: OnDemandDeckStatusBody }> {
  const run = await deps.findRun(runId)
  if (!run) return { error: "not_found" }
  if (!(await deps.canSeeMba(run.mbaNumber))) return { error: "forbidden" }
  return { body: onDemandDeckStatusBody(run) }
}
