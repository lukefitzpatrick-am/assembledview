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
 * - Channel Factory: Xero bills, matched per placement (PL...) through the CF
 *   daily delivery file. "7.5%" fee lines are a fee, shown apart.
 * - Advertising Associates publishers: AA's Xero bills, gross, less an assumed
 *   8% rebate (`AA_REBATE_RATE`). Production lines are shown apart.
 * - Cost from bills lands in the bill's issue month (billed month). The week
 *   date on the bill line gives the delivered month, shown in the timing view.
 *
 * Pure. No I/O. All money is integer cents. Read-only report: nothing here
 * feeds billing, pacing or dashboards.
 */

import { COUNTED_BILL_STATUSES } from "./bills/policy"

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
  /** Where our cost comes from. Defaults to platform spend. */
  costBasis?: CostBasis
}

/** "platform": platform spend feeds. "xero_bill": supplier bills (CF, AA, direct). */
export type CostBasis = "platform" | "xero_bill"

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

/** Matched bill cost for one line and month (see bills/match.ts `billCostCells`). */
export type LineBillCostCell = {
  /** Lower-case plan line id. */
  lineItemId: string
  month: string
  basis: "billed" | "delivered"
  countedGrossCents: number
  countedRebateCents: number
  countedNetCents: number
  pendingNetCents: number
  methods: string[]
  statuses: string[]
  supplierKinds: string[]
}

/** Billed month vs delivered month, for one line and month (timing view). */
export type FixedCostTimingMonth = {
  month: string
  /** Our cost in the month it was billed to us (margin basis). */
  costBilledMonthCents: number
  /** Our cost in the month the media ran. */
  costDeliveredMonthCents: number
  /** Billed month minus delivered month. */
  costDiffCents: number
  /** What we bill the client (billing schedule). */
  clientBilledCents: number
  /** The plan's delivery schedule for the client. */
  clientDeliveryCents: number
  clientDiffCents: number
}

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
  /** Xero bill lines: gross (before the AA rebate), the rebate, and pending (draft or submitted) net. */
  billGrossCents: number
  billRebateCents: number
  pendingBillCents: number
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
  costBasis: CostBasis
  costStatus: CostStatus
  /** Bill match methods and bill statuses behind the cost (Xero bill lines). */
  billMethods: string[]
  billStatuses: string[]
  months: FixedCostMarginLineMonth[]
  timing: FixedCostTimingMonth[]
  totals: MarginTotals
  flags: {
    noPlatformData: boolean
    noCostInFeed: boolean
    /** Cost comes from Xero bills and no counted bill is matched yet. */
    noBillYet: boolean
    pendingBills: boolean
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
  billGrossCents: number
  billRebateCents: number
  pendingBillCents: number
}

export type MarginSummary = {
  grand: MarginTotals
  byClient: Array<{ clientId: number; clientName: string; totals: MarginTotals }>
  byPublisher: Array<{ publisher: string; totals: MarginTotals }>
  byMonth: Array<{ month: string; totals: MarginTotals }>
}

export type SpendSourceMode = "line_month_view" | "pacing_facts_fallback"

/** One bill line on the page and in Excel (matched or not). */
export type FixedCostBillLineView = {
  key: string
  supplier: string
  supplierKind: string
  invoiceNumber: string
  status: string
  statusClass: string
  issueDate: string
  billedMonth: string
  deliveredMonth: string
  description: string
  kind: string
  placementId: string | null
  ioId: string | null
  mediaOwnerText: string
  publisher: string | null
  mbaNumber: string | null
  mbaSource: string | null
  clientName: string
  lineItemId: string | null
  inReport: boolean
  state: string
  method: string | null
  candidates: string[]
  reason: string
  grossCents: number
  rebateCents: number
  netCents: number
}

export type FixedCostBillTotals = {
  supplierKind: string
  lines: number
  totalCents: number
  matchedCents: number
  matchedInReportCents: number
  ambiguousCents: number
  unmatchedCents: number
  feeCents: number
  productionCents: number
  pendingCents: number
}

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
  billSource: { ok: boolean; note: string }
  lines: FixedCostMarginLine[]
  billLines: FixedCostBillLineView[]
  billTotals: FixedCostBillTotals[]
  summary: MarginSummary
  options: { publishers: string[]; platforms: string[] }
  notes: string[]
}

