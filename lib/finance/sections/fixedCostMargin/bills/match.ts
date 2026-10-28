/**
 * Match parsed bill lines to plan lines and months (Luke, 27 Oct 2026).
 *
 * - Channel Factory: the placement id (PL...) on the bill line maps to one plan
 *   line through the CF daily delivery file. Xero tracking is never the key.
 * - Advertising Associates and direct publishers: MBA (invoice number, then
 *   descriptions, then the line's tracking), then media owner to the line's
 *   publisher, then month, then amount. AA bills match only lines whose
 *   publisher bills through AA; a direct supplier's bills match only its direct
 *   publisher. Anything else is unmatched or ambiguous and goes to the manual
 *   list. Fee and production lines are kept out of media cost.
 * - Saved manual matches (`ap_bill_line_matches`, MAR-4) come first: a bill
 *   line with a saved match takes that plan line and month before any rule
 *   runs, as long as its amount is still the amount it had when matched.
 *
 * Pure. No I/O. Money is integer cents.
 */

import { toBillingOverrideLineItemId } from "@/lib/finance/manualBillingOverridesUi"

import {
  AMOUNT_MATCH_TOLERANCE_CENTS,
  assignBillLineMonths,
  classifyBillStatus,
  splitRebate,
  type BillStatusClass,
} from "./policy"
import { findKnownMbas, type ParsedBillLine } from "./parse"

/** One plan line a bill line can match (any buy type), with its billed cents by month. */
export type BillPlanLine = {
  /** Lower-case. */
  mbaNumber: string
  /** Lower-case. */
  lineItemId: string
  clientId: number
  clientName: string
  /** Canonical AV publisher name, or null when the line's text matches none. */
  publisher: string | null
  /** Lower-case `publishers.billingagency` of that publisher. */
  billingAgency: string
  /** In the fixed cost margin report (fixed-cost, not client-pays). */
  inReport: boolean
  /** YYYY-MM to billed cents (media, billing basis). */
  billedByMonth: ReadonlyMap<string, number>
}

/** CF placement to plan line ids seen against it in the CF daily file (lower-case). */
export type CfPlacementMap = ReadonlyMap<string, readonly string[]>

export type MbaSource = "invoice_number" | "description" | "tracking" | "plan_line" | "manual"

export type MatchMethod =
  | "manual"
  | "cf_placement"
  | "mba_publisher"
  | "mba_publisher_month_amount"

export type MatchState = "matched" | "ambiguous" | "unmatched" | "fee" | "production"

export type MatchedBillLine = ParsedBillLine & {
  billedMonth: string
  deliveredMonth: string
  statusClass: BillStatusClass
  grossCents: number
  rebateCents: number
  netCents: number
  mbaNumber: string | null
  mbaSource: MbaSource | null
  /** AV publisher the bill line means (media owner alias, CF, or the direct publisher). */
  publisher: string | null
  state: MatchState
  method: MatchMethod | null
  /** Lower-case plan line id when matched. */
  lineItemId: string | null
  /** Matched line is in the fixed cost margin report. */
  inReport: boolean
  clientId: number | null
  clientName: string
  /** Candidate plan line ids when ambiguous. */
  candidates: string[]
  /** Why it is not matched, or how it matched. */
  reason: string
  /** The saved manual match on this bill line, if any (applied or stale). */
  savedMatch: SavedMatchState | null
}

/** One row of `ap_bill_line_matches`, as the matcher needs it. */
export type SavedBillLineMatch = {
  id: number
  xeroInvoiceId: string
  xeroLineItemId: string
  /** Lower-case. */
  mbaNumber: string
  /** Lower-case. */
  lineItemId: string
  /** YYYY-MM: the month the bill line is for. */
  month: string
  /** Bill line ex GST cents when matched. */
  amountCents: number
  matchedBy: string
  matchedAt: string
  note: string | null
}

export type SavedMatchState = {
  id: number
  lineItemId: string
  month: string
  matchedBy: string
  matchedAt: string
  note: string | null
  /** The bill line's amount changed since the match, so the match is not applied. */
  stale: boolean
  /** Applied, but the plan line is not on an approved, booked or completed published plan. */
  lineMissing: boolean
}

