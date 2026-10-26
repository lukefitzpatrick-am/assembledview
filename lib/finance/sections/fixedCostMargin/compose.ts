/**
 * Fixed cost margin (Finance > Publishers > Fixed cost margin).
 *
 * A fixed-cost line is billed to the client at its plan amount, split by month
 * on the published billing schedule (`schedule_months` media, basis billing).
 * We buy the media on a platform and pay the platform's actual spend. The
 * difference is our margin, per client, line, publisher and month.
 *
 * Our cost per source (Luke, 27 Oct 2026):
 * - DV360 and YouTube via DV360: DV360 cost in advertiser currency
 *   (AMOUNT_SPENT, equal to DV360 revenue), the figure pacing shows.
 * - Vistar: Vistar's reported spend (Vistar revenue), what Vistar invoices us.
 * - Taboola, Meta, TikTok, Reddit, Google Ads, Microsoft Ads: platform spend.
 * - Channel Factory and direct publishers: Xero bills (not built yet), so
 *   billed only for now.
 *
 * Pure. No I/O. All money is integer cents. Read-only report: nothing here
 * feeds billing, pacing or dashboards.
 */

/** One billed (or delivery) schedule cell of a fixed-cost line on a published tip. */
export type FixedCostPlanCell = {
  clientId: number
  clientName: string
  mbaNumber: string
  campaignName: string
  campaignStatus: string
  lineItemId: string
  lineName: string
  publisher: string
  platform: string
  channel: string
  buyType: string
  fixedCostMedia: boolean
  /** YYYY-MM */
  month: string
  basis: "billing" | "delivery"
  amountCents: number
}

/** Platform spend for one line, month and source (from Snowflake). */
export type PlatformSpendCell = {
  /** Lowercase plan line id. */
  lineItemId: string
  /** YYYY-MM */
  month: string
  source: string
  /** AMOUNT_SPENT: our cost for this source. */
  spendCents: number
  impressions: number
  rowCount: number
}

/** `${lower(mba)}|YYYY-MM` for MBA-months with an invoiced media record. */
export type InvoicedMonthKeys = ReadonlySet<string>

export type CostStatus = "reported" | "zero_cost" | "none"

export type FixedCostMarginLineMonth = {
  month: string
  billedCents: number
  /** Billed cents when the MBA-month is invoiced, else 0. */
  invoicedCents: number
  invoiced: boolean
  actualCents: number
  /** Billed minus actual. Null when the line has no platform cost. */
  marginCents: number | null
  /** Margin over billed, as a fraction. Null when billed is 0 or margin is null. */
  marginPct: number | null
  /** Platform spend in a month outside the line's schedule months. */
  outsideLineMonths: boolean
}

export type FixedCostMarginLine = {
  key: string
  clientId: number
  clientName: string
  mbaNumber: string
  campaignName: string
  campaignStatus: string
  lineItemId: string
  lineName: string
  publisher: string
  platform: string
  channel: string
  buyType: string
  fixedCostMedia: boolean
  /** First and last schedule month of the whole line (billing and delivery). */
  lineFirstMonth: string
  lineLastMonth: string
  sources: string[]
  costStatus: CostStatus
  months: FixedCostMarginLineMonth[]
  totals: MarginTotals
  flags: {
    noPlatformData: boolean
    noCostInFeed: boolean
    negativeMargin: boolean
    outOfRangeMonths: string[]
  }
}

export type MarginTotals = {
  billedCents: number
  invoicedCents: number
  actualCents: number
  /** Billed on lines with platform cost (the margin base). */
  billedWithCostCents: number
  /** Billed on lines with no platform cost (no data, or a feed with 0 cost). */
  billedWithoutCostCents: number
  marginCents: number
  marginPct: number | null
}

export type MarginSummary = {
  grand: MarginTotals
  byClient: Array<{ clientId: number; clientName: string; totals: MarginTotals }>
  byPublisher: Array<{ publisher: string; totals: MarginTotals }>
  byMonth: Array<{ month: string; totals: MarginTotals }>
}

export type SpendSourceMode = "line_month_view" | "pacing_facts_fallback"

