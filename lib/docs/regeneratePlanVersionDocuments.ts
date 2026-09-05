/**
 * Rebuild published plan documents from persisted version rows.
 * Writes Blob + jsonb only. Never mutates approved_slice, published_at,
 * schedule_months, or line items.
 */

import { eq } from "drizzle-orm"

import { getDb, schema } from "@/db"
import { generateMBA } from "@/lib/generateMBA"
import { generateMediaPlan } from "@/lib/generateMediaPlan"
import {
  buildMbaFromPersisted,
  PersistedDocError,
} from "@/lib/docs/buildMbaFromPersisted"
import { buildMediaItemsFromPersisted } from "@/lib/docs/buildMediaItemsFromPersisted"
import {
  storePlanVersionDocuments,
  type PlanDocumentFileLike,
} from "@/lib/docs/storePlanVersionDocuments"
import {
  advertisingAssociatesFilteredPlanHasLineItems,
  filterMediaItemsForAdvertisingAssociates,
  planHasAdvertisingAssociatesLineItem,
  shouldIncludeMediaPlanLineItem,
  buildAdvertisingAssociatesMbaDataFromMediaItems,
} from "@/lib/mediaplan/advertisingAssociatesExcel"
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

function mediaPlanFilename(
  client: string,
  campaignName: string,
  versionNumber: number,
  aa: boolean,
): string {
  const base = `${client || "client"}-MediaPlan_${campaignName || "campaign"}-v${versionNumber}.xlsx`
  return aa ? `AA - ${base}` : base
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

  let adapter: Awaited<ReturnType<typeof buildMediaItemsFromPersisted>> | null = null
  const loadAdapter = async () => {
    if (!adapter) {
      adapter = await buildMediaItemsFromPersisted({
        mbaNumber: row.mbaNumber,
        versionNumber: row.versionNumber,
      })
    }
    return adapter
  }

  for (const kind of kinds) {
    if (!force && columnHasFile(existing[kind])) {
      results.push({ kind, status: "skipped" })
      continue
    }
    try {
      if (kind === "mba_pdf") {
        const rendered = await buildMbaFromPersisted({
          mbaNumber: row.mbaNumber,
          versionNumber: row.versionNumber,
          now: publishedAtDate,
        })
        const pdf = await generateMBA(rendered.mbaData)
        files.mba_pdf = namedFile(pdf, rendered.filename, "application/pdf")
        results.push({ kind, status: "written" })
        continue
      }

      const built = await loadAdapter()
      if (kind === "media_plan") {
        const workbook = await generateMediaPlan(
          built.header,
          built.mediaItems,
          built.mbaData,
        )
        const filename = mediaPlanFilename(
          built.header.client,
          built.header.campaignName,
          row.versionNumber,
          false,
        )
        const buffer = Buffer.from(
          (await workbook.xlsx.writeBuffer()) as ArrayBuffer,
        )
        files.media_plan = namedFile(
          buffer,
          filename,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        results.push({ kind, status: "written" })
        continue
      }

      if (
        !planHasAdvertisingAssociatesLineItem(
          built.mediaItems,
          built.publishers,
          shouldIncludeMediaPlanLineItem,
        )
      ) {
        results.push({ kind: "aa_media_plan", status: "not_applicable" })
        continue
      }
      const aaFiltered = filterMediaItemsForAdvertisingAssociates(
        built.mediaItems,
        built.publishers,
      )
      if (!advertisingAssociatesFilteredPlanHasLineItems(aaFiltered)) {
        results.push({ kind: "aa_media_plan", status: "not_applicable" })
        continue
      }
      const aaMba = buildAdvertisingAssociatesMbaDataFromMediaItems(aaFiltered)
      const workbook = await generateMediaPlan(built.header, aaFiltered, aaMba, {
        mbaTotalsLayout: "aa",
      })
      const filename = mediaPlanFilename(
        built.header.client,
        built.header.campaignName,
        row.versionNumber,
        true,
      )
      const buffer = Buffer.from(
        (await workbook.xlsx.writeBuffer()) as ArrayBuffer,
      )
      files.aa_media_plan = namedFile(
        buffer,
        filename,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      )
      results.push({ kind, status: "written" })
    } catch (err) {
      const message =
        err instanceof PersistedDocError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err)
      results.push({ kind, status: "error", error: message })
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
      generatedFrom: "persisted",
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