/** Key of a saved match: Xero bill id plus Xero LineItemID. */
export function savedMatchKey(xeroInvoiceId: string, xeroLineItemId: string): string {
  return `${xeroInvoiceId.trim()}|${xeroLineItemId.trim().toLowerCase()}`
}

/** Saved matches keyed for the matcher. A later row for the same bill line is ignored. */
export function buildSavedMatchMap(rows: readonly SavedBillLineMatch[]): Map<string, SavedBillLineMatch> {
  const out = new Map<string, SavedBillLineMatch>()
  for (const r of rows) {
    const key = savedMatchKey(r.xeroInvoiceId, r.xeroLineItemId)
    if (!out.has(key)) out.set(key, r)
  }
  return out
}

export type ResolvedPublisher = { name: string; billingAgency: string }

export type BillMatchContext = {
  knownMbas: ReadonlySet<string>
  /** Lower-case MBA to client. */
  mbaClients: ReadonlyMap<string, { clientId: number; clientName: string }>
  planLines: readonly BillPlanLine[]
  /** Null when the CF daily file could not be read. */
  cfPlacements: CfPlacementMap | null
  /** Media owner text to an AV publisher (publisher name, then alias list). */
  resolveMediaOwner: (text: string) => ResolvedPublisher | null
  /** Direct supplier contact name to its AV publisher (null when none is set up). */
  directPublisherFor: (contactName: string) => ResolvedPublisher | null
  /** Saved manual matches by `savedMatchKey` (empty until migration 0107 runs). */
  savedMatches?: ReadonlyMap<string, SavedBillLineMatch>
}

const AA = "advertising associates"

function eqName(a: string | null, b: string | null): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** MBA for an AA or direct bill line: bill level first, then the line's own text and tracking. */
export function resolveBillLineMba(
  line: Pick<ParsedBillLine, "invoiceNumber" | "billText" | "description" | "tracking">,
  known: ReadonlySet<string>
): { mba: string | null; source: MbaSource | null; ambiguous: string[] } {
  const fromNumber = findKnownMbas(line.invoiceNumber, known)
  if (fromNumber.length === 1) return { mba: fromNumber[0]!, source: "invoice_number", ambiguous: [] }
  const fromText = fromNumber.length ? fromNumber : findKnownMbas(line.billText, known)
  const own = [
    ...findKnownMbas(line.description, known),
    ...findKnownMbas(line.tracking.join(" "), known),
  ]
  if (fromText.length === 1) return { mba: fromText[0]!, source: "description", ambiguous: [] }
  if (fromText.length > 1) {
    const pick = [...new Set(own.filter((m) => fromText.includes(m)))]
    if (pick.length === 1) return { mba: pick[0]!, source: "tracking", ambiguous: [] }
    return { mba: null, source: null, ambiguous: fromText }
  }
  const ownSet = [...new Set(own)]
  if (ownSet.length === 1) return { mba: ownSet[0]!, source: "tracking", ambiguous: [] }
  return { mba: null, source: null, ambiguous: ownSet }
}

function base(line: ParsedBillLine): MatchedBillLine {
  const { billedMonth, deliveredMonth } = assignBillLineMonths({
    issueDate: line.issueDate,
    weekDate: line.supplierKind === "channel_factory" ? null : line.weekDate,
  })
  const split = splitRebate(line.exGstCents, line.supplierKind === "advertising_associates")
  return {
    ...line,
    billedMonth,
    deliveredMonth,
    statusClass: classifyBillStatus(line.status),
    ...split,
    mbaNumber: null,
    mbaSource: null,
    publisher: null,
    state: "unmatched",
    method: null,
    lineItemId: null,
    inReport: false,
    clientId: null,
    clientName: "",
    candidates: [],
    reason: "",
    savedMatch: null,
  }
}

/** Canonical plan line id for map keys and lookups (MB-11). */
function lineKey(lineItemId: string): string {
  return toBillingOverrideLineItemId(lineItemId).toLowerCase()
}

function withClient(out: MatchedBillLine, ctx: BillMatchContext): MatchedBillLine {
  if (out.mbaNumber) {
    const c = ctx.mbaClients.get(out.mbaNumber)
    if (c) {
      out.clientId = c.clientId
      out.clientName = c.clientName
    }
  }
  return out
}

