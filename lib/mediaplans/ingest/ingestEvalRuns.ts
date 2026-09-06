/**
 * ingest_eval_runs overlay + Postgres write.
 * Weekly cron inserts one row per publisher. Never a plan write.
 * Fail-soft until 0067 is applied (C-76).
 */

import type { SQL } from "drizzle-orm"
import { resolveCatalogueIdForProfileName } from "@/lib/mediaplans/ingest/publisherCatalogueJoin"

export type IngestEvalCorpusKind = "golden" | "full"

export type IngestEvalRunInput = {
  publisherId: number | null
  publisherName: string
  fixtureId: string | null
  corpusKind: IngestEvalCorpusKind
  lineCount: number
  moneyPct: number
  datesPct: number
  formatPct: number
  placementPct: number
  buyTypePct: number
  overallPct: number
  scores: Record<string, unknown>
}

export type IngestEvalRunRecord = IngestEvalRunInput & {
  id: number
  ranAt: string
}

const overlay: IngestEvalRunRecord[] = []
let overlaySeq = 0

export function clearIngestEvalRunOverlayForTests() {
  overlay.length = 0
  overlaySeq = 0
}

function toRecord(input: IngestEvalRunInput): IngestEvalRunRecord {
  overlaySeq += 1
  return {
    ...input,
    publisherId:
      input.publisherId ??
      resolveCatalogueIdForProfileName(input.publisherName),
    id: overlaySeq,
    ranAt: new Date().toISOString(),
  }
}

function fromSaved(saved: {
  id: number
  publisherId: number | null
  publisherName: string
  fixtureId: string | null
  corpusKind: string
  lineCount: number
  moneyPct: string
  datesPct: string
  formatPct: string
  placementPct: string
  buyTypePct: string
  overallPct: string
  scores: unknown
  ranAt: string
}): IngestEvalRunRecord {
  return {
    id: saved.id,
    publisherId: saved.publisherId,
    publisherName: saved.publisherName,
    fixtureId: saved.fixtureId,
    corpusKind: saved.corpusKind as IngestEvalCorpusKind,
    lineCount: saved.lineCount,
    moneyPct: Number(saved.moneyPct),
    datesPct: Number(saved.datesPct),
    formatPct: Number(saved.formatPct),
    placementPct: Number(saved.placementPct),
    buyTypePct: Number(saved.buyTypePct),
    overallPct: Number(saved.overallPct),
    scores:
      saved.scores && typeof saved.scores === "object"
        ? (saved.scores as Record<string, unknown>)
        : {},
    ranAt: saved.ranAt,
  }
}

export async function recordIngestEvalRun(
  input: IngestEvalRunInput,
): Promise<IngestEvalRunRecord> {
  const row = toRecord(input)
  try {
    const { db } = await import("@/db")
    const { ingestEvalRuns } = await import("@/db/schema/ingestEvalRuns")
    const inserted = await db
      .insert(ingestEvalRuns)
      .values({
        publisherId: row.publisherId,
        publisherName: row.publisherName,
        fixtureId: row.fixtureId,
        corpusKind: row.corpusKind,
        lineCount: row.lineCount,
        moneyPct: String(row.moneyPct),
        datesPct: String(row.datesPct),
        formatPct: String(row.formatPct),
        placementPct: String(row.placementPct),
        buyTypePct: String(row.buyTypePct),
        overallPct: String(row.overallPct),
        scores: row.scores,
      })
      .returning()
    const saved = inserted[0]
    if (saved) {
      const rec = fromSaved(saved)
      overlay.unshift(rec)
      return rec
    }
  } catch {
    // Migration not applied / DB unavailable — overlay is the test + local store.
  }
  overlay.unshift(row)
  return row
}

export async function listLatestIngestEvalRun(args: {
  publisherId?: number | null
  publisherName?: string | null
}): Promise<IngestEvalRunRecord | null> {
  const nameKey = args.publisherName?.trim().toLowerCase() ?? null
  try {
    const { db } = await import("@/db")
    const { ingestEvalRuns } = await import("@/db/schema/ingestEvalRuns")
    const { desc, eq, or } = await import("drizzle-orm")
    const clauses: SQL[] = []
    if (args.publisherId != null) {
      clauses.push(eq(ingestEvalRuns.publisherId, args.publisherId))
    }
    if (args.publisherName?.trim()) {
      clauses.push(eq(ingestEvalRuns.publisherName, args.publisherName.trim()))
    }
    const rows =
      clauses.length > 0
        ? await db
            .select()
            .from(ingestEvalRuns)
            .where(or(...clauses))
            .orderBy(desc(ingestEvalRuns.ranAt))
            .limit(1)
        : await db
            .select()
            .from(ingestEvalRuns)
            .orderBy(desc(ingestEvalRuns.ranAt))
            .limit(1)
    if (rows[0]) return fromSaved(rows[0])
  } catch {
    // overlay
  }
  return (
    overlay.find((r) => {
      if (args.publisherId != null && r.publisherId === args.publisherId) {
        return true
      }
      if (nameKey && r.publisherName.trim().toLowerCase() === nameKey) {
        return true
      }
      return args.publisherId == null && !nameKey
    }) ?? null
  )
}
