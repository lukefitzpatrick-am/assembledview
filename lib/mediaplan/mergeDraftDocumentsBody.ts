/**
 * Client extras for POST /api/mediaplans/draft-documents.
 * Does not change plansSaveBodySchema — optional keys on the draft route only.
 */
import type { PlansSaveRequestBody } from "@/lib/mediaplan/buildPostgresSavePayload"

export type DraftDocumentKind = "mba_pdf" | "media_plan" | "aa_media_plan"

export function flattenPartialMbaSelectedLineIds(
  byMedia: Record<string, string[] | undefined>
): string[] {
  const ids: string[] = []
  for (const list of Object.values(byMedia)) {
    if (!Array.isArray(list)) continue
    for (const id of list) {
      const s = String(id).trim()
      if (s) ids.push(s)
    }
  }
  return ids
}

export function kpiRowsForDraftDocuments(
  rows: Array<{
    media_type?: string
    publisher?: string
    lineItemLabel?: string
    buyType?: string
    spend?: number
    deliverables?: number
    ctr?: number | null
    vtr?: number | null
    cpv?: number | null
    conversion_rate?: number | null
    frequency?: number | null
    calculatedClicks?: number | null
    calculatedViews?: number | null
    calculatedReach?: number | null
  }>
): Record<string, unknown>[] {
  return rows.map((r) => ({
    mediaType: r.media_type ?? "",
    publisher: r.publisher ?? "",
    label: r.lineItemLabel ?? "",
    buyType: r.buyType ?? "",
    spend: r.spend ?? 0,
    deliverables: r.deliverables ?? 0,
    ctr: r.ctr ?? null,
    vtr: r.vtr ?? null,
    cpv: r.cpv ?? null,
    conversion_rate: r.conversion_rate ?? null,
    frequency: r.frequency ?? null,
    calculatedClicks: r.calculatedClicks ?? null,
    calculatedViews: r.calculatedViews ?? null,
    calculatedReach: r.calculatedReach ?? null,
  }))
}

export function mergeDraftDocumentsBody(
  saveBody: PlansSaveRequestBody,
  extras: {
    kind: DraftDocumentKind
    omitMasterId?: boolean
    campaignStatus?: string | null
    clientAddress?: {
      name?: string
      streetaddress?: string
      suburb?: string
      state?: string
      postcode?: string
    }
    selectedMonthYears?: string[]
    approvedLineItemIds?: string[]
    kpiRows?: Record<string, unknown>[]
    publishers?: unknown[]
  }
): Record<string, unknown> {
  const { masterId, ...rest } = saveBody
  const months = extras.selectedMonthYears?.filter(Boolean) ?? []
  const approved = extras.approvedLineItemIds?.filter(Boolean) ?? []
  return {
    ...rest,
    ...(extras.omitMasterId ? { masterId: null } : { masterId }),
    kind: extras.kind,
    campaignStatus: extras.campaignStatus ?? null,
    ...(extras.clientAddress ? { clientAddress: extras.clientAddress } : {}),
    ...(months.length > 0 || approved.length > 0
      ? {
          partialMba: {
            ...(months.length > 0 ? { selectedMonthYears: months } : {}),
            ...(approved.length > 0 ? { approvedLineItemIds: approved } : {}),
          },
          ...(months.length > 0 ? { selectedMonthYears: months } : {}),
        }
      : {}),
    ...(extras.kpiRows && extras.kpiRows.length > 0
      ? { kpiRows: extras.kpiRows }
      : {}),
    ...(extras.publishers ? { publishers: extras.publishers } : {}),
  }
}