export const FIXED_COST_MARGIN_CAPTION =
  "Fixed-cost lines billed at plan, against what the platform or the supplier's Xero bill actually charged. Billed is the published billing schedule (media only, no fees or ad serving). Approved, booked and completed campaigns."

/** Page and Excel Notes sheet wording. */
export const FIXED_COST_MARGIN_NOTES = [
  "Billed is the published billing schedule for the month, media only. Fees and ad serving are not media cost and are left out.",
  "Invoiced shows a month's billed amount once that MBA-month has an invoiced, paid, exported or Xero-matched media record. Invoices are not split by line.",
  "DV360 and YouTube (via DV360) cost is the DV360 cost in advertiser currency (equal to DV360 revenue), the figure pacing shows.",
  "Vistar cost is Vistar's reported spend (Vistar revenue), which is what Vistar invoices us.",
  "Channel Factory cost is CF's Xero bill, matched per placement (PL id) to the plan line through the CF daily delivery file. Xero tracking is not used. CF \"7.5%\" fee lines are a fee and are shown apart, not as line media cost.",
  "Advertising Associates publishers (News Corp, Nova, Nine, Seven, Golf Digest, Broadsheet and others) take their cost from AA's Xero bills. AA bills are gross; cost is net of an assumed 8% AA rebate (gross x 0.92). Gross, rebate and net are shown.",
  "AA bill lines match on MBA (invoice number, description or tracking), then the media owner to the line's publisher, then month, then amount. AA bills match AA publishers only; a publisher's direct bill matches its direct publisher only. Anything else is listed under Bill lines to match by hand.",
  "Production, talent, installation and hot read lines on AA bills are not media cost. They are listed apart.",
  "Only AUTHORISED and PAID bills count as cost. DRAFT and SUBMITTED bills show in the Pending column.",
  "Bill cost lands in the bill's issue month (billed month), so margin is by billed month. The Billed vs delivered view puts the same cost in the month the media ran (the week date on the bill line; the billed month when there is none) beside the client's billing and delivery schedules.",
  "Lines whose cost comes from Xero bills with no matched bill show \"No bill yet\".",
  "Margin counts only lines with a cost. Lines with no platform data, or a feed that reports no cost (CM360), show billed only.",
  "The current month is month to date.",
] as const

export const NO_PLATFORM_DATA_LABEL = "No platform data"
export const NO_COST_IN_FEED_LABEL = "No cost in feed"
export const OUT_OF_RANGE_LABEL = "Spend outside line months"
export const NO_BILL_YET_LABEL = "No bill yet"
export const PENDING_BILLS_LABEL = "Pending bills"

