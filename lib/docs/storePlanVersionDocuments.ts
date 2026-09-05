/**
 * Persist published plan documents to Vercel Blob and the version jsonb
 * columns (`mba_pdf_file` / `media_plan_file` / `aa_media_plan_file`).
 *
 * Documents are attached after publish by design. Do not call
 * `assertVersionMutable` — Stage 2a covers plan content, not these file
 * pointers. Never touch `published_at` / `published_by`.
 */
import { put } from "@vercel/blob"
import { eq } from "drizzle-orm"

import { getDb, schema } from "@/db"
import {
  planDocumentBlobJson,
  planDocumentBlobPathname,
  type PlanDocumentBlobJson,
} from "@/lib/docs/planDocumentBlob"
import type { PlanDocumentKind } from "@/lib/docs/planVersionFiles"

export type { PlanDocumentBlobJson } from "@/lib/docs/planDocumentBlob"
export { planDocumentBlobJson, planDocumentBlobPathname } from "@/lib/docs/planDocumentBlob"

export type PlanDocumentFileLike = Blob & {
  name?: string
  type?: string
  size?: number
}

export type StorePlanVersionDocumentsInput = {
  versionId: number
  files: {
    mba_pdf?: PlanDocumentFileLike
    media_plan?: PlanDocumentFileLike
    aa_media_plan?: PlanDocumentFileLike
  }
}

export type StorePlanVersionDocumentsResult =
  | { status: "not_found" }
  | {
      status: "ok"
      files: {
        mba_pdf?: PlanDocumentBlobJson
        media_plan?: PlanDocumentBlobJson
        aa_media_plan?: PlanDocumentBlobJson
      }
    }

const KIND_COLUMN = {
  mba_pdf: "mbaPdfFile",
  media_plan: "mediaPlanFile",
  aa_media_plan: "aaMediaPlanFile",
} as const satisfies Record<PlanDocumentKind, "mbaPdfFile" | "mediaPlanFile" | "aaMediaPlanFile">

function mimeForFile(file: PlanDocumentFileLike, filename: string): string {
  if (typeof file.type === "string" && file.type.trim()) return file.type.trim()
  const lower = filename.toLowerCase()
  if (lower.endsWith(".pdf")) return "application/pdf"
  if (lower.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  }
  return "application/octet-stream"
}

async function putPrivatePlanDocument(
  pathname: string,
  body: Buffer,
  contentType: string,
): Promise<{ url: string; pathname: string }> {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  return put(pathname, body, {
    access: "private",
    addRandomSuffix: true,
    contentType,
    ...(token ? { token } : {}),
  })
}

export async function storePlanVersionDocuments(
  input: StorePlanVersionDocumentsInput,
): Promise<StorePlanVersionDocumentsResult> {
  const db = getDb()
  const [row] = await db
    .select({
      id: schema.mediaPlanVersions.id,
      versionNumber: schema.mediaPlanVersions.versionNumber,
      mbaNumber: schema.mediaPlanMasters.mbaNumber,
    })
    .from(schema.mediaPlanVersions)
    .innerJoin(
      schema.mediaPlanMasters,
      eq(schema.mediaPlanVersions.masterId, schema.mediaPlanMasters.id),
    )
    .where(eq(schema.mediaPlanVersions.id, input.versionId))
    .limit(1)

  if (!row) return { status: "not_found" }

  const kinds = (["mba_pdf", "media_plan", "aa_media_plan"] as const).filter(
    (kind) => input.files[kind],
  )
  const files: {
    mba_pdf?: PlanDocumentBlobJson
    media_plan?: PlanDocumentBlobJson
    aa_media_plan?: PlanDocumentBlobJson
  } = {}
  const patch: Partial<{
    mbaPdfFile: PlanDocumentBlobJson
    mediaPlanFile: PlanDocumentBlobJson
    aaMediaPlanFile: PlanDocumentBlobJson
  }> = {}

  const uploadedAt = new Date().toISOString()

  for (const kind of kinds) {
    const file = input.files[kind]!
    const name =
      typeof file.name === "string" && file.name.trim() ? file.name.trim() : "file"
    const mime = mimeForFile(file, name)
    const bytes = Buffer.from(await file.arrayBuffer())
    const size =
      typeof file.size === "number" && Number.isFinite(file.size) && file.size >= 0
        ? file.size
        : bytes.byteLength
    const pathname = planDocumentBlobPathname(
      row.mbaNumber,
      row.versionNumber,
      kind,
      name,
    )
    const blob = await putPrivatePlanDocument(pathname, bytes, mime)
    const json = planDocumentBlobJson({
      url: blob.url,
      pathname: blob.pathname,
      name,
      size,
      mime,
      uploadedAt,
    })
    files[kind] = json
    patch[KIND_COLUMN[kind]] = json
  }

  if (Object.keys(patch).length > 0) {
    await db
      .update(schema.mediaPlanVersions)
      .set(patch)
      .where(eq(schema.mediaPlanVersions.id, row.id))
  }

  return { status: "ok", files }
}
