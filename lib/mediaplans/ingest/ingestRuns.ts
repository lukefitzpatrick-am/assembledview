/**
 * ingest_runs history overlay + Postgres write.
 * Accept / cancel / blocked each insert one row. Never a plan write.
 */

import type { SQL } from "drizzle-orm"
import { resolveCatalogueIdForProfileName } from "@/lib/mediaplans/ingest/publisherCatalogueJoin"

export type IngestRunOutcome = "accepted" | "cancelled" | "blocked"

export type IngestRunInput = {
  publisherId: number | null
  publisherName: string | null
  fileName: string | null
  uploadedBy: string | null
  detectedConfidence: number | null
  requiredCoverage: number | null
  lineItemCount: number
  panelCount: number
  burstCount: number
  moneyDelta: number | null
  outcome: IngestRunOutcome
  outcomeReason: string | null
  acceptedVersionId: number | null
}

export type IngestRunRecord = IngestRunInput & {
  id: number
  createdAt: string
}

const overlay: IngestRunRecord[] = []
let overlaySeq = 0

export function clearIngestRunOverlayForTests() {
  overlay.length = 0
  overlaySeq = 0
}

function toRecord(input: IngestRunInput): IngestRunRecord {
  overlaySeq += 1
  return {
    ...input,
    publisherId:
      input.publisherId ??
      (input.publisherName
        ? resolveCatalogueIdForProfileName(input.publisherName)
        : null),
    id: overlaySeq,
    createdAt: new Date().toISOString(),
  }
}

export async function recordIngestRun(
  input: IngestRunInput,
): Promise<IngestRunRecord> {
  const row = toRecord(input)
  try {
    const { db } = await import("@/db")
    const { ingestRuns } = await import("@/db/schema/ingestRuns")
    const inserted = await db
      .insert(ingestRuns)
      .values({
        publisherId: row.publisherId,
        publisherName: row.publisherName,
        fileName: row.fileName,
        uploadedBy: row.uploadedBy,
        detectedConfidence:
          row.detectedConfidence != null ? String(row.detectedConfidence) : null,
        requiredCoverage:
          row.requiredCoverage != null ? String(row.requiredCoverage) : null,
        lineItemCount: row.lineItemCount,
        panelCount: row.panelCount,
        burstCount: row.burstCount,
        moneyDelta: row.moneyDelta != null ? String(row.moneyDelta) : null,
        outcome: row.outcome,
        outcomeReason: row.outcomeReason,
        acceptedVersionId: row.acceptedVersionId,
      })
      .returning()
    const saved = inserted[0]
    if (saved) {
      const rec: IngestRunRecord = {
        id: saved.id,
        createdAt: saved.createdAt,
        publisherId: saved.publisherId,
        publisherName: saved.publisherName,
        fileName: saved.fileName,
        uploadedBy: saved.uploadedBy,
        detectedConfidence:
          saved.detectedConfidence != null
            ? Number(saved.detectedConfidence)
            : null,
        requiredCoverage:
          saved.requiredCoverage != null
            ? Number(saved.requiredCoverage)
            : null,
        lineItemCount: saved.lineItemCount,
        panelCount: saved.panelCount,
        burstCount: saved.burstCount,
        moneyDelta: saved.moneyDelta != null ? Number(saved.moneyDelta) : null,
        outcome: saved.outcome as IngestRunOutcome,
        outcomeReason: saved.outcomeReason,
        acceptedVersionId: saved.acceptedVersionId,
      }
      overlay.unshift(rec)
      return rec
    }
  } catch {
    // Migration not applied / DB unavailable — overlay is the test + local store.
  }
  overlay.unshift(row)
  return row
}

export async function listIngestRuns(args: {
  publisherId?: number | null
  publisherName?: string | null
  limit?: number
}): Promise<IngestRunRecord[]> {
  const limit = args.limit ?? 20
  const nameKey = args.publisherName?.trim().toLowerCase() ?? null
  try {
    const { db } = await import("@/db")
    const { ingestRuns } = await import("@/db/schema/ingestRuns")
    const { desc, eq, or } = await import("drizzle-orm")
    const clauses: SQL[] = []
    if (args.publisherId != null) {
      clauses.push(eq(ingestRuns.publisherId, args.publisherId))
    }
    if (args.publisherName?.trim()) {
      clauses.push(eq(ingestRuns.publisherName, args.publisherName.trim()))
    }
    const rows =
      clauses.length > 0
        ? await db
            .select()
            .from(ingestRuns)
            .where(or(...clauses))
            .orderBy(desc(ingestRuns.createdAt))
            .limit(limit)
        : await db
            .select()
            .from(ingestRuns)
            .orderBy(desc(ingestRuns.createdAt))
            .limit(limit)
    if (rows.length > 0) {
      return rows.map((saved) => ({
        id: saved.id,
        createdAt: saved.createdAt,
        publisherId: saved.publisherId,
        publisherName: saved.publisherName,
        fileName: saved.fileName,
        uploadedBy: saved.uploadedBy,
        detectedConfidence:
          saved.detectedConfidence != null
            ? Number(saved.detectedConfidence)
            : null,
        requiredCoverage:
          saved.requiredCoverage != null
            ? Number(saved.requiredCoverage)
            : null,
        lineItemCount: saved.lineItemCount,
        panelCount: saved.panelCount,
        burstCount: saved.burstCount,
        moneyDelta: saved.moneyDelta != null ? Number(saved.moneyDelta) : null,
        outcome: saved.outcome as IngestRunOutcome,
        outcomeReason: saved.outcomeReason,
        acceptedVersionId: saved.acceptedVersionId,
      }))
    }
  } catch {
    // overlay
  }
  return overlay
    .filter((r) => {
      if (args.publisherId != null && r.publisherId === args.publisherId) {
        return true
      }
      if (nameKey && r.publisherName?.trim().toLowerCase() === nameKey) {
        return true
      }
      return args.publisherId == null && !nameKey
    })
    .slice(0, limit)
}