/** GET /api/finance/sections/costs/fixed-cost-margin response. */
export type FinanceFixedCostMarginPayload = {
  scope: {
    fy: number
    from: string
    to: string
    clients: number[]
    currentMonth: string
  }
  caption: string
  spendSource: { mode: SpendSourceMode; note: string }
  lines: FixedCostMarginLine[]
  summary: MarginSummary
  options: { publishers: string[]; platforms: string[] }
  notes: string[]
}

export const FIXED_COST_MARGIN_CAPTION =
  "Fixed-cost lines billed at plan, against what the platform actually charged. Billed is the published billing schedule (media only, no fees or ad serving). Approved, booked and completed campaigns."

/** Page and Excel Notes sheet wording. */
export const FIXED_COST_MARGIN_NOTES = [
  "Billed is the published billing schedule for the month, media only. Fees and ad serving are not media cost and are left out.",
  "Invoiced shows a month's billed amount once that MBA-month has an invoiced, paid, exported or Xero-matched media record. Invoices are not split by line.",
  "DV360 and YouTube (via DV360) cost is the DV360 cost in advertiser currency (equal to DV360 revenue), the figure pacing shows.",
  "Vistar cost is Vistar's reported spend (Vistar revenue), which is what Vistar invoices us.",
  "Margin counts only lines with platform cost. Lines with no platform data, or a feed that reports no cost (Channel Factory, CM360), show billed only.",
  "Channel Factory and direct publishers (News Corp, Golf Digest, Nova and others) will take their cost from Xero bills. Not built yet, so they show billed only.",
  "The current month is month to date.",
] as const

export const NO_PLATFORM_DATA_LABEL = "No platform data"
export const NO_COST_IN_FEED_LABEL = "No cost in feed"
export const OUT_OF_RANGE_LABEL = "Spend outside line months"

function emptyTotals(): MarginTotals {
  return {
    billedCents: 0,
    invoicedCents: 0,
    actualCents: 0,
    billedWithCostCents: 0,
    billedWithoutCostCents: 0,
    marginCents: 0,
    marginPct: null,
  }
}

/** Margin over billed as a fraction; null when billed is 0. */
export function marginPctOf(marginCents: number, billedCents: number): number | null {
  if (!billedCents) return null
  return marginCents / billedCents
}

function lineKey(mbaNumber: string, lineItemId: string): string {
  return `${mbaNumber.trim().toLowerCase()}|${lineItemId.trim().toLowerCase()}`
}

export function invoicedMonthKey(mbaNumber: string, month: string): string {
  return `${mbaNumber.trim().toLowerCase()}|${month}`
}

function inRange(month: string, from: string, to: string): boolean {
  return month >= from && month <= to
}

type LineAcc = {
  identity: Omit<
    FixedCostMarginLine,
    "key" | "lineFirstMonth" | "lineLastMonth" | "sources" | "costStatus" | "months" | "totals" | "flags"
  >
  firstMonth: string
  lastMonth: string
  billedByMonth: Map<string, number>
}

/**
 * Join billed schedule cells to platform spend by line id and month.
 * A line shows when it has billed or spend in the range.
 * Platform spend is matched on the lowercase plan line id.
 */
