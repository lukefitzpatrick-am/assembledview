import type { BillingMonth, BillingLineItem } from "@/lib/billing/types"

const DIVERGENCE_TOLERANCE = 0.01

export type LineDivergence = {
  mediaKey: string
  lineItemId: string
  header1: string
  header2: string
  savedTotal: number
  computedTotal: number
  difference: number
  kind: "line_total" | "fee_total" | "adserving_total" | "missing_in_saved" | "missing_in_computed"
}

export type MonthDivergence = {
  monthYear: string
  field: "mediaTotal" | "feeTotal" | "adservingTechFees" | "production"
  savedValue: number
  computedValue: number
  difference: number
}

export type BillingDivergenceResult = {
  isDivergent: boolean
  divergentLines: LineDivergence[]
  divergentMonths: MonthDivergence[]
}

export type AttachLineItemsCallback = (
  months: BillingMonth[],
  mode: "billing" | "delivery"
) => BillingMonth[]

export type CompareBillingDivergenceOptions = {
  /**
   * When the comparator is called with a `computed` operand that has no lineItems
   * (e.g. raw burst-derived autoReferenceBillingMonths), pass this callback to
   * attach line items to a deep clone of `computed` before comparison. This makes
   * the two operands shape-compatible.
   *
   * If omitted and `computed` has no lineItems, the comparator falls back to
   * month-level comparison only (no line-item divergence reported).
   */
  attachComputedLineItems?: AttachLineItemsCallback
}

const currencyFormatter = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
})

const MONTH_FIELDS = ["mediaTotal", "feeTotal", "adservingTechFees", "production"] as const

type MonthField = (typeof MONTH_FIELDS)[number]

type CollectedLine = {
  mediaKey: string
  line: BillingLineItem
}

function parseNumeric(val: unknown): number {
  return parseFloat(String(val ?? "").replace(/[^0-9.-]/g, "")) || 0
}

function exceedsTolerance(a: number, b: number): boolean {
  return Math.abs(a - b) > DIVERGENCE_TOLERANCE
}

function collectLinesById(months: BillingMonth[]): Map<string, CollectedLine> {
  const map = new Map<string, CollectedLine>()
  for (const month of months) {
    const lineItems = month.lineItems
    if (!lineItems) continue
    for (const [mediaKey, items] of Object.entries(lineItems)) {
      const arr = items as BillingLineItem[] | undefined
      if (!arr?.length) continue
      for (const line of arr) {
        if (!line.id) continue
        map.set(line.id, { mediaKey, line })
      }
    }
  }
  return map
}

function monthValue(month: BillingMonth | undefined, field: MonthField): number {
  if (!month) return 0
  return parseNumeric(month[field])
}

function pushLineDivergence(
  divergentLines: LineDivergence[],
  entry: Omit<LineDivergence, "difference"> & { difference?: number }
): void {
  divergentLines.push({
    ...entry,
    difference: entry.difference ?? entry.savedTotal - entry.computedTotal,
  })
}

function compareLineNumericField(
  divergentLines: LineDivergence[],
  mediaKey: string,
  savedLine: BillingLineItem,
  computedLine: BillingLineItem,
  kind: "line_total" | "fee_total" | "adserving_total",
  savedVal: number,
  computedVal: number
): void {
  if (!exceedsTolerance(savedVal, computedVal)) return
  pushLineDivergence(divergentLines, {
    mediaKey,
    lineItemId: savedLine.id,
    header1: savedLine.header1,
    header2: savedLine.header2,
    savedTotal: savedVal,
    computedTotal: computedVal,
    kind,
  })
}

function compareMonthFields(
  divergentMonths: MonthDivergence[],
  monthYear: string,
  savedMonth: BillingMonth | undefined,
  computedMonth: BillingMonth | undefined
): void {
  for (const field of MONTH_FIELDS) {
    const savedValue = monthValue(savedMonth, field)
    const computedValue = monthValue(computedMonth, field)
    if (!exceedsTolerance(savedValue, computedValue)) continue
    divergentMonths.push({
      monthYear,
      field,
      savedValue,
      computedValue,
      difference: savedValue - computedValue,
    })
  }
}

