import { deliveredSpendFromSnapshot } from "@/lib/delivery/deliveredSpendFromSnapshot"
import { formatAUD } from "@/lib/format/money"
import type { PerformanceReportPayload } from "@/lib/reports/buildPerformanceReport"

/** Free-text dollar / AUD amounts the model must not invent in narrative fields. */
export const FREE_TEXT_MONEY_RE =
  /\$\s*\d[\d,]*(?:\.\d+)?(?:\s*[kKmMbB])?|\bAUD\s*\$?\s*\d[\d,]*(?:\.\d+)?/g

export type DeliverySnapshotTotals = {
  spendToDate: number
  impressions: number
  clicks: number
  results: number
  video3sViews: number
  plannedBudget: number | null
  cpm: number | null
  ctr: number | null
  cpc: number | null
}

export type HardNumberFigures = {
  deliverySpend: string
  deliveryDeliverables: string
  kpis: PerformanceReportPayload["kpis"]
  /** Canonical numeric values used for verification / logging */
  reconciled: {
    deliveredSpend: number
    plannedToDate: number | null
    pacePct: number | null
    impressions: number
    clicks: number
    results: number
    video3sViews: number
  }
}

function clip(text: string, cap: number): string {
  const t = text.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim()
  if (t.length <= cap) return t
  return `${t.slice(0, Math.max(0, cap - 1)).trimEnd()}…`
}

function formatCount(n: number): string {
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 }).format(Math.round(n))
}

function formatPct(n: number): string {
  return `${n.toFixed(1)}%`
}

function formatCtr(ctr: number | null): string | null {
  if (ctr == null || !Number.isFinite(ctr)) return null
  return `${(ctr * 100).toFixed(2)}%`
}

/**
 * Build slide hard-number lines from reconciled Snowflake delivery totals
 * (same source as get_delivery_snapshot / loadDeliverySnapshot) plus page
 * planned-to-date when known. Zero/missing snapshot spend → "Not available"
 * (matches dashboard Delivered spend to date).
 */
export function buildPerformanceReportHardNumbers(args: {
  totals: DeliverySnapshotTotals
  plannedToDate?: number | null
}): HardNumberFigures {
  const { totals } = args
  const delivered = deliveredSpendFromSnapshot(totals.spendToDate)
  const plannedToDate =
    typeof args.plannedToDate === "number" && Number.isFinite(args.plannedToDate)
      ? args.plannedToDate
      : null

  let pacePct: number | null = null
  if (delivered != null && plannedToDate != null && plannedToDate > 0) {
    pacePct = (delivered / plannedToDate) * 100
  }

  let spendLine: string
  if (delivered == null) {
    spendLine =
      plannedToDate != null
        ? `Delivered spend to date Not available (planned to date ${formatAUD(plannedToDate)}).`
        : "Delivered spend to date Not available."
  } else if (plannedToDate != null) {
    spendLine = `Delivered ${formatAUD(delivered)} vs ${formatAUD(plannedToDate)} planned to date${
      pacePct != null ? ` (${formatPct(pacePct)} pace)` : ""
    }.`
  } else {
    spendLine = `Delivered spend to date ${formatAUD(delivered)} (planned-to-date unavailable).`
  }

  const deliverablesParts: string[] = []
  deliverablesParts.push(`${formatCount(totals.impressions)} impressions`)
  deliverablesParts.push(`${formatCount(totals.clicks)} clicks`)
  if (totals.video3sViews > 0) {
    deliverablesParts.push(`${formatCount(totals.video3sViews)} 3s video views`)
  }
  if (totals.results > 0) {
    deliverablesParts.push(`${formatCount(totals.results)} results`)
  }
  const deliverablesLine = `Deliverables to date: ${deliverablesParts.join("; ")}.`

  const kpis: PerformanceReportPayload["kpis"] = [
    totals.cpm != null && Number.isFinite(totals.cpm)
      ? clip(`CPM ${formatAUD(totals.cpm)}`, 90)
      : "CPM unavailable",
    formatCtr(totals.ctr)
      ? clip(`CTR ${formatCtr(totals.ctr)}`, 90)
      : "CTR unavailable",
    totals.cpc != null && Number.isFinite(totals.cpc)
      ? clip(`CPC ${formatAUD(totals.cpc)}`, 90)
      : "CPC unavailable",
    clip(
      pacePct != null
        ? `Spend pace ${formatPct(pacePct)} vs planned to date`
        : delivered != null
          ? `Delivered spend ${formatAUD(delivered)}`
          : "Delivered spend Not available",
      90,
    ),
  ]

  return {
    deliverySpend: clip(spendLine, 140),
    deliveryDeliverables: clip(deliverablesLine, 140),
    kpis,
    reconciled: {
      deliveredSpend: delivered ?? 0,
      plannedToDate,
      pacePct,
      impressions: totals.impressions,
      clicks: totals.clicks,
      results: totals.results,
      video3sViews: totals.video3sViews,
    },
  }
}

export type NarrativeMoneyScan = {
  field: string
  match: string
}

/**
 * Refuse narrative that contains free-text $ / AUD figures.
 * Hard numbers are injected server-side; the model must not invent money amounts.
 */
export function findInventedMoneyInNarrative(
  fields: Record<string, string | string[] | { when: string; what: string }[]>,
): NarrativeMoneyScan | null {
  for (const [field, value] of Object.entries(fields)) {
    const chunks: string[] = []
    if (typeof value === "string") {
      chunks.push(value)
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") chunks.push(item)
        else if (item && typeof item === "object") {
          chunks.push(String((item as { when?: string }).when ?? ""))
          chunks.push(String((item as { what?: string }).what ?? ""))
        }
      }
    }
    for (const chunk of chunks) {
      FREE_TEXT_MONEY_RE.lastIndex = 0
      const match = FREE_TEXT_MONEY_RE.exec(chunk)
      if (match) {
        return { field, match: match[0] }
      }
    }
  }
  return null
}

export function plannedToDateFromPageContext(pageContext: unknown): number | null {
  if (!pageContext || typeof pageContext !== "object") return null
  const state = (pageContext as { state?: unknown }).state
  if (!state || typeof state !== "object") return null
  const spend = (state as { spend?: unknown }).spend
  if (!spend || typeof spend !== "object") return null
  const planned = (spend as { plannedToDate?: unknown }).plannedToDate
  return typeof planned === "number" && Number.isFinite(planned) ? planned : null
}