export function composeFixedCostMargin(input: {
  plan: readonly FixedCostPlanCell[]
  spend: readonly PlatformSpendCell[]
  invoiced: InvoicedMonthKeys
  from: string
  to: string
}): FixedCostMarginLine[] {
  const { from, to } = input
  const lines = new Map<string, LineAcc>()
  const keysByLineId = new Map<string, Set<string>>()

  for (const cell of input.plan) {
    const key = lineKey(cell.mbaNumber, cell.lineItemId)
    let acc = lines.get(key)
    if (!acc) {
      acc = {
        identity: {
          clientId: cell.clientId,
          clientName: cell.clientName,
          mbaNumber: cell.mbaNumber,
          campaignName: cell.campaignName,
          campaignStatus: cell.campaignStatus,
          lineItemId: cell.lineItemId,
          lineName: cell.lineName,
          publisher: cell.publisher,
          platform: cell.platform,
          channel: cell.channel,
          buyType: cell.buyType,
          fixedCostMedia: cell.fixedCostMedia,
        },
        firstMonth: cell.month,
        lastMonth: cell.month,
        billedByMonth: new Map(),
      }
      lines.set(key, acc)
      const lid = cell.lineItemId.trim().toLowerCase()
      const set = keysByLineId.get(lid) ?? new Set<string>()
      set.add(key)
      keysByLineId.set(lid, set)
    }
    if (cell.amountCents !== 0) {
      if (cell.month < acc.firstMonth) acc.firstMonth = cell.month
      if (cell.month > acc.lastMonth) acc.lastMonth = cell.month
    }
    if (cell.basis === "billing" && inRange(cell.month, from, to)) {
      acc.billedByMonth.set(cell.month, (acc.billedByMonth.get(cell.month) ?? 0) + cell.amountCents)
    }
  }

  type SpendAcc = {
    byMonth: Map<string, { spend: number; impressions: number; rows: number }>
    sources: Set<string>
    rows: number
  }
  const spendByLineId = new Map<string, SpendAcc>()
  for (const cell of input.spend) {
    if (!inRange(cell.month, from, to)) continue
    const lid = cell.lineItemId.trim().toLowerCase()
    if (!keysByLineId.has(lid)) continue
    const acc = spendByLineId.get(lid) ?? { byMonth: new Map(), sources: new Set<string>(), rows: 0 }
    const m = acc.byMonth.get(cell.month) ?? { spend: 0, impressions: 0, rows: 0 }
    m.spend += cell.spendCents
    m.impressions += cell.impressions
    m.rows += cell.rowCount
    acc.byMonth.set(cell.month, m)
    acc.sources.add(cell.source)
    acc.rows += cell.rowCount
    spendByLineId.set(lid, acc)
  }

  const out: FixedCostMarginLine[] = []
  for (const [key, acc] of lines) {
    const lid = acc.identity.lineItemId.trim().toLowerCase()
    const spend = spendByLineId.get(lid)
    const months = new Set<string>([...acc.billedByMonth.keys()])
    if (spend) for (const m of spend.byMonth.keys()) months.add(m)
    const hasBilled = [...acc.billedByMonth.values()].some((c) => c !== 0)
    const hasSpendRows = !!spend && spend.rows > 0
    if (!hasBilled && !hasSpendRows) continue

    const anySpend = !!spend && [...spend.byMonth.values()].some((m) => m.spend !== 0)
    const costStatus: CostStatus = anySpend ? "reported" : hasSpendRows ? "zero_cost" : "none"

    const lineMonths: FixedCostMarginLineMonth[] = []
    const outOfRange: string[] = []
    for (const month of [...months].sort()) {
      const billedCents = acc.billedByMonth.get(month) ?? 0
      const s = spend?.byMonth.get(month)
      if (billedCents === 0 && !(s && s.rows > 0)) continue
      const actualCents = s?.spend ?? 0
      const invoiced = input.invoiced.has(invoicedMonthKey(acc.identity.mbaNumber, month))
      const outsideLineMonths =
        !!s && s.rows > 0 && (month < acc.firstMonth || month > acc.lastMonth)
      if (outsideLineMonths) outOfRange.push(month)
      const marginCents = costStatus === "reported" ? billedCents - actualCents : null
      lineMonths.push({
        month,
        billedCents,
        invoicedCents: invoiced ? billedCents : 0,
        invoiced,
        actualCents,
        marginCents,
        marginPct: marginCents == null ? null : marginPctOf(marginCents, billedCents),
        outsideLineMonths,
      })
    }

    const line: FixedCostMarginLine = {
      key,
      ...acc.identity,
      lineFirstMonth: acc.firstMonth,
      lineLastMonth: acc.lastMonth,
      sources: spend ? [...spend.sources].sort() : [],
      costStatus,
      months: lineMonths,
      totals: emptyTotals(),
      flags: {
        noPlatformData: costStatus === "none",
        noCostInFeed: costStatus === "zero_cost",
        negativeMargin: false,
        outOfRangeMonths: outOfRange,
      },
    }
    line.totals = totalsForLines([line])
    line.flags.negativeMargin = costStatus === "reported" && line.totals.marginCents < 0
    out.push(line)
  }

  out.sort(
    (a, b) =>
      a.clientName.localeCompare(b.clientName) ||
      a.mbaNumber.localeCompare(b.mbaNumber) ||
      a.lineItemId.localeCompare(b.lineItemId, undefined, { numeric: true })
  )
  return out
}

