/**
 * Render published plan documents from persisted rows into buffers.
 * No Blob upload, no Postgres write. Callers persist or write to disk.
 *
 * `isVersionPublished` is enforced by buildMbaFromPersisted /
 * buildMediaItemsFromPersisted. Historic published versions (not the master's
 * current published_version_id) are valid render targets.
 */

import { generateMBA } from "@/lib/generateMBA"
import { generateMediaPlan } from "@/lib/generateMediaPlan"
import {
  buildMbaFromPersisted,
  PersistedDocError,
} from "@/lib/docs/buildMbaFromPersisted"
import { buildMediaItemsFromPersisted } from "@/lib/docs/buildMediaItemsFromPersisted"
import {
  buildMbaDataFromExplodeAdapter,
  explodeMbaFilename,
} from "@/lib/docs/mbaDataFromExplode"
import type { PlanDocumentGeneratedFrom } from "@/lib/docs/planDocumentBlob"
import {
  advertisingAssociatesFilteredPlanHasLineItems,
  filterMediaItemsForAdvertisingAssociates,
  planHasAdvertisingAssociatesLineItem,
  shouldIncludeMediaPlanLineItem,
  buildAdvertisingAssociatesMbaDataFromMediaItems,
} from "@/lib/mediaplan/advertisingAssociatesExcel"
import {
  parseRegenerateKinds,
  type PlanDocumentKind,
} from "@/lib/docs/planVersionFiles"

export type RenderKindStatus = "written" | "not_applicable" | "error"

export type RenderKindResult = {
  kind: PlanDocumentKind
  status: RenderKindStatus
  error?: string
}

export type RenderedPlanDocumentFile = {
  kind: PlanDocumentKind
  filename: string
  mime: string
  buffer: Buffer
}

export type RenderPlanVersionDocumentsResult =
  | { status: "not_published"; code: "NOT_PUBLISHED" }
  | {
      status: "ok"
      results: RenderKindResult[]
      files: Partial<Record<PlanDocumentKind, RenderedPlanDocumentFile>>
      generatedFrom: Partial<Record<PlanDocumentKind, PlanDocumentGeneratedFrom>>
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

async function toBuffer(body: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body
  if (body instanceof ArrayBuffer) return Buffer.from(body)
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength)
  }
  if (body && typeof body === "object" && "arrayBuffer" in body) {
    const buf = await (body as Blob).arrayBuffer()
    return Buffer.from(buf)
  }
  throw new Error(`Cannot convert ${typeof body} to Buffer`)
}

export async function renderPlanVersionDocuments(input: {
  mbaNumber: string
  versionNumber: number
  kinds?: unknown
  now?: Date
}): Promise<RenderPlanVersionDocumentsResult> {
  const kinds = parseRegenerateKinds(input.kinds)
  const results: RenderKindResult[] = []
  const files: Partial<Record<PlanDocumentKind, RenderedPlanDocumentFile>> = {}
  const generatedFrom: Partial<
    Record<PlanDocumentKind, PlanDocumentGeneratedFrom>
  > = {}
  const now = input.now ?? new Date()

  let adapter: Awaited<ReturnType<typeof buildMediaItemsFromPersisted>> | null =
    null
  const loadAdapter = async () => {
    if (!adapter) {
      adapter = await buildMediaItemsFromPersisted({
        mbaNumber: input.mbaNumber,
        versionNumber: input.versionNumber,
      })
    }
    return adapter
  }

  for (const kind of kinds) {
    try {
      if (kind === "mba_pdf") {
        try {
          const rendered = await buildMbaFromPersisted({
            mbaNumber: input.mbaNumber,
            versionNumber: input.versionNumber,
            now,
          })
          const pdf = await generateMBA(rendered.mbaData)
          files.mba_pdf = {
            kind,
            filename: rendered.filename,
            mime: "application/pdf",
            buffer: await toBuffer(pdf),
          }
          generatedFrom.mba_pdf = "persisted"
          results.push({ kind, status: "written" })
          continue
        } catch (err) {
          if (
            !(err instanceof PersistedDocError) ||
            err.code !== "NO_FEE_BASIS"
          ) {
            throw err
          }
          const built = await loadAdapter()
          const mbaData = buildMbaDataFromExplodeAdapter({
            header: built.header,
            mbaData: built.mbaData,
            now,
          })
          const pdf = await generateMBA(mbaData)
          files.mba_pdf = {
            kind,
            filename: explodeMbaFilename(built.header),
            mime: "application/pdf",
            buffer: await toBuffer(pdf),
          }
          generatedFrom.mba_pdf = "explode"
          results.push({ kind, status: "written" })
          continue
        }
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
          input.versionNumber,
          false,
        )
        const buffer = Buffer.from(
          (await workbook.xlsx.writeBuffer()) as ArrayBuffer,
        )
        files.media_plan = {
          kind,
          filename,
          mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          buffer,
        }
        results.push({ kind, status: "written" })
        generatedFrom.media_plan = "persisted"
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
        input.versionNumber,
        true,
      )
      const buffer = Buffer.from(
        (await workbook.xlsx.writeBuffer()) as ArrayBuffer,
      )
      files.aa_media_plan = {
        kind,
        filename,
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer,
      }
      generatedFrom.aa_media_plan = "persisted"
      results.push({ kind, status: "written" })
    } catch (err) {
      if (err instanceof PersistedDocError && err.code === "NOT_APPROVED") {
        return { status: "not_published", code: "NOT_PUBLISHED" }
      }
      const message =
        err instanceof PersistedDocError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err)
      results.push({ kind, status: "error", error: message })
    }
  }

  return { status: "ok", results, files, generatedFrom }
}
