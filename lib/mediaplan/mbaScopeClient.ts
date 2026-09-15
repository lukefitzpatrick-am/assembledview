/**
 * Editor-side MBA scope: save-body assembly, picker labels, publish-rail copy.
 * Canonical `line_item_id`s follow C-103 (`toBillingOverrideLineItemId`).
 */
import { toBillingOverrideLineItemId } from "@/lib/finance/manualBillingOverridesUi"
import { flattenPartialMbaSelectedLineIds } from "@/lib/mediaplan/mergeDraftDocumentsBody"
import type { MbaScopeBody, PersistedMbaScope } from "@/lib/mediaplan/mbaScopeForSave"

export function buildMbaScopeForSaveBody(args: {
  isPartialMBA: boolean
  partialMBASelectedLineItemIds: Record<string, string[] | undefined>
  partialMBAMonthYears: readonly string[]
}): MbaScopeBody {
  if (!args.isPartialMBA) {
    return { lineItemIds: null, monthYears: null }
  }
  const seen = new Set<string>()
  const lineItemIds: string[] = []
  for (const id of flattenPartialMbaSelectedLineIds(
    args.partialMBASelectedLineItemIds
  )) {
    const canon = toBillingOverrideLineItemId(id)
    if (!canon || seen.has(canon)) continue
    seen.add(canon)
    lineItemIds.push(canon)
  }
  const monthYears = args.partialMBAMonthYears
    .map((m) => String(m).trim())
    .filter(Boolean)
  return {
    lineItemIds,
    monthYears: monthYears.length > 0 ? monthYears : null,
  }
}

export function parsePersistedMbaScope(raw: unknown): PersistedMbaScope | null {
  if (raw == null || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const lineItemIds = Array.isArray(o.lineItemIds)
    ? o.lineItemIds.map((id) => String(id).trim()).filter(Boolean)
    : o.lineItemIds === null
      ? null
      : null
  const monthYears = Array.isArray(o.monthYears)
    ? o.monthYears.map((m) => String(m).trim()).filter(Boolean)
    : o.monthYears === null
      ? null
      : null
  return {
    lineItemIds,
    monthYears,
    partial: o.partial === true,
  }
}

export function selectedLineItemIdsByMediaFromMbaScope(args: {
  lineItemIds: string[] | null
  allLineIdsByMedia: Record<string, string[]>
}): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  if (args.lineItemIds == null) {
    for (const [media, ids] of Object.entries(args.allLineIdsByMedia)) {
      out[media] = Array.from(
        new Set(ids.map((id) => toBillingOverrideLineItemId(id)).filter(Boolean))
      )
    }
    return out
  }
  const allowed = new Set(
    args.lineItemIds.map((id) => toBillingOverrideLineItemId(id)).filter(Boolean)
  )
  for (const [media, ids] of Object.entries(args.allLineIdsByMedia)) {
    out[media] = Array.from(
      new Set(
        ids
          .map((id) => toBillingOverrideLineItemId(id))
          .filter((id) => id && allowed.has(id))
      )
    )
  }
  return out
}

function monthYearSortKey(label: string): number {
  const t = Date.parse(`1 ${label}`)
  return Number.isFinite(t) ? t : 0
}

export function formatMbaScopeMonthRange(
  monthYears: readonly string[] | null | undefined
): string | null {
  const months = (monthYears ?? [])
    .map((m) => String(m).trim())
    .filter(Boolean)
    .toSorted((a, b) => monthYearSortKey(a) - monthYearSortKey(b))
  if (months.length === 0) return null
  if (months.length === 1) return `months ${months[0]}`
  return `months ${months[0]} to ${months[months.length - 1]}`
}

/**
 * Version-picker row: "Full" or "Partial - {in} of {total} lines{, months X to Y}"
 * plus a Published mark from `published_at`.
 */
export function formatMbaScopeVersionPickerLabel(args: {
  versionNumber: number
  scope: PersistedMbaScope | null
  publishedAt?: string | null
  countableLineCount: number
}): string {
  const n = args.versionNumber
  const published = args.publishedAt != null ? " · Published" : ""
  if (!args.scope || args.scope.partial !== true) {
    return `v${n} · Full${published}`
  }
  const total = args.countableLineCount
  const included =
    args.scope.lineItemIds == null ? total : args.scope.lineItemIds.length
  const lines =
    total > 0
      ? `Partial - ${included} of ${total} lines`
      : `Partial - ${included} lines`
  const months = formatMbaScopeMonthRange(args.scope.monthYears)
  const monthBit = months ? `, ${months}` : ""
  return `v${n} · ${lines}${monthBit}${published}`
}

export function countablePartialMbaLineCount(
  perLine: ReadonlyArray<{ lineItemId: string; mediaType: string }>
): number {
  return perLine.filter((l) => {
    const id = String(l.lineItemId).trim()
    if (!id || id.startsWith("__service__")) return false
    return l.mediaType !== "production"
  }).length
}