function addMonth(t: MarginTotals, line: FixedCostMarginLine, m: FixedCostMarginLineMonth): void {
  t.billedCents += m.billedCents
  t.invoicedCents += m.invoicedCents
  t.actualCents += m.actualCents
  if (line.costStatus === "reported") {
    t.billedWithCostCents += m.billedCents
    t.marginCents += m.marginCents ?? 0
  } else {
    t.billedWithoutCostCents += m.billedCents
  }
}

function finish(t: MarginTotals): MarginTotals {
  t.marginPct = marginPctOf(t.marginCents, t.billedWithCostCents)
  return t
}

/** Totals over lines (optionally only one month). Margin counts lines with platform cost only. */
export function totalsForLines(
  lines: readonly FixedCostMarginLine[],
  month?: string
): MarginTotals {
  const t = emptyTotals()
  for (const line of lines) {
    for (const m of line.months) {
      if (month && m.month !== month) continue
      addMonth(t, line, m)
    }
  }
  return finish(t)
}

/** Client, publisher, month and grand totals for the lines shown. */
export function summariseFixedCostMargin(lines: readonly FixedCostMarginLine[]): MarginSummary {
  const byClient = new Map<number, { clientName: string; lines: FixedCostMarginLine[] }>()
  const byPublisher = new Map<string, FixedCostMarginLine[]>()
  const monthSet = new Set<string>()
  for (const line of lines) {
    const c = byClient.get(line.clientId) ?? { clientName: line.clientName, lines: [] }
    c.lines.push(line)
    byClient.set(line.clientId, c)
    const p = byPublisher.get(line.publisher) ?? []
    p.push(line)
    byPublisher.set(line.publisher, p)
    for (const m of line.months) monthSet.add(m.month)
  }
  return {
    grand: totalsForLines(lines),
    byClient: [...byClient.entries()]
      .map(([clientId, c]) => ({ clientId, clientName: c.clientName, totals: totalsForLines(c.lines) }))
      .sort((a, b) => a.clientName.localeCompare(b.clientName)),
    byPublisher: [...byPublisher.entries()]
      .map(([publisher, ls]) => ({ publisher, totals: totalsForLines(ls) }))
      .sort((a, b) => a.publisher.localeCompare(b.publisher)),
    byMonth: [...monthSet]
      .sort()
      .map((month) => ({ month, totals: totalsForLines(lines, month) })),
  }
}

export type FixedCostMarginFilter = {
  clientIds?: readonly number[]
  publishers?: readonly string[]
  platforms?: readonly string[]
}

/** Publisher and platform (and client) filters, applied to whole lines. */
export function filterFixedCostMarginLines(
  lines: readonly FixedCostMarginLine[],
  filter: FixedCostMarginFilter
): FixedCostMarginLine[] {
  const clients = new Set(filter.clientIds ?? [])
  const pubs = new Set((filter.publishers ?? []).map((p) => p.toLowerCase()))
  const plats = new Set((filter.platforms ?? []).map((p) => p.toLowerCase()))
  return lines.filter(
    (l) =>
      (!clients.size || clients.has(l.clientId)) &&
      (!pubs.size || pubs.has(l.publisher.toLowerCase())) &&
      (!plats.size || plats.has(l.platform.toLowerCase()))
  )
}

/** Short flag labels for a line, for the table and the export. */
export function lineFlagLabels(line: FixedCostMarginLine): string[] {
  const out: string[] = []
  if (line.flags.noPlatformData) out.push(NO_PLATFORM_DATA_LABEL)
  if (line.flags.noCostInFeed) out.push(NO_COST_IN_FEED_LABEL)
  if (line.flags.negativeMargin) out.push("Negative margin")
  if (line.flags.outOfRangeMonths.length) {
    out.push(`${OUT_OF_RANGE_LABEL} (${line.flags.outOfRangeMonths.join(", ")})`)
  }
  return out
}
