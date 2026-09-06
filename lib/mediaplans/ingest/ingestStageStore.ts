/**
 * Staged ingest review store.
 * Overlay + Postgres `ingest_stages` (0050 AUTHOR ONLY). Chat and Hub
 * deep-link (`?stage=`) share the same package — not a re-parse.
 * expires_at NULL means retained. getIngestStage returns null only when
 * missing or expires_at is in the past.
 */

import type { IngestReviewPackage } from "@/lib/mediaplans/ingest/buildIngestReview"
import {
  deleteIngestWorkbook,
  parseIngestSourceFile,
  type IngestSourceFile,
} from "@/lib/mediaplans/ingest/ingestWorkbookBlob"

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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function cloneReview(review: IngestReviewPackage): IngestReviewPackage {
  return JSON.parse(JSON.stringify(review)) as IngestReviewPackage
}

function cloneStaged(row: StagedIngest): StagedIngest {
  return JSON.parse(JSON.stringify(row)) as StagedIngest
}

function isExpired(row: StagedIngest, nowMs = Date.now()): boolean {
  if (row.expiresAt == null) return false
  const t = Date.parse(row.expiresAt)
  return Number.isFinite(t) && t <= nowMs
}

function classify(row: StagedIngest | null | undefined): IngestStageLookup {
  if (!row) return { ok: false, reason: "missing" }
  if (isExpired(row)) return { ok: false, reason: "expired" }
  return { ok: true, staged: row }
}

function writeLocal(row: StagedIngest): void {
  const copy = cloneStaged(row)
  processCache.set(row.stageId, copy)
  durableMemory.set(row.stageId, cloneStaged(row))
}

function readLocal(stageId: string): StagedIngest | null {
  return processCache.get(stageId) ?? durableMemory.get(stageId) ?? null
}

function deleteLocal(stageId: string): void {
  processCache.delete(stageId)
  durableMemory.delete(stageId)
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
  const existing = readLocal(stageId)
  if (existing) writeLocal({ ...existing, expiresAt })
}

export async function putIngestStage(args: {
  review: IngestReviewPackage
  fileName?: string | null
  uploadedBy?: string | null
  stageId?: string
  sourceFile?: IngestSourceFile | null
}): Promise<string> {
  const stageId = args.stageId?.trim() || crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const expiresAt = new Date(Date.now() + INGEST_STAGE_TTL_MS).toISOString()
  const row: StagedIngest = {
    stageId,
    review: cloneReview(args.review),
    fileName: args.fileName ?? null,
    uploadedBy: args.uploadedBy ?? null,
    createdAt,
    expiresAt,
    retainedAt: null,
    masterId: null,
    acceptedVersionId: null,
    sourceFile: args.sourceFile ?? null,
  }
  writeLocal(row)
  try {
    const { db } = await import("@/db")
    const { ingestStages } = await import("@/db/schema/ingestStages")
    const base = {
      stageId: row.stageId,
      reviewPackage: row.review,
      fileName: row.fileName,
      uploadedBy: row.uploadedBy,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      retainedAt: row.retainedAt,
      masterId: row.masterId,
      acceptedVersionId: row.acceptedVersionId,
    }
    const baseSet = {
      reviewPackage: row.review,
      fileName: row.fileName,
      uploadedBy: row.uploadedBy,
      expiresAt: row.expiresAt,
      retainedAt: row.retainedAt,
      masterId: row.masterId,
      acceptedVersionId: row.acceptedVersionId,
    }
    try {
      await db
        .insert(ingestStages)
        .values({ ...base, sourceFile: row.sourceFile })
        .onConflictDoUpdate({
          target: ingestStages.stageId,
          set: { ...baseSet, sourceFile: row.sourceFile },
        })
    } catch {
      await db
        .insert(ingestStages)
        .values(base)
        .onConflictDoUpdate({
          target: ingestStages.stageId,
          set: baseSet,
        })
    }
  } catch {
    // 0050 not applied / DB unavailable — overlay is the test + local store.
  }
  return stageId
}

/** Update the staged package in place (TTL / identity unchanged). */
export async function patchIngestStageReview(
  stageId: string,
  review: IngestReviewPackage,
): Promise<void> {
  const existing = readLocal(stageId)
  if (existing) {
    writeLocal({ ...existing, review: cloneReview(review) })
  }
  if (!UUID_RE.test(stageId)) return
  try {
    const { db } = await import("@/db")
    const { ingestStages } = await import("@/db/schema/ingestStages")
    const { eq } = await import("drizzle-orm")
    await db
      .update(ingestStages)
      .set({ reviewPackage: cloneReview(review) })
      .where(eq(ingestStages.stageId, stageId))
  } catch {
    // overlay
  }
}

function rowFromDb(saved: {
  stageId: string
  reviewPackage: unknown
  fileName: string | null
  uploadedBy: string | null
  createdAt: string
  expiresAt: string | null
  retainedAt: string | null
  masterId: number | null
  acceptedVersionId: number | null
  sourceFile?: unknown
}): StagedIngest {
  return {
    stageId: saved.stageId,
    review: saved.reviewPackage as IngestReviewPackage,
    fileName: saved.fileName,
    uploadedBy: saved.uploadedBy,
    createdAt: saved.createdAt,
    expiresAt: saved.expiresAt,
    retainedAt: saved.retainedAt,
    masterId: saved.masterId,
    acceptedVersionId: saved.acceptedVersionId,
    sourceFile: parseIngestSourceFile(saved.sourceFile),
  }
}

