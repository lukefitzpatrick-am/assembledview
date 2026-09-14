/**
 * Server-only ingest_stages persistence (0050). Overlay helpers live in
 * ingestStageStore.ts. Never imported from Client Components.
 */
import "server-only"

import { and, eq, isNotNull, isNull, lt } from "drizzle-orm"
import { db } from "@/db"
import { ingestStages } from "@/db/schema/ingestStages"
import type { IngestReviewPackage } from "@/lib/mediaplans/ingest/buildIngestReview"
import {
  INGEST_STAGE_TTL_MS,
  UUID_RE,
  classify,
  cloneReview,
  deleteIngestStageLocal,
  isExpired,
  listIngestStageOverlayRows,
  readIngestStageLocal,
  rememberIngestStageInProcess,
  writeIngestStageLocal,
  type IngestSourceFile,
  type IngestStageLookup,
  type StagedIngest,
} from "@/lib/mediaplans/ingest/ingestStageStore"
import {
  deleteIngestWorkbook,
  parseIngestSourceFile,
} from "@/lib/mediaplans/ingest/ingestWorkbookBlob"

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
  writeIngestStageLocal(row)
  try {
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
  const existing = readIngestStageLocal(stageId)
  if (existing) {
    writeIngestStageLocal({ ...existing, review: cloneReview(review) })
  }
  if (!UUID_RE.test(stageId)) return
  try {
    await db
      .update(ingestStages)
      .set({ reviewPackage: cloneReview(review) })
      .where(eq(ingestStages.stageId, stageId))
  } catch {
    // overlay
  }
}

export async function lookupIngestStage(
  stageId: string | null | undefined,
): Promise<IngestStageLookup> {
  const id = stageId?.trim()
  if (!id) return { ok: false, reason: "missing" }

  const local = readIngestStageLocal(id)
  if (local && !isExpired(local)) {
    rememberIngestStageInProcess(id, local)
    return { ok: true, staged: local }
  }

  // Local miss or expired — Postgres is authoritative (retain on another
  // instance must win; overlay is the stand-in when 0050 is unapplied).
  if (UUID_RE.test(id)) {
    try {
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
        writeIngestStageLocal(row)
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
  const existing = readIngestStageLocal(stageId)
  if (existing?.sourceFile) {
    await deleteIngestWorkbook(existing.sourceFile)
  }
  deleteIngestStageLocal(stageId)
  if (!UUID_RE.test(stageId)) return
  try {
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
  const existing = readIngestStageLocal(args.stageId)
  if (existing) {
    writeIngestStageLocal({
      ...existing,
      expiresAt: null,
      retainedAt: now,
      masterId: args.masterId,
      acceptedVersionId: args.acceptedVersionId,
    })
  }
  try {
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
  for (const row of listIngestStageOverlayRows()) {
    if (row.retainedAt) continue
    if (row.expiresAt && Date.parse(row.expiresAt) <= nowMs) {
      doomed.add(row.stageId)
      if (row.sourceFile) doomedFiles.push(row.sourceFile)
    }
  }
  for (const file of doomedFiles) {
    await deleteIngestWorkbook(file)
  }
  for (const id of doomed) deleteIngestStageLocal(id)

  try {
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