function setMatched(out: MatchedBillLine, line: BillPlanLine, method: MatchMethod, reason: string): void {
  out.state = "matched"
  out.method = method
  out.lineItemId = line.lineItemId
  out.inReport = line.inReport
  out.mbaNumber = out.mbaNumber ?? line.mbaNumber
  out.reason = line.inReport ? reason : `${reason}; line is not fixed cost (not in this report)`
}

function matchChannelFactory(out: MatchedBillLine, ctx: BillMatchContext, byId: Map<string, BillPlanLine>): void {
  out.publisher = "Channel Factory"
  if (out.kind === "fee") {
    out.state = "fee"
    out.reason = "CF 7.5% fee line: a fee, not line media cost"
    return
  }
  if (!out.plId) {
    out.reason = "No CF placement id (PL...) on the line"
    return
  }
  if (!ctx.cfPlacements) {
    out.reason = "CF delivery file could not be read, so placements cannot be mapped"
    return
  }
  const ids = ctx.cfPlacements.get(out.plId) ?? []
  if (ids.length === 0) {
    out.reason = `${out.plId} is not in the CF delivery file`
    return
  }
  if (ids.length > 1) {
    out.state = "ambiguous"
    out.candidates = [...ids]
    out.reason = `${out.plId} maps to ${ids.length} plan lines in the CF delivery file`
    return
  }
  const line = byId.get(lineKey(ids[0]!))
  if (!line) {
    out.lineItemId = ids[0]!
    out.reason = `${out.plId} maps to ${ids[0]}, which is not on an approved, booked or completed published plan`
    return
  }
  out.mbaSource = "plan_line"
  setMatched(out, line, "cf_placement", `${out.plId} to ${line.lineItemId} (CF delivery file)`)
}

/**
 * Several lines share the MBA and publisher: keep the lines billed in the
 * delivered month, then the one whose billed amount that month equals the bill
 * line's gross (within `AMOUNT_MATCH_TOLERANCE_CENTS`). Month alone never
 * picks a line: on live data (27 Oct) it picked the wrong line in 2 of 6 cases
 * (golf025 news.com.au 62.86 to the Herald Sun line; boss011 The Land to the
 * Queensland Country Life line), because the plan's billing month and the bill
 * line's week often differ. A line-month taken by an amount match is not
 * offered to a second bill line of the same amount (two 2,134 lines, one
 * plan month of 2,134).
 */
function narrow(
  out: MatchedBillLine,
  candidates: BillPlanLine[],
  usedByAmount: Set<string>
): { line: BillPlanLine | null; method: MatchMethod | null; left: BillPlanLine[] } {
  if (candidates.length === 1) return { line: candidates[0]!, method: "mba_publisher", left: candidates }
  const inMonth = candidates.filter((c) => (c.billedByMonth.get(out.deliveredMonth) ?? 0) !== 0)
  const pool = inMonth.length ? inMonth : candidates
  const byAmount = pool.filter(
    (c) =>
      !usedByAmount.has(`${c.lineItemId}|${out.deliveredMonth}`) &&
      Math.abs((c.billedByMonth.get(out.deliveredMonth) ?? 0) - out.grossCents) <= AMOUNT_MATCH_TOLERANCE_CENTS
  )
  if (byAmount.length === 1) {
    usedByAmount.add(`${byAmount[0]!.lineItemId}|${out.deliveredMonth}`)
    return { line: byAmount[0]!, method: "mba_publisher_month_amount", left: byAmount }
  }
  return { line: null, method: null, left: pool }
}

