/**
 * MBA PDF scope line — partial coverage of lines / media types / months.
 * Derived from the same filters as the money tables. Not part of the checksum.
 */

import { isoMonthToScheduleMonthYear } from "@/lib/finance/computeCampaignFinancials"
import { toBillingOverrideLineItemId } from "@/lib/finance/manualBillingOverridesUi"
import {
  mediaTypeFromScheduleLineId,
  type ScheduleMonthRowInput,
} from "@/lib/finance/scheduleMonthsSource"
import { MEDIA_TYPE_LABELS } from "@/lib/media/mediaTypes"

import { renderMonthKey, rowInApprovedSlice, type MbaRenderFilters } from "./mbaRenderFilters"

export type MbaDocumentScope = {
  partial: boolean
  includedMediaTypes: string[]
  excludedMediaTypes: string[]
  includedMonths: string[]
  excludedMonths: string[]
  includedLineCount: number
  totalLineCount: number
}

function isCountableLine(lineItemId: string): boolean {
  if (!lineItemId || lineItemId.startsWith("__service__")) return false
  return mediaTypeFromScheduleLineId(lineItemId) !== "production"
}

function planOrderLabels(labels: Iterable<string>): string[] {
  const wanted = new Set(
    [...labels].map((l) => String(l ?? "").trim()).filter(Boolean)
  )
  const ordered: string[] = []
  for (const label of Object.values(MEDIA_TYPE_LABELS)) {
    if (wanted.has(label)) {
      ordered.push(label)
      wanted.delete(label)
    }
  }
  for (const leftover of wanted) ordered.push(leftover)
  return ordered
}

function uniqueLineIds(
  rows: ScheduleMonthRowInput[],
  pred?: (r: ScheduleMonthRowInput) => boolean
): Set<string> {
  const ids = new Set<string>()
  for (const r of rows) {
    if (!isCountableLine(r.lineItemId)) continue
    if (pred && !pred(r)) continue
    const canon = toBillingOverrideLineItemId(r.lineItemId)
    if (canon) ids.add(canon)
  }
  return ids
}

function monthLabelsFromRows(rows: ScheduleMonthRowInput[]): string[] {
  const keys = new Set<string>()
  for (const r of rows) {
    if (r.basis !== "billing") continue
    if (!isCountableLine(r.lineItemId)) continue
    const mk = renderMonthKey(r.month)
    if (mk) keys.add(mk)
  }
  return [...keys].sort().map((mk) => isoMonthToScheduleMonthYear(mk))
}

function mediaLabelsFromRows(rows: ScheduleMonthRowInput[]): string[] {
  const labels = new Set<string>()
  for (const r of rows) {
    if (!isCountableLine(r.lineItemId)) continue
    const key = mediaTypeFromScheduleLineId(r.lineItemId) ?? "search"
    labels.add(MEDIA_TYPE_LABELS[key] ?? key)
  }
  return planOrderLabels(labels)
}

function rowPassesFilters(
  r: ScheduleMonthRowInput,
  filters: Pick<MbaRenderFilters, "approvedIds" | "approvedMonths" | "restrictLineIds">
): boolean {
  return rowInApprovedSlice(
    r,
    filters.approvedIds,
    filters.approvedMonths,
    filters.restrictLineIds
  )
}

export function deriveMbaScope(args: {
  scheduleRows: ScheduleMonthRowInput[]
  filters: Pick<MbaRenderFilters, "approvedIds" | "approvedMonths" | "restrictLineIds">
  grossMedia: readonly { media_type: string }[]
  includedMonths: readonly string[]
}): MbaDocumentScope {
  const totalIds = uniqueLineIds(args.scheduleRows)
  const includedIds = uniqueLineIds(args.scheduleRows, (r) =>
    rowPassesFilters(r, args.filters)
  )
  const includedMediaTypes = planOrderLabels(
    args.grossMedia.map((g) => g.media_type)
  )
  const excludedMediaTypes = mediaLabelsFromRows(args.scheduleRows).filter(
    (label) => !includedMediaTypes.includes(label)
  )
  const includedMonths = [...args.includedMonths]
  const includedMonthSet = new Set(includedMonths)
  const excludedMonths = monthLabelsFromRows(args.scheduleRows).filter(
    (label) => !includedMonthSet.has(label)
  )
  const includedLineCount = includedIds.size
  const totalLineCount = totalIds.size
  const partial =
    includedLineCount < totalLineCount || excludedMonths.length > 0
  return {
    partial,
    includedMediaTypes,
    excludedMediaTypes,
    includedMonths,
    excludedMonths,
    includedLineCount,
    totalLineCount,
  }
}

function subsetPhrase(
  included: readonly string[],
  excluded: readonly string[],
  allLabel: string
): string {
  if (excluded.length === 0) return allLabel
  if (included.length > 0 && included.length < excluded.length) {
    return `${included.join(", ")} only`
  }
  return `excludes ${excluded.join(", ")}`
}

/** Header line, or null when the MBA is full (draw nothing). */
export function formatMbaScopeLine(
  scope: MbaDocumentScope | null | undefined
): string | null {
  if (!scope?.partial) return null
  const media = subsetPhrase(
    scope.includedMediaTypes,
    scope.excludedMediaTypes,
    "all media"
  )
  const months = subsetPhrase(
    scope.includedMonths,
    scope.excludedMonths,
    "all months"
  )
  return `Scope: Partial MBA — ${media} · ${months} (${scope.includedLineCount} of ${scope.totalLineCount} lines)`
}

export function mbaDocumentFilename(args: {
  clientName: string
  campaignName: string
  versionNumber: number | string
  partial: boolean
}): string {
  const safeClient = (args.clientName || "client").replace(/[^\w\-]+/g, "_")
  const safeCampaign = (args.campaignName || "campaign").replace(/[^\w\-]+/g, "_")
  const base = `MBA_${safeClient}_${safeCampaign}_v${args.versionNumber}`
  return args.partial ? `${base}_partial.pdf` : `${base}.pdf`
}
