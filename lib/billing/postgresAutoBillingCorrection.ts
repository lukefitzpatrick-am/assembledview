/**
 * O4 — Postgres save may correct AUTO-line drift server-side without blocking.
 * Manual lines stay gated (C2 sum rules); Xano still uses recomputeAndValidate reject path.
 */
import type { BillingMonth } from "@/lib/billing/types"
import {
  compareBillingDivergence,
  type BillingDivergenceResult,
  type LineDivergence,
} from "@/lib/billing/compareBillingDivergence"
import { listManualOverrideLineIds } from "@/lib/finance/manualBillingOverridesUi"
import { formatAUD, roundMoney2 } from "@/lib/format/money"

export type AutoBillingCorrectionLine = {
  lineItemId: string
  header?: string
  field: "media" | "fee" | "month" | "missing"
  clientTotal: number
  serverTotal: number
  delta: number
}

export type AutoBillingCorrectionSummary = {
  correctedLineCount: number
  totalDeltaExGst: number
  lines: AutoBillingCorrectionLine[]
  /** Human toast body — never empty when correctedLineCount > 0. */
  toastDescription: string
}

/** True when any line is explicitly stamped media/fee billingMode=manual. */
export function hasExplicitManualBillingLines(months: BillingMonth[]): boolean {
  const ids = listManualOverrideLineIds(months)
  return ids.media.length > 0 || ids.fee.length > 0
}

/**
 * Divergence is "auto-only" when no explicit manual lines exist on the working
 * schedule. Missing billingMode = auto (INVARIANTS) — those must not force a
 * human "reset to auto" on the postgres path.
 */
export function isAutoOnlyBillingDivergence(
  working: BillingMonth[],
  divergence: BillingDivergenceResult
): boolean {
  if (!divergence.isDivergent) return false
  if (hasExplicitManualBillingLines(working)) return false
  return true
}

function lineLabel(d: LineDivergence): string {
  const h1 = String(d.header1 ?? "").trim()
  const h2 = String(d.header2 ?? "").trim()
  if (h1 || h2) return [h1, h2].filter(Boolean).join(" / ")
  return d.lineItemId
}

/**
 * Build a post-save toast summary from a pre-save compare (working vs auto/server).
 */
export function summarizeAutoBillingCorrection(
  divergence: BillingDivergenceResult
): AutoBillingCorrectionSummary | null {
  if (!divergence.isDivergent) return null

  const lines: AutoBillingCorrectionLine[] = []
  for (const d of divergence.divergentLines) {
    const field: AutoBillingCorrectionLine["field"] =
      d.kind === "adserving_total"
        ? "fee"
        : d.kind === "line_total"
          ? "media"
          : "missing"
    lines.push({
      lineItemId: d.lineItemId,
      header: lineLabel(d),
      field,
      clientTotal: d.savedTotal,
      serverTotal: d.computedTotal,
      delta: roundMoney2(d.difference),
    })
  }
  for (const m of divergence.divergentMonths) {
    lines.push({
      lineItemId: `${m.monthYear}:${m.field}`,
      header: `${m.monthYear} ${m.field}`,
      field: "month",
      clientTotal: m.savedValue,
      serverTotal: m.computedValue,
      delta: roundMoney2(m.difference),
    })
  }

  if (lines.length === 0) return null

  const totalDeltaExGst = roundMoney2(
    lines.reduce((s, l) => s + Math.abs(l.delta), 0)
  )
  const sample = lines
    .slice(0, 4)
    .map((l) => l.header || l.lineItemId)
    .join(", ")
  const more = lines.length > 4 ? ` (+${lines.length - 4} more)` : ""

  return {
    correctedLineCount: lines.length,
    totalDeltaExGst,
    lines,
    toastDescription: `Server corrected ${lines.length} line${lines.length === 1 ? "" : "s"}: ${sample}${more}, Δ ${formatAUD(totalDeltaExGst)}`,
  }
}

/**
 * Convenience: compare working vs auto reference and classify for postgres save.
 */
export function evaluatePostgresAutoDivergence(args: {
  working: BillingMonth[]
  autoReference: BillingMonth[]
  attachComputedLineItems?: (
    months: BillingMonth[],
    mode: "billing" | "delivery"
  ) => BillingMonth[]
}): {
  divergence: BillingDivergenceResult
  autoOnly: boolean
  correction: AutoBillingCorrectionSummary | null
} {
  const divergence = compareBillingDivergence(args.working, args.autoReference, {
    attachComputedLineItems: args.attachComputedLineItems,
  })
  const autoOnly = isAutoOnlyBillingDivergence(args.working, divergence)
  return {
    divergence,
    autoOnly,
    correction: autoOnly ? summarizeAutoBillingCorrection(divergence) : null,
  }
}