function emptyTotals(): MarginTotals {
  return {
    billedCents: 0,
    invoicedCents: 0,
    actualCents: 0,
    billedWithCostCents: 0,
    billedWithoutCostCents: 0,
    marginCents: 0,
    marginPct: null,
    billGrossCents: 0,
    billRebateCents: 0,
    pendingBillCents: 0,
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
    | "key"
    | "lineFirstMonth"
    | "lineLastMonth"
    | "sources"
    | "costBasis"
    | "costStatus"
    | "billMethods"
    | "billStatuses"
    | "months"
    | "timing"
    | "totals"
    | "flags"
  >
  costBasis: CostBasis
  firstMonth: string
  lastMonth: string
  billedByMonth: Map<string, number>
  deliveryByMonth: Map<string, number>
}

type BillAcc = {
  billed: Map<string, LineBillCostCell>
  delivered: Map<string, number>
}

const SUPPLIER_SOURCE_LABEL: Record<string, string> = {
  channel_factory: "Xero bill (Channel Factory)",
  advertising_associates: "Xero bill (Advertising Associates)",
  direct_publisher: "Xero bill (direct)",
}

function addTo(map: Map<string, number>, key: string, cents: number): void {
  map.set(key, (map.get(key) ?? 0) + cents)
}

/**
 * Join billed schedule cells to our cost by line id and month. Platform lines
 * take platform spend; Xero bill lines (CF and AA publishers) take matched
 * bill cost in the billed month and ignore platform feeds. A line shows when
 * it has billed, spend or bill cost in the range.
 */
export function composeFixedCostMargin(input: {
  plan: readonly FixedCostPlanCell[]
  spend: readonly PlatformSpendCell[]
  invoiced: InvoicedMonthKeys
  from: string
  to: string
  billCosts?: readonly LineBillCostCell[]
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
        costBasis: cell.costBasis ?? "platform",
        firstMonth: cell.month,
        lastMonth: cell.month,
        billedByMonth: new Map(),
        deliveryByMonth: new Map(),
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
    if (!inRange(cell.month, from, to)) continue
    if (cell.basis === "billing") addTo(acc.billedByMonth, cell.month, cell.amountCents)
    else addTo(acc.deliveryByMonth, cell.month, cell.amountCents)
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

  const billsByLineId = new Map<string, BillAcc>()
  for (const cell of input.billCosts ?? []) {
    if (!inRange(cell.month, from, to)) continue
    const lid = cell.lineItemId.trim().toLowerCase()
    if (!keysByLineId.has(lid)) continue
    const acc = billsByLineId.get(lid) ?? { billed: new Map(), delivered: new Map() }
    if (cell.basis === "billed") {
      const prev = acc.billed.get(cell.month)
      if (!prev) acc.billed.set(cell.month, { ...cell, methods: [...cell.methods], statuses: [...cell.statuses], supplierKinds: [...cell.supplierKinds] })
      else {
        prev.countedGrossCents += cell.countedGrossCents
        prev.countedRebateCents += cell.countedRebateCents
        prev.countedNetCents += cell.countedNetCents
        prev.pendingNetCents += cell.pendingNetCents
        for (const m of cell.methods) if (!prev.methods.includes(m)) prev.methods.push(m)
        for (const st of cell.statuses) if (!prev.statuses.includes(st)) prev.statuses.push(st)
        for (const k of cell.supplierKinds) if (!prev.supplierKinds.includes(k)) prev.supplierKinds.push(k)
      }
    } else {
      addTo(acc.delivered, cell.month, cell.countedNetCents)
    }
    billsByLineId.set(lid, acc)
  }

  const out: FixedCostMarginLine[] = []
  for (const [key, acc] of lines) {
    const lid = acc.identity.lineItemId.trim().toLowerCase()
    const isBill = acc.costBasis === "xero_bill"
    const spend = isBill ? undefined : spendByLineId.get(lid)
    const bills = isBill ? billsByLineId.get(lid) : undefined
    const months = new Set<string>([...acc.billedByMonth.keys()])
    if (spend) for (const m of spend.byMonth.keys()) months.add(m)
    if (bills) for (const m of bills.billed.keys()) months.add(m)
    const hasBilled = [...acc.billedByMonth.values()].some((c) => c !== 0)
    const hasSpendRows = !!spend && spend.rows > 0
    const billCells = bills ? [...bills.billed.values()] : []
    const hasBillRows = billCells.length > 0
    const hasCountedBill = billCells.some((c) => c.statuses.some((st) => COUNTED_BILL_STATUSES.has(st)))
    if (!hasBilled && !hasSpendRows && !hasBillRows) continue

    let costStatus: CostStatus
    if (isBill) costStatus = hasCountedBill ? "reported" : "none"
    else {
      const anySpend = !!spend && [...spend.byMonth.values()].some((m) => m.spend !== 0)
      costStatus = anySpend ? "reported" : hasSpendRows ? "zero_cost" : "none"
    }

    const lineMonths: FixedCostMarginLineMonth[] = []
    const outOfRange: string[] = []
    for (const month of [...months].sort()) {
      const billedCents = acc.billedByMonth.get(month) ?? 0
      const s = spend?.byMonth.get(month)
      const b = bills?.billed.get(month)
      if (billedCents === 0 && !(s && s.rows > 0) && !b) continue
      const actualCents = isBill ? b?.countedNetCents ?? 0 : s?.spend ?? 0
      const invoiced = input.invoiced.has(invoicedMonthKey(acc.identity.mbaNumber, month))
      const hasCost = isBill ? !!b : !!s && s.rows > 0
      const outsideLineMonths = hasCost && (month < acc.firstMonth || month > acc.lastMonth)
      if (outsideLineMonths) outOfRange.push(month)
      // Bill lines: a month with no counted bill yet has no margin (the bill is
      // not in), so it is not counted as margin of the full billed amount.
      const monthHasCost = isBill ? !!b && b.statuses.some((st) => COUNTED_BILL_STATUSES.has(st)) : true
      const marginCents = costStatus === "reported" && monthHasCost ? billedCents - actualCents : null
      lineMonths.push({
        month,
        billedCents,
        invoicedCents: invoiced ? billedCents : 0,
        invoiced,
        actualCents,
        marginCents,
        marginPct: marginCents == null ? null : marginPctOf(marginCents, billedCents),
        outsideLineMonths,
        billGrossCents: b?.countedGrossCents ?? 0,
        billRebateCents: b?.countedRebateCents ?? 0,
        pendingBillCents: b?.pendingNetCents ?? 0,
      })
    }

    const timing = timingMonths(acc, lineMonths, bills, isBill)
    const sources = isBill
      ? [...new Set(billCells.flatMap((c) => c.supplierKinds.map((k) => SUPPLIER_SOURCE_LABEL[k] ?? k)))].sort()
      : spend
        ? [...spend.sources].sort()
        : []

    const line: FixedCostMarginLine = {
      key,
      ...acc.identity,
      lineFirstMonth: acc.firstMonth,
      lineLastMonth: acc.lastMonth,
      sources,
      costBasis: acc.costBasis,
      costStatus,
      billMethods: [...new Set(billCells.flatMap((c) => c.methods))].sort(),
      billStatuses: [...new Set(billCells.flatMap((c) => c.statuses))].sort(),
      months: lineMonths,
      timing,
      totals: emptyTotals(),
      flags: {
        noPlatformData: !isBill && costStatus === "none",
        noCostInFeed: !isBill && costStatus === "zero_cost",
        noBillYet: isBill && costStatus === "none",
        pendingBills: billCells.some((c) => c.pendingNetCents !== 0),
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

/**
 * Billed month vs delivered month for one line. Bill lines: cost by the bill's
 * issue month vs the bill line's week month. Platform lines: platform spend is
 * by day, so both are the same. Client side: billing schedule vs delivery schedule.
 */
function timingMonths(
  acc: LineAcc,
  lineMonths: readonly FixedCostMarginLineMonth[],
  bills: BillAcc | undefined,
  isBill: boolean
): FixedCostTimingMonth[] {
  const costByBilled = new Map<string, number>()
  for (const m of lineMonths) costByBilled.set(m.month, m.actualCents)
  const costByDelivered = isBill ? new Map(bills?.delivered ?? []) : new Map(costByBilled)
  const months = new Set<string>([
    ...costByBilled.keys(),
    ...costByDelivered.keys(),
    ...acc.billedByMonth.keys(),
    ...acc.deliveryByMonth.keys(),
  ])
  const out: FixedCostTimingMonth[] = []
  for (const month of [...months].sort()) {
    const costBilledMonthCents = costByBilled.get(month) ?? 0
    const costDeliveredMonthCents = costByDelivered.get(month) ?? 0
    const clientBilledCents = acc.billedByMonth.get(month) ?? 0
    const clientDeliveryCents = acc.deliveryByMonth.get(month) ?? 0
    if (!costBilledMonthCents && !costDeliveredMonthCents && !clientBilledCents && !clientDeliveryCents) continue
    out.push({
      month,
      costBilledMonthCents,
      costDeliveredMonthCents,
      costDiffCents: costBilledMonthCents - costDeliveredMonthCents,
      clientBilledCents,
      clientDeliveryCents,
      clientDiffCents: clientBilledCents - clientDeliveryCents,
    })
  }
  return out
}

function addMonth(t: MarginTotals, line: FixedCostMarginLine, m: FixedCostMarginLineMonth): void {
  t.billedCents += m.billedCents
  t.invoicedCents += m.invoicedCents
  t.actualCents += m.actualCents
  t.billGrossCents += m.billGrossCents
  t.billRebateCents += m.billRebateCents
  t.pendingBillCents += m.pendingBillCents
  if (line.costStatus === "reported" && m.marginCents != null) {
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
  if (line.flags.noBillYet) out.push(NO_BILL_YET_LABEL)
  if (line.flags.pendingBills) out.push(PENDING_BILLS_LABEL)
  if (line.flags.negativeMargin) out.push("Negative margin")
  if (line.flags.outOfRangeMonths.length) {
    out.push(`${OUT_OF_RANGE_LABEL} (${line.flags.outOfRangeMonths.join(", ")})`)
  }
  return out
}