function matchByMbaAndPublisher(out: MatchedBillLine, ctx: BillMatchContext, usedByAmount: Set<string>): void {
  const mba = resolveBillLineMba(out, ctx.knownMbas)
  out.mbaNumber = mba.mba
  out.mbaSource = mba.source

  let target: ResolvedPublisher | null
  if (out.supplierKind === "direct_publisher") {
    target = ctx.directPublisherFor(out.supplierName)
    if (!target) {
      out.reason = `Direct bill from ${out.supplierName}: no direct publisher set up for it`
    }
  } else {
    target = out.mediaOwnerText ? ctx.resolveMediaOwner(out.mediaOwnerText) : null
    if (!target) out.reason = `Media owner "${out.mediaOwnerText || "(none)"}" not recognised`
    else if (target.billingAgency !== AA) {
      out.reason = `${target.name} is not an Advertising Associates publisher`
      out.publisher = target.name
      target = null
    }
  }
  if (target) out.publisher = target.name

  if (out.kind === "production") {
    out.state = "production"
    out.reason = "Production, talent, installation or hot read: kept out of media cost"
    return
  }
  if (out.kind === "fee") {
    out.state = "fee"
    out.reason = "Fee line: kept out of media cost"
    return
  }
  if (!mba.mba) {
    if (mba.ambiguous.length) {
      out.state = "ambiguous"
      out.candidates = mba.ambiguous
      out.reason = `Bill names ${mba.ambiguous.length} MBAs (${mba.ambiguous.join(", ")})`
    } else if (!out.reason) {
      out.reason = "No MBA in the invoice number, descriptions or tracking"
    } else {
      out.reason = `No MBA; ${out.reason}`
    }
    return
  }
  if (!target) return

  const wantAgency = out.supplierKind === "advertising_associates" ? AA : target.billingAgency
  const candidates = ctx.planLines.filter(
    (l) => l.mbaNumber === mba.mba && eqName(l.publisher, target.name) && l.billingAgency === wantAgency
  )
  if (candidates.length === 0) {
    out.reason = `No ${target.name} line on ${mba.mba}`
    return
  }
  const pick = narrow(out, candidates, usedByAmount)
  if (pick.line && pick.method) {
    setMatched(out, pick.line, pick.method, `${mba.mba} + ${target.name}${pick.method === "mba_publisher" ? " (only line)" : " + month + amount"}`)
    return
  }
  out.state = "ambiguous"
  out.candidates = pick.left.map((l) => l.lineItemId)
  out.reason = `${pick.left.length} ${target.name} lines on ${mba.mba} fit; match by hand`
}

function savedFor(line: ParsedBillLine, ctx: BillMatchContext): SavedBillLineMatch | undefined {
  if (!ctx.savedMatches?.size || !line.xeroLineItemId) return undefined
  return ctx.savedMatches.get(savedMatchKey(line.xeroInvoiceId, line.xeroLineItemId))
}

function money(cents: number): string {
  return (cents / 100).toFixed(2)
}

/**
 * Apply a saved manual match. Returns true when the saved match decided the
 * line (matched, or its plan line is missing); false when it is stale and
 * the automatic rules should run instead.
 */
function applySavedMatch(
  out: MatchedBillLine,
  saved: SavedBillLineMatch,
  byId: ReadonlyMap<string, BillPlanLine>
): boolean {
  const state: SavedMatchState = {
    id: saved.id,
    lineItemId: saved.lineItemId,
    month: saved.month,
    matchedBy: saved.matchedBy,
    matchedAt: saved.matchedAt,
    note: saved.note,
    stale: false,
    lineMissing: false,
  }
  out.savedMatch = state
  if (saved.amountCents !== out.exGstCents) {
    state.stale = true
    return false
  }
  out.mbaNumber = saved.mbaNumber
  out.mbaSource = "manual"
  out.deliveredMonth = saved.month
  const line = byId.get(lineKey(saved.lineItemId))
  if (!line || line.mbaNumber !== saved.mbaNumber) {
    state.lineMissing = true
    out.state = "unmatched"
    out.lineItemId = saved.lineItemId
    out.reason = `Saved match to ${saved.lineItemId}: that line is not on an approved, booked or completed published plan of ${saved.mbaNumber}`
    return true
  }
  out.publisher = line.publisher
  setMatched(out, line, "manual", `Saved match by ${saved.matchedBy}`)
  return true
}