export async function lookupIngestStage(
  stageId: string | null | undefined,
): Promise<IngestStageLookup> {
  const id = stageId?.trim()
  if (!id) return { ok: false, reason: "missing" }

  const local = readLocal(id)
  if (local && !isExpired(local)) {
    if (!processCache.has(id)) {
      processCache.set(id, cloneStaged(local))
    }
    return { ok: true, staged: local }
  }

  // Local miss or expired — Postgres is authoritative (retain on another
  // instance must win; overlay is the stand-in when 0050 is unapplied).
  if (UUID_RE.test(id)) {
    try {
      const { db } = await import("@/db")
      const { ingestStages } = await import("@/db/schema/ingestStages")
      const { eq } = await import("drizzle-orm")
      const [saved] = await db
        .select({
          stageId: ingestStages.stageId,
          reviewPackage: ingestStages.reviewPackage,
          fileName: ingestStages.fileName,
          uploadedBy: ingestStages.uploadedBy,
          createdAt: ingestStages.createdAt,
          expiresAt: ingestStages.expiresAt,
          retainedAt: ingestStages.retainedAt,
          masterId: ingestStages.masterId,
          acceptedVersionId: ingestStages.acceptedVersionId,
        })
        .from(ingestStages)
        .where(eq(ingestStages.stageId, id))
        .limit(1)
      if (saved) {
        let sourceFile: unknown = null
        try {
          const [withFile] = await db
            .select({ sourceFile: ingestStages.sourceFile })
            .from(ingestStages)
            .where(eq(ingestStages.stageId, id))
            .limit(1)
          sourceFile = withFile?.sourceFile ?? null
        } catch {
          // 0068 not applied
        }
        const row = rowFromDb({ ...saved, sourceFile })
        writeLocal(row)
        return classify(row)
      }
      if (local) return classify(local)
      return { ok: false, reason: "missing" }
    } catch {
      if (local) return classify(local)
      return { ok: false, reason: "missing" }
    }
  }

  if (local) return classify(local)
  return { ok: false, reason: "missing" }
}

export async function getIngestStage(
  stageId: string | null | undefined,
): Promise<StagedIngest | null> {
  const looked = await lookupIngestStage(stageId)
  return looked.ok ? looked.staged : null
}

export async function deleteIngestStage(stageId: string): Promise<void> {
  const existing = readLocal(stageId)
  if (existing?.sourceFile) {
    await deleteIngestWorkbook(existing.sourceFile)
  }
  deleteLocal(stageId)
  if (!UUID_RE.test(stageId)) return
  try {
    const { db } = await import("@/db")
    const { ingestStages } = await import("@/db/schema/ingestStages")
    const { eq } = await import("drizzle-orm")
    await db.delete(ingestStages).where(eq(ingestStages.stageId, stageId))
  } catch {
    // overlay
  }
}

export async function retainIngestStage(args: {
  stageId: string
  masterId: number
  acceptedVersionId: number
}): Promise<void> {
  const now = new Date().toISOString()
  const existing = readLocal(args.stageId)
  if (existing) {
    writeLocal({
      ...existing,
      expiresAt: null,
      retainedAt: now,
      masterId: args.masterId,
      acceptedVersionId: args.acceptedVersionId,
    })
  }
  try {
    const { db } = await import("@/db")
    const { ingestStages } = await import("@/db/schema/ingestStages")
    const { eq } = await import("drizzle-orm")
    await db
      .update(ingestStages)
      .set({
        expiresAt: null,
        retainedAt: now,
        masterId: args.masterId,
        acceptedVersionId: args.acceptedVersionId,
      })
      .where(eq(ingestStages.stageId, args.stageId))
  } catch {
    // overlay
  }
}

export async function sweepExpiredIngestStages(
  now: Date = new Date(),
): Promise<number> {
  const nowMs = now.getTime()
  const doomed = new Set<string>()
  const doomedFiles: IngestSourceFile[] = []
  for (const map of [processCache, durableMemory]) {
    for (const [id, row] of map) {
      if (row.retainedAt) continue
      if (row.expiresAt && Date.parse(row.expiresAt) <= nowMs) {
        doomed.add(id)
        if (row.sourceFile) doomedFiles.push(row.sourceFile)
      }
    }
  }
  for (const file of doomedFiles) {
    await deleteIngestWorkbook(file)
  }
  for (const id of doomed) deleteLocal(id)

  try {
    const { db } = await import("@/db")
    const { ingestStages } = await import("@/db/schema/ingestStages")
    const { and, isNotNull, isNull, lt } = await import("drizzle-orm")
    const whereExpired = and(
      isNotNull(ingestStages.expiresAt),
      lt(ingestStages.expiresAt, now.toISOString()),
      isNull(ingestStages.retainedAt),
    )
    try {
      const deleted = await db
        .delete(ingestStages)
        .where(whereExpired)
        .returning({
          stageId: ingestStages.stageId,
          sourceFile: ingestStages.sourceFile,
        })
      for (const row of deleted) {
        const file = parseIngestSourceFile(row.sourceFile)
        if (file) await deleteIngestWorkbook(file)
      }
      return doomed.size + deleted.length
    } catch {
      const deleted = await db
        .delete(ingestStages)
        .where(whereExpired)
        .returning({ stageId: ingestStages.stageId })
      return doomed.size + deleted.length
    }
  } catch {
    return doomed.size
  }
}