export function compareBillingDivergence(
  saved: BillingMonth[],
  computed: BillingMonth[],
  options?: CompareBillingDivergenceOptions
): BillingDivergenceResult {
  const divergentLines: LineDivergence[] = []
  const divergentMonths: MonthDivergence[] = []

  const computedHasLineItems = computed.some(
    (m) => m.lineItems && Object.keys(m.lineItems).length > 0
  )
  const savedHasLineItems = saved.some(
    (m) => m.lineItems && Object.keys(m.lineItems).length > 0
  )

  let effectiveComputed = computed
  if (!computedHasLineItems && savedHasLineItems && options?.attachComputedLineItems) {
    const cloned = JSON.parse(JSON.stringify(computed)) as BillingMonth[]
    effectiveComputed = options.attachComputedLineItems(cloned, "billing")
  }

  const effectiveComputedHasLineItems = effectiveComputed.some(
    (m) => m.lineItems && Object.keys(m.lineItems).length > 0
  )
  const shouldCompareLineItems = savedHasLineItems && effectiveComputedHasLineItems

  if (shouldCompareLineItems) {
    const savedLines = collectLinesById(saved)
    const computedLines = collectLinesById(effectiveComputed)
    const allLineIds = new Set([...savedLines.keys(), ...computedLines.keys()])

    for (const lineItemId of allLineIds) {
    const savedEntry = savedLines.get(lineItemId)
    const computedEntry = computedLines.get(lineItemId)

    if (savedEntry && !computedEntry) {
      pushLineDivergence(divergentLines, {
        mediaKey: savedEntry.mediaKey,
        lineItemId,
        header1: savedEntry.line.header1,
        header2: savedEntry.line.header2,
        savedTotal: savedEntry.line.totalAmount ?? 0,
        computedTotal: 0,
        kind: "missing_in_computed",
      })
      continue
    }

    if (!savedEntry && computedEntry) {
      pushLineDivergence(divergentLines, {
        mediaKey: computedEntry.mediaKey,
        lineItemId,
        header1: computedEntry.line.header1,
        header2: computedEntry.line.header2,
        savedTotal: 0,
        computedTotal: computedEntry.line.totalAmount ?? 0,
        kind: "missing_in_saved",
      })
      continue
    }

    if (!savedEntry || !computedEntry) continue

    const { mediaKey, line: savedLine } = savedEntry
    const { line: computedLine } = computedEntry

    compareLineNumericField(
      divergentLines,
      mediaKey,
      savedLine,
      computedLine,
      "line_total",
      savedLine.totalAmount ?? 0,
      computedLine.totalAmount ?? 0
    )
    compareLineNumericField(
      divergentLines,
      mediaKey,
      savedLine,
      computedLine,
      "fee_total",
      savedLine.totalFeeAmount ?? 0,
      computedLine.totalFeeAmount ?? 0
    )
    compareLineNumericField(
      divergentLines,
      mediaKey,
      savedLine,
      computedLine,
      "adserving_total",
      savedLine.totalAdServingAmount ?? 0,
      computedLine.totalAdServingAmount ?? 0
    )
    }
  }

  const savedByMonth = new Map(saved.map((m) => [m.monthYear, m]))
  const computedByMonth = new Map(effectiveComputed.map((m) => [m.monthYear, m]))
  const allMonthYears = new Set([...savedByMonth.keys(), ...computedByMonth.keys()])

  for (const monthYear of allMonthYears) {
    compareMonthFields(
      divergentMonths,
      monthYear,
      savedByMonth.get(monthYear),
      computedByMonth.get(monthYear)
    )
  }

  return {
    isDivergent: divergentLines.length > 0 || divergentMonths.length > 0,
    divergentLines,
    divergentMonths,
  }
}

function lineKindLabel(kind: LineDivergence["kind"]): string {
  switch (kind) {
    case "line_total":
      return "Line total"
    case "fee_total":
      return "Fee total"
    case "adserving_total":
      return "Ad serving total"
    case "missing_in_saved":
      return "Line item not in saved billing"
    case "missing_in_computed":
      return "Line item not in auto-computed billing"
  }
}

function monthFieldLabel(field: MonthDivergence["field"]): string {
  switch (field) {
    case "mediaTotal":
      return "Media total"
    case "feeTotal":
      return "Fee total"
    case "adservingTechFees":
      return "Ad serving tech fees"
    case "production":
      return "Production"
  }
}

function formatCountPhrase(count: number, singular: string, plural: string): string {
  if (count === 1) return `1 ${singular}`
  return `${count} ${plural}`
}

export function summarizeBillingDivergence(result: BillingDivergenceResult): {
  headline: string
  lineMessages: string[]
  monthMessages: string[]
} {
  if (!result.isDivergent) {
    return { headline: "", lineMessages: [], monthMessages: [] }
  }

  const lineCount = result.divergentLines.length
  const monthCount = result.divergentMonths.length

  const parts: string[] = []
  if (lineCount > 0) {
    parts.push(formatCountPhrase(lineCount, "line item", "line items"))
  }
  if (monthCount > 0) {
    parts.push(formatCountPhrase(monthCount, "month", "months"))
  }

  const headline =
    parts.length > 0
      ? `${parts.join(" and ")} differ from auto-computed billing`
      : ""

  const lineMessages = result.divergentLines.map((d) => {
    const label = `${d.mediaKey} · "${d.header1}" / "${d.header2}"`
    if (d.kind === "missing_in_saved" || d.kind === "missing_in_computed") {
      return `${label}: ${lineKindLabel(d.kind)}`
    }
    return `${label}: ${lineKindLabel(d.kind)} differs by ${currencyFormatter.format(d.difference)}`
  })

  const monthMessages = result.divergentMonths.map((d) => {
    return `${d.monthYear} · ${monthFieldLabel(d.field)}: saved ${currencyFormatter.format(d.savedValue)}, computed ${currencyFormatter.format(d.computedValue)}`
  })

  return { headline, lineMessages, monthMessages }
}
