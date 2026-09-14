/**
 * Staged ingest review store — in-memory overlay + types.
 * Postgres `ingest_stages` writers live in ingestStageStore.server.ts.
 * Never import the .server sibling from a Client Component.
 */

import type { IngestReviewPackage } from "@/lib/mediaplans/ingest/buildIngestReview"
import type { IngestSourceFile } from "@/lib/mediaplans/ingest/ingestWorkbookBlob"

export type { IngestSourceFile }

export const INGEST_STAGE_TTL_MS = 24 * 60 * 60 * 1000

export type StagedIngest = {
  stageId: string
  review: IngestReviewPackage
  fileName: string | null
  uploadedBy: string | null
  createdAt: string
  expiresAt: string | null
  retainedAt: string | null
  masterId: number | null
  acceptedVersionId: number | null
  sourceFile: IngestSourceFile | null
}

export type IngestStageLookup =
  | { ok: true; staged: StagedIngest }
  | { ok: false; reason: "missing" | "expired" }

const processCache = new Map<string, StagedIngest>()
const durableMemory = new Map<string, StagedIngest>()

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function cloneReview(review: IngestReviewPackage): IngestReviewPackage {
  return JSON.parse(JSON.stringify(review)) as IngestReviewPackage
}

export function cloneStaged(row: StagedIngest): StagedIngest {
  return JSON.parse(JSON.stringify(row)) as StagedIngest
}

export function isExpired(row: StagedIngest, nowMs = Date.now()): boolean {
  if (row.expiresAt == null) return false
  const t = Date.parse(row.expiresAt)
  return Number.isFinite(t) && t <= nowMs
}

export function classify(row: StagedIngest | null | undefined): IngestStageLookup {
  if (!row) return { ok: false, reason: "missing" }
  if (isExpired(row)) return { ok: false, reason: "expired" }
  return { ok: true, staged: row }
}

export function writeIngestStageLocal(row: StagedIngest): void {
  const copy = cloneStaged(row)
  processCache.set(row.stageId, copy)
  durableMemory.set(row.stageId, cloneStaged(row))
}

export function readIngestStageLocal(stageId: string): StagedIngest | null {
  return processCache.get(stageId) ?? durableMemory.get(stageId) ?? null
}

export function deleteIngestStageLocal(stageId: string): void {
  processCache.delete(stageId)
  durableMemory.delete(stageId)
}

export function rememberIngestStageInProcess(
  stageId: string,
  row: StagedIngest,
): void {
  if (!processCache.has(stageId)) {
    processCache.set(stageId, cloneStaged(row))
  }
}

export function listIngestStageOverlayRows(): StagedIngest[] {
  const byId = new Map<string, StagedIngest>()
  for (const row of processCache.values()) byId.set(row.stageId, row)
  for (const row of durableMemory.values()) {
    if (!byId.has(row.stageId)) byId.set(row.stageId, row)
  }
  return [...byId.values()]
}

export function clearIngestStageForTests() {
  processCache.clear()
  durableMemory.clear()
}

/** Clears process memory only — durable overlay / PG still hold the row. */
export function simulateIngestStageModuleReloadForTests() {
  processCache.clear()
}

export function setIngestStageExpiresAtForTests(
  stageId: string,
  expiresAt: string | null,
) {
  const existing = readIngestStageLocal(stageId)
  if (existing) writeIngestStageLocal({ ...existing, expiresAt })
}