/** Match every parsed bill line. Saved manual matches first. Order is kept. */
export function matchBillLines(lines: readonly ParsedBillLine[], ctx: BillMatchContext): MatchedBillLine[] {
  const byId = new Map<string, BillPlanLine>()
  for (const l of ctx.planLines) {
    const id = lineKey(l.lineItemId)
    if (!byId.has(id)) byId.set(id, l)
  }
  const usedByAmount = new Set<string>()
  // Saved matches take their line-month before any amount tie-break runs.
  for (const line of lines) {
    const saved = savedFor(line, ctx)
    if (saved && saved.amountCents === line.exGstCents) usedByAmount.add(`${lineKey(saved.lineItemId)}|${saved.month}`)
  }
  return lines.map((line) => {
    const out = base(line)
    if (out.currency !== "AUD") {
      out.reason = `Bill in ${out.currency}, not AUD`
      return out
    }
    const saved = savedFor(line, ctx)
    if (saved && applySavedMatch(out, saved, byId)) return withClient(out, ctx)
    if (line.supplierKind === "channel_factory") matchChannelFactory(out, ctx, byId)
    else matchByMbaAndPublisher(out, ctx, usedByAmount)
    if (out.savedMatch?.stale && saved) {
      out.reason = `Saved match not applied: the bill line was ${money(saved.amountCents)} when matched and is now ${money(out.exGstCents)}. Match it again. ${out.reason}`.trim()
    }
    return withClient(out, ctx)
  })
}

/** Bill cost for one plan line and month. Net is after the AA rebate. */
export type BillCostCell = {
  lineItemId: string
  month: string
  /** "billed": the bill's issue month (margin). "delivered": the week date. */
  basis: "billed" | "delivered"
  countedGrossCents: number
  countedRebateCents: number
  countedNetCents: number
  pendingNetCents: number
  methods: MatchMethod[]
  statuses: string[]
  supplierKinds: string[]
}

/** Matched media bill lines to cost cells per plan line and month, on both month bases. */
export function billCostCells(lines: readonly MatchedBillLine[]): BillCostCell[] {
  const acc = new Map<string, BillCostCell>()
  for (const l of lines) {
    if (l.state !== "matched" || !l.lineItemId || l.statusClass === "ignored") continue
    for (const basis of ["billed", "delivered"] as const) {
      const month = basis === "billed" ? l.billedMonth : l.deliveredMonth
      const key = `${l.lineItemId}|${month}|${basis}`
      const c =
        acc.get(key) ??
        ({
          lineItemId: l.lineItemId,
          month,
          basis,
          countedGrossCents: 0,
          countedRebateCents: 0,
          countedNetCents: 0,
          pendingNetCents: 0,
          methods: [],
          statuses: [],
          supplierKinds: [],
        } satisfies BillCostCell)
      if (l.statusClass === "counted") {
        c.countedGrossCents += l.grossCents
        c.countedRebateCents += l.rebateCents
        c.countedNetCents += l.netCents
      } else {
        c.pendingNetCents += l.netCents
      }
      if (l.method && !c.methods.includes(l.method)) c.methods.push(l.method)
      if (!c.statuses.includes(l.status)) c.statuses.push(l.status)
      if (!c.supplierKinds.includes(l.supplierKind)) c.supplierKinds.push(l.supplierKind)
      acc.set(key, c)
    }
  }
  return [...acc.values()]
}

export type BillMatchTotals = {
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

/** Ex GST (gross) dollars by match state, per supplier kind. Counted and pending bills. */
export function summariseBillMatches(lines: readonly MatchedBillLine[]): BillMatchTotals[] {
  const by = new Map<string, BillMatchTotals>()
  for (const l of lines) {
    if (l.statusClass === "ignored") continue
    const t =
      by.get(l.supplierKind) ??
      ({
        supplierKind: l.supplierKind,
        lines: 0,
        totalCents: 0,
        matchedCents: 0,
        matchedInReportCents: 0,
        ambiguousCents: 0,
        unmatchedCents: 0,
        feeCents: 0,
        productionCents: 0,
        pendingCents: 0,
      } satisfies BillMatchTotals)
    t.lines += 1
    t.totalCents += l.grossCents
    if (l.statusClass === "pending") t.pendingCents += l.grossCents
    if (l.state === "matched") {
      t.matchedCents += l.grossCents
      if (l.inReport) t.matchedInReportCents += l.grossCents
    } else if (l.state === "ambiguous") t.ambiguousCents += l.grossCents
    else if (l.state === "fee") t.feeCents += l.grossCents
    else if (l.state === "production") t.productionCents += l.grossCents
    else t.unmatchedCents += l.grossCents
    by.set(l.supplierKind, t)
  }
  return [...by.values()].sort((a, b) => a.supplierKind.localeCompare(b.supplierKind))
}
