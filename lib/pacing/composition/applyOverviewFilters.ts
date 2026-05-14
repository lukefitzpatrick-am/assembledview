import { endOfMonth, format, startOfMonth } from "date-fns"
import type { LineItemPacingRow } from "@/lib/xano/pacing-types"

/** Matches overview UI default when query omits dates (`usePacingFilterStore` month window). */
export function resolveLineItemSnowflakeDateRange(
  dateFromParam: string | null,
  dateToParam: string | null
): { dateFrom: string; dateTo: string } {
  const now = new Date()
  return {
    dateFrom: dateFromParam?.trim() || format(startOfMonth(now), "yyyy-MM-dd"),
    dateTo: dateToParam?.trim() || format(endOfMonth(now), "yyyy-MM-dd"),
  }
}

export type OverviewLineItemQueryFilters = {
  mediaTypeParam: string | null
  statusParam: string | null
  search: string | null
  mediaPlanId: number | null
}

/**
 * Post-filters composed line-item rows (replaces SQL WHERE on `V_LINE_ITEM_PACING`).
 */
export function applyOverviewFilters(
  rows: LineItemPacingRow[],
  opts: OverviewLineItemQueryFilters
): LineItemPacingRow[] {
  let out = [...rows]

  const mp = opts.mediaPlanId
  const canFilterMediaPlan = out.some((r) => r.media_plan_id != null)
  if (mp != null && Number.isFinite(mp) && canFilterMediaPlan) {
    out = out.filter((r) => r.media_plan_id === mp)
  }

  const mediaList =
    opts.mediaTypeParam
      ?.split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean) ?? []
  if (mediaList.length === 1) {
    const m = mediaList[0]!
    out = out.filter((r) => String(r.media_type ?? "").trim().toLowerCase() === m)
  } else if (mediaList.length > 1) {
    const set = new Set(mediaList)
    out = out.filter((r) => set.has(String(r.media_type ?? "").trim().toLowerCase()))
  }

  const statusList =
    opts.statusParam
      ?.split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean) ?? []
  if (statusList.length === 1) {
    const s = statusList[0]!
    out = out.filter((r) => normalizeStatusKey(r.pacing_status) === s)
  } else if (statusList.length > 1) {
    const set = new Set(statusList)
    out = out.filter((r) => set.has(normalizeStatusKey(r.pacing_status)))
  }

  const q = opts.search?.trim().toLowerCase()
  if (q) {
    out = out.filter((r) => {
      const id = String(r.av_line_item_id ?? "").toLowerCase()
      const label = String(r.av_line_item_label ?? "").toLowerCase()
      const camp = String(r.campaign_name ?? "").toLowerCase()
      const mba = String(r.mba_number ?? "").toLowerCase()
      return id.includes(q) || label.includes(q) || camp.includes(q) || mba.includes(q)
    })
  }

  return out
}

function normalizeStatusKey(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
}
