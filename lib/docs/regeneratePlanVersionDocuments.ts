/**
 * Rebuild published plan documents from persisted version rows.
 * Writes Blob + jsonb only. Never mutates approved_slice, published_at,
 * schedule_months, or line items.
 */

import { eq } from "drizzle-orm"

import { getDb, schema } from "@/db"
import type { PlanDocumentGeneratedFrom } from "@/lib/docs/planDocumentBlob"
import { renderPlanVersionDocuments } from "@/lib/docs/renderPlanVersionDocuments"
import {
  storePlanVersionDocuments,
  type PlanDocumentFileLike,
} from "@/lib/docs/storePlanVersionDocuments"
import { isVersionPublished } from "@/lib/mediaplan/versionPublication"
import {
  PLAN_DOCUMENT_KINDS,
  parseRegenerateKinds,
  type PlanDocumentKind,
} from "@/lib/docs/planVersionFiles"

export { PLAN_DOCUMENT_KINDS, parseRegenerateKinds }

export type RegenerateKindStatus =
  | "written"
  | "skipped"
  | "not_applicable"
  | "error"

export type RegenerateKindResult = {
  kind: PlanDocumentKind
  status: RegenerateKindStatus
  pathname?: string
  error?: string
}

export type RegeneratePlanVersionDocumentsInput = {
  versionId: number
  kinds?: unknown
  force?: boolean
}

export type RegeneratePlanVersionDocumentsResult =
  | { status: "not_found" }
  | { status: "not_published"; code: "NOT_PUBLISHED" }
  | { status: "ok"; results: RegenerateKindResult[] }

function columnHasFile(value: unknown): boolean {
  return value != null && typeof value === "object" && !Array.isArray(value)
}

function namedFile(
  body: Blob | Buffer,
  filename: string,
  mime: string,
): PlanDocumentFileLike {
  return new File([body as BlobPart], filename, { type: mime })
}

export async function regeneratePlanVersionDocuments(
  input: RegeneratePlanVersionDocumentsInput,
): Promise<RegeneratePlanVersionDocumentsResult> {
  const db = getDb()
  const [row] = await db
    .select({
      versionId: schema.mediaPlanVersions.id,
      versionNumber: schema.mediaPlanVersions.versionNumber,
      mbaNumber: schema.mediaPlanMasters.mbaNumber,
      publishedAt: schema.mediaPlanVersions.publishedAt,
      publishedVersionId: schema.mediaPlanMasters.publishedVersionId,
      mbaPdfFile: schema.mediaPlanVersions.mbaPdfFile,
      mediaPlanFile: schema.mediaPlanVersions.mediaPlanFile,
      aaMediaPlanFile: schema.mediaPlanVersions.aaMediaPlanFile,
    })
    .from(schema.mediaPlanVersions)
    .innerJoin(
      schema.mediaPlanMasters,
      eq(schema.mediaPlanVersions.masterId, schema.mediaPlanMasters.id),
    )
    .where(eq(schema.mediaPlanVersions.id, input.versionId))
    .limit(1)

  if (!row) return { status: "not_found" }

  if (
    row.publishedVersionId !== row.versionId ||
    !isVersionPublished({ publishedAt: row.publishedAt })
  ) {
    return { status: "not_published", code: "NOT_PUBLISHED" }
  }

  const kinds = parseRegenerateKinds(input.kinds)
  const force = Boolean(input.force)
  const existing: Record<PlanDocumentKind, unknown> = {
    mba_pdf: row.mbaPdfFile,
    media_plan: row.mediaPlanFile,
    aa_media_plan: row.aaMediaPlanFile,
  }

  const results: RegenerateKindResult[] = []
  const files: {
    mba_pdf?: PlanDocumentFileLike
    media_plan?: PlanDocumentFileLike
    aa_media_plan?: PlanDocumentFileLike
  } = {}

  const publishedAtDate = row.publishedAt ? new Date(row.publishedAt) : new Date()
  const kindsToRender: PlanDocumentKind[] = []
  for (const kind of kinds) {
    if (!force && columnHasFile(existing[kind])) {
      results.push({ kind, status: "skipped" })
    } else {
      kindsToRender.push(kind)
    }
  }

  let generatedFromByKind:
    | Partial<Record<PlanDocumentKind, PlanDocumentGeneratedFrom>>
    | undefined
  if (kindsToRender.length > 0) {
    const rendered = await renderPlanVersionDocuments({
      mbaNumber: row.mbaNumber,
      versionNumber: row.versionNumber,
      kinds: kindsToRender,
      now: publishedAtDate,
    })
    if (rendered.status === "not_published") {
      return { status: "not_published", code: "NOT_PUBLISHED" }
    }
    generatedFromByKind = rendered.generatedFrom
    for (const result of rendered.results) {
      results.push(result)
      const file = rendered.files[result.kind]
      if (file && result.status === "written") {
        files[result.kind] = namedFile(file.buffer, file.filename, file.mime)
      }
    }
  }

  const toWrite = Object.fromEntries(
    Object.entries(files).filter(([, file]) => file),
  ) as typeof files

  if (Object.keys(toWrite).length > 0) {
    const stored = await storePlanVersionDocuments({
      versionId: row.versionId,
      files: toWrite,
      source: "regenerated",
      generatedFromByKind,
    })
    if (stored.status === "ok") {
      for (const result of results) {
        if (result.status !== "written") continue
        const json = stored.files[result.kind]
        if (json?.pathname) result.pathname = json.pathname
      }
    } else {
      for (const result of results) {
        if (result.status === "written") {
          result.status = "error"
          result.error = "Version not found while writing documents"
        }
      }
    }
  }

  return { status: "ok", results }
}
