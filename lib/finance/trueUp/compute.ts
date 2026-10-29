/**
 * Monthly true-up, Stage 1 (read only). Pure: no DB, no clock.
 *
 * Compares what was invoiced in Xero with the billing-basis schedule_months
 * on each MBA's current published version, by component and month, to the
 * end of the as-of month. Design: av-review DESIGN-AV-true-up-2026-10-29.md.
 *
 * Luke's decisions (29 Oct 2026, 21:18):
 * - 3: invoiced = AUTHORISED or PAID and sent to the contact. Drafts (and
 *   authorised but unsent) are provisional: shown, never counted. Credit
 *   notes count when authorised.
 * - 4: a gap under $1 per MBA and component is not flagged.
 * - 5: all four components (fee, ad serving, production, media).
 * - 2: the month is the issue month, shifted by the client's billing timing
 *   (0109: month ahead = issue month + 1, in arrears = issue month - 1),
 *   unless finance assigned the invoice to a record by hand
 *   (matched_by = 'manual'): then the record's month wins. A hand link in
 *   true_up_invoice_links wins over everything. Automatic matches only name
 *   the MBA (Stage 2 decision 3). The nightly matcher allows plus or minus
 *   one month without a PO, and on 29 Oct 18 sent invoices sat on the wrong
 *   month that way (golf023 and golf024 prebills, hartm001 and others).
 * - Stage 2 ledger (0109): a gap finance marked explained, or recorded as a
 *   one-off or credit note to raise, shows as Explained or To raise while
 *   the gap stays within $1 of the recorded amount.
 *
 * Sign: gap = invoiced minus scheduled. Plus = credit due to the client.
 * Minus = charge due. All money is integer cents ex GST.
 */

import { matchMbaAgainstMasters, type MbaMaster } from "@/lib/xero/matchMba"
import { toCents } from "@/lib/money"

export const TRUE_UP_COMPONENTS = ["fee", "adserving", "production", "media"] as const
export type TrueUpComponent = (typeof TRUE_UP_COMPONENTS)[number]

export const TRUE_UP_COMPONENT_LABELS: Record<TrueUpComponent, string> = {
  fee: "Fee",
  adserving: "Ad serving",
  production: "Production",
  media: "Media",
}

/** Decision 4: gaps under $1 per MBA and component are matches. */
export const TRUE_UP_THRESHOLD_CENTS = 100

export type TrueUpStatus =
  | "matches"
  | "billed_ahead"
  | "gap"
  | "no_invoice"
  | "ended"
  | "schedule_incomplete"
  | "explained"
  | "to_raise"

export const TRUE_UP_STATUS_LABELS: Record<TrueUpStatus, string> = {
  matches: "Matches",
  billed_ahead: "Billed ahead",
  gap: "Gap",
  no_invoice: "No invoice",
  ended: "Ended",
  schedule_incomplete: "Schedule incomplete",
  explained: "Explained",
  to_raise: "To raise",
}

export type TrueUpBillingTiming = "same_month" | "month_ahead" | "in_arrears"

/** true_up_invoice_links rows (0109). */
export type TrueUpInvoiceLinkSqlRow = {
  xero_invoice_id: string
  mba_number: string
  /** YYYY-MM or YYYY-MM-DD; null = the attribution rule's month. */
  billing_month: string | null
}

/** Applied true_up_actions rows (0109). Signed cents: + credit, - charge. */
export type TrueUpActionSqlRow = {
  id: number | string
  mba_number: string
  component: string
  action: string
  gap_cents: number | string
  amount_cents: number | string
  as_of_month: string
  billing_revision_id: number | string | null
  reason_code: string | null
  note: string | null
  xero_invoice_id: string | null
  created_at: string
  created_by_name: string | null
  months?: string[] | null
  strategy?: string | null
}

export type TrueUpActionRef = {
  id: number
  component: TrueUpComponent
  action: "schedule" | "explained" | "one_off" | "credit_note"
  gapCents: Cents
  amountCents: Cents
  asOfMonth: string
  billingRevisionId: number | null
  reasonCode: string | null
  note: string | null
  xeroInvoiceId: string | null
  createdAt: string
  createdByName: string | null
  months: string[]
  strategy: string | null
}

type Cents = number
type ComponentCents = Record<TrueUpComponent, Cents>

function zeroCents(): ComponentCents {
  return { fee: 0, adserving: 0, production: 0, media: 0 }
}

// ---------------------------------------------------------------------------
// Inputs (the loader's SQL row shapes)

export type TrueUpPlanSqlRow = {
  master_id: number | string
  mba_number: string | null
  client_id: number | string | null
  mp_client_name: string | null
  campaign_name: string | null
  campaign_status: string | null
  campaign_end_date: string | null
  version_id: number | string
  version_number: number | string | null
}

/** Billing-basis schedule_months for one published version and month. */
export type TrueUpScheduleSqlRow = {
  mba_number: string | null
  month: string
  fee_cents: number | string | null
  adserving_cents: number | string | null
  /** All component = media rows, including production and client-pays rows. */
  media_cents: number | string | null
  service_production_cents: number | string | null
  line_production_cents: number | string | null
  client_pays_media_cents: number | string | null
}

export type TrueUpXeroLine = {
  ItemCode?: string | null
  AccountCode?: string | null
  LineAmount?: number | string | null
  TaxAmount?: number | string | null
  Description?: string | null
  Tracking?: Array<{ Name?: string | null; Option?: string | null }> | null
}

export type TrueUpInvoiceSqlRow = {
  xero_invoice_id: string
  invoice_number: string | null
  status: string | null
  issue_date: string | null
  mba_number: string | null
  reference_raw: string | null
  sent_to_contact: string | boolean | null
  invoice_type: string | null
  line_amount_types: string | null
  line_items_json: TrueUpXeroLine[] | string | null
}

/** finance_billing_records rows that carry a Xero match (media keys only). */
export type TrueUpMatchedRecordSqlRow = {
  xero_invoice_id: string
  invoice_key: string
  mba_number: string | null
  billing_month: string | null
  /** 'manual' = finance assigned it in Clients billing. Anything else is the nightly matcher. */
  matched_by?: string | null
}

export type TrueUpInput = {
  /** Last month in scope, "YYYY-MM". */
  asOfMonth: string
  /** First month in scope, "YYYY-MM". Default: the July that starts the financial year. */
  fromMonth: string
  plans: TrueUpPlanSqlRow[]
  schedule: TrueUpScheduleSqlRow[]
  invoices: TrueUpInvoiceSqlRow[]
  matchedRecords: TrueUpMatchedRecordSqlRow[]
  /** Last Xero invoice sync, for the header. */
  xeroSyncedAt?: string | null
  generatedAt?: string
  /** 0109 (absent until the marker exists). */
  invoiceLinks?: TrueUpInvoiceLinkSqlRow[]
  /** clients.id -> billing timing (0109). */
  billingTiming?: Record<string, TrueUpBillingTiming | null | undefined>
  /** Applied true_up_actions (0109). */
  actions?: TrueUpActionSqlRow[]
}

// ---------------------------------------------------------------------------
// Months

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export function isTrueUpMonth(value: unknown): value is string {
  return typeof value === "string" && MONTH_RE.test(value)
}

export function addMonths(month: string, delta: number): string {
  const [ys, ms] = month.split("-")
  const idx = Number(ys) * 12 + (Number(ms) - 1) + delta
  const y = Math.floor(idx / 12)
  const m = (idx % 12) + 1
  return `${y}-${String(m).padStart(2, "0")}`
}

export function monthRange(from: string, to: string): string[] {
  const out: string[] = []
  if (!isTrueUpMonth(from) || !isTrueUpMonth(to) || from > to) return out
  let m = from
  while (m <= to && out.length < 120) {
    out.push(m)
    m = addMonths(m, 1)
  }
  return out
}

/** The July that starts the Australian financial year holding `month`. */
export function financialYearStart(month: string): string {
  const [ys, ms] = month.split("-")
  const y = Number(ys)
  return Number(ms) >= 7 ? `${y}-07` : `${y - 1}-07`
}

/** Default as-of month: the month before `todayIso` (YYYY-MM-DD, Sydney). */
export function defaultTrueUpAsOf(todayIso: string): string {
  return addMonths(todayIso.slice(0, 7), -1)
}

function monthOf(value: string | null | undefined): string | null {
  const s = String(value ?? "").trim().slice(0, 7)
  return isTrueUpMonth(s) ? s : null
}

// ---------------------------------------------------------------------------
// Xero lines

export type LineClass = TrueUpComponent | "excluded"

function normCode(code: unknown): string {
  return String(code ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
}

/**
 * Fee = Service / 21403. Ad serving = T.Adserving / 21404. Production =
 * D.Production, G.Production (with or without a space), Production.
 * Retainer, SOW and SEO lines are out of scope. Everything else is media.
 */
export function classifyXeroLine(line: Pick<TrueUpXeroLine, "ItemCode" | "AccountCode">): LineClass {
  const code = normCode(line.ItemCode)
  const account = String(line.AccountCode ?? "").trim()
  if (code === "retainer" || code === "sow" || code.endsWith("seo") || code.endsWith(".seo")) return "excluded"
  if (code === "service" || account === "21403") return "fee"
  if (code === "t.adserving" || account === "21404") return "adserving"
  if (code === "production" || code === "d.production" || code === "g.production") return "production"
  return "media"
}

function num(value: unknown): number {
  if (value == null || value === "") return 0
  const n = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""))
  return Number.isFinite(n) ? n : 0
}

function intCents(value: unknown): number {
  const n = num(value)
  return Math.round(n)
}

/** Ex-GST line amount in cents. Inclusive invoices carry tax inside LineAmount. */
export function lineExGstCents(line: TrueUpXeroLine, lineAmountTypes: string | null): number {
  const amount = num(line.LineAmount)
  const tax = num(line.TaxAmount)
  const ex = String(lineAmountTypes ?? "").trim().toLowerCase() === "inclusive" ? amount - tax : amount
  return toCents(ex)
}

export type InvoiceCountState = "counted" | "provisional" | "ignored"

function isTrue(value: unknown): boolean {
  if (value === true) return true
  return String(value ?? "").trim().toLowerCase() === "true"
}

export function isCreditNote(row: Pick<TrueUpInvoiceSqlRow, "invoice_type">): boolean {
  return String(row.invoice_type ?? "").trim().toUpperCase() === "ACCRECCREDIT"
}

/** Decision 3. Voided and deleted are ignored. */
export function invoiceCountState(
  row: Pick<TrueUpInvoiceSqlRow, "status" | "sent_to_contact" | "invoice_type">,
): InvoiceCountState {
  const status = String(row.status ?? "").trim().toUpperCase()
  if (status === "VOIDED" || status === "DELETED" || status === "") return "ignored"
  if (status === "AUTHORISED" || status === "PAID") {
    if (isCreditNote(row)) return "counted"
    return isTrue(row.sent_to_contact) ? "counted" : "provisional"
  }
  return "provisional"
}

function parseLines(raw: TrueUpInvoiceSqlRow["line_items_json"]): TrueUpXeroLine[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? (parsed as TrueUpXeroLine[]) : []
    } catch {
      return []
    }
  }
  return []
}

// ---------------------------------------------------------------------------
// Attribution

export type AttributionSource = "hand_link" | "matched_record" | "line_tracking" | "invoice_mba"

export type AttributedLine = {
  xeroInvoiceId: string
  invoiceNumber: string
  issueDate: string | null
  component: TrueUpComponent
  cents: Cents
  state: Exclude<InvoiceCountState, "ignored">
  mbaKey: string
  month: string
  source: AttributionSource
}

export type UnattributedLine = {
  xeroInvoiceId: string
  invoiceNumber: string
  issueDate: string | null
  reference: string
  component: TrueUpComponent
  cents: Cents
  state: Exclude<InvoiceCountState, "ignored">
  description: string
  reason: "no_mba" | "mba_not_published"
}

/** MBA join key. Stored MBA numbers mix case (bicau008, BICAU002). */
export function mbaKey(mba: string | null | undefined): string {
  return String(mba ?? "").trim().toLowerCase()
}

function trackingMba(line: TrueUpXeroLine, masters: MbaMaster[]): string | null {
  for (const t of line.Tracking ?? []) {
    const option = String(t?.Option ?? "").trim()
    if (!option) continue
    const hit = matchMbaAgainstMasters(option, masters)
    if (hit.matched && hit.kind === "mba") return mbaKey(hit.mba_number)
  }
  return null
}

/**
 * Attribute every in-scope line of every counted or provisional invoice to an
 * MBA and billing month. MBA, first hit wins:
 * 1. the matched Clients billing record;
 * 2. the line's Client/Campaign tracking (matchMbaAgainstMasters);
 * 3. the invoice's own MBA (parsed from the reference).
 * Month: the record's billing month when finance assigned it by hand, else
 * the issue month. Lines with no MBA are unattributed.
 */
export function attributeInvoiceLines(input: {
  invoices: TrueUpInvoiceSqlRow[]
  matchedRecords: TrueUpMatchedRecordSqlRow[]
  masters: MbaMaster[]
  publishedMbaKeys: Set<string>
  /** 0109 hand links: invoice -> MBA (and month). Wins over everything. */
  invoiceLinks?: TrueUpInvoiceLinkSqlRow[]
  /** MBA key -> billing timing of its client (0109). */
  timingByMba?: Map<string, TrueUpBillingTiming>
}): { lines: AttributedLine[]; unattributed: UnattributedLine[] } {
  const links = new Map<string, { mbaKey: string; month: string | null }>()
  for (const l of input.invoiceLinks ?? []) {
    const key = mbaKey(l.mba_number)
    if (l.xero_invoice_id && key) links.set(l.xero_invoice_id, { mbaKey: key, month: monthOf(l.billing_month) })
  }
  const shift = (key: string, month: string | null): string | null => {
    if (!month) return month
    const timing = input.timingByMba?.get(key)
    if (timing === "month_ahead") return addMonths(month, 1)
    if (timing === "in_arrears") return addMonths(month, -1)
    return month
  }
  const recordsByInvoice = new Map<string, Array<{ mbaKey: string; month: string; manual: boolean }>>()
  for (const r of input.matchedRecords) {
    const month = monthOf(r.billing_month)
    const key = mbaKey(r.mba_number)
    if (!r.xero_invoice_id || !month || !key) continue
    const list = recordsByInvoice.get(r.xero_invoice_id) ?? []
    list.push({ mbaKey: key, month, manual: String(r.matched_by ?? "").trim().toLowerCase() === "manual" })
    recordsByInvoice.set(r.xero_invoice_id, list)
  }

  const lines: AttributedLine[] = []
  const unattributed: UnattributedLine[] = []

  for (const inv of input.invoices) {
    const state = invoiceCountState(inv)
    if (state === "ignored") continue
    const sign = isCreditNote(inv) ? -1 : 1
    const issueMonth = monthOf(inv.issue_date)
    const records = recordsByInvoice.get(inv.xero_invoice_id) ?? []
    const recordMbas = [...new Set(records.map((r) => r.mbaKey))]
    const invoiceMba = mbaKey(inv.mba_number)

    for (const line of parseLines(inv.line_items_json)) {
      const cls = classifyXeroLine(line)
      if (cls === "excluded") continue
      const cents = sign * lineExGstCents(line, inv.line_amount_types)
      if (cents === 0) continue

      let key: string | null = null
      let source: AttributionSource | null = null
      const link = links.get(inv.xero_invoice_id)
      if (link) {
        key = link.mbaKey
        source = "hand_link"
      } else if (recordMbas.length === 1) {
        key = recordMbas[0]!
        source = "matched_record"
      } else {
        const tracked = trackingMba(line, input.masters)
        if (tracked && (recordMbas.length === 0 || recordMbas.includes(tracked))) {
          key = tracked
          source = recordMbas.includes(tracked) ? "matched_record" : "line_tracking"
        } else if (invoiceMba) {
          key = invoiceMba
          source = "invoice_mba"
        }
      }

      let month = key ? shift(key, issueMonth) : issueMonth
      if (key && source === "hand_link" && link?.month) month = link.month
      if (key && (source === "matched_record" || source === "hand_link") && !link?.month) {
        const months = [
          ...new Set(records.filter((r) => r.mbaKey === key && r.manual).map((r) => r.month)),
        ].sort()
        if (months.length === 1) month = months[0]!
        else if (months.length > 1) month = issueMonth && months.includes(issueMonth) ? issueMonth : months[0]!
      }

      const base = {
        xeroInvoiceId: inv.xero_invoice_id,
        invoiceNumber: String(inv.invoice_number ?? ""),
        issueDate: inv.issue_date ? String(inv.issue_date).slice(0, 10) : null,
        component: cls,
        cents,
        state,
      }
      if (!key || !month) {
        unattributed.push({
          ...base,
          reference: String(inv.reference_raw ?? ""),
          description: String(line.Description ?? "").slice(0, 200),
          reason: "no_mba",
        })
        continue
      }
      if (!input.publishedMbaKeys.has(key)) {
        unattributed.push({
          ...base,
          reference: String(inv.reference_raw ?? ""),
          description: String(line.Description ?? "").slice(0, 200),
          reason: "mba_not_published",
        })
        continue
      }
      lines.push({ ...base, mbaKey: key, month, source: source! })
    }
  }
  return { lines, unattributed }
}

// ---------------------------------------------------------------------------
// Schedule

export type ScheduleMonthCents = ComponentCents & {
  /** Production rows came from both the synthetic and per-line production. */
  productionCountedTwice: boolean
}

/**
 * Billing-basis cents by component. Production = the synthetic
 * __service__production rows plus per-line production rows. Media = the
 * media rows less production and less client-pays media (the client pays the
 * publisher, so the agency never invoices it).
 */
export function scheduleCentsFromRow(row: TrueUpScheduleSqlRow): ScheduleMonthCents {
  const svc = intCents(row.service_production_cents)
  const lineProd = intCents(row.line_production_cents)
  const mediaAll = intCents(row.media_cents)
  const clientPays = intCents(row.client_pays_media_cents)
  return {
    fee: intCents(row.fee_cents),
    adserving: intCents(row.adserving_cents),
    production: svc + lineProd,
    media: mediaAll - svc - lineProd - clientPays,
    productionCountedTwice: svc !== 0 && lineProd !== 0,
  }
}

// ---------------------------------------------------------------------------
// Report

export type TrueUpMonthCell = {
  scheduled: Cents
  invoiced: Cents
  provisional: Cents
  gap: Cents
  runningGap: Cents
}

export type TrueUpMonthRow = {
  month: string
  invoiceNumbers: string[]
  provisionalInvoiceNumbers: string[]
  components: Record<TrueUpComponent, TrueUpMonthCell>
}

export type TrueUpComponentSummary = {
  component: TrueUpComponent
  scheduledToDate: Cents
  invoicedToDate: Cents
  provisionalToDate: Cents
  gap: Cents
  status: TrueUpStatus
  /** Scheduled after the as-of month. */
  remainingScheduled: Cents
  remainingMonths: string[]
  /** Whole future months the over-billing already pays for. */
  coveredMonths: string[]
  /** The gap left after the covered months (equals gap when none are covered). */
  uncoveredGap: Cents
  suggestion: string
  /** The status before an explained, one-off or credit-note record (equals status when none applies). */
  underlyingStatus: TrueUpStatus
  /** The ledger entry behind an Explained or To raise status. */
  coveredBy: TrueUpActionRef | null
}

export type TrueUpMbaRow = {
  mbaNumber: string
  clientName: string
  clientsId: number | null
  campaignName: string
  campaignStatus: string
  campaignEndMonth: string | null
  versionId: number
  versionNumber: number | null
  /** The worst status across components (gap first). */
  status: TrueUpStatus
  components: Record<TrueUpComponent, TrueUpComponentSummary>
  months: TrueUpMonthRow[]
  hasProvisional: boolean
  notes: string[]
  /** Applied ledger entries for this MBA, newest first (0109). */
  actions: TrueUpActionRef[]
}

export type TrueUpReport = {
  asOfMonth: string
  fromMonth: string
  generatedAt: string | null
  xeroSyncedAt: string | null
  thresholdCents: Cents
  /** Draft or unsent invoices issued in the window, not counted. */
  provisionalInvoices: number
  totals: {
    gapByComponent: ComponentCents
    chargeByComponent: ComponentCents
    creditByComponent: ComponentCents
    mbasByStatus: Record<TrueUpStatus, number>
    mbasNeedingAction: number
  }
  rows: TrueUpMbaRow[]
  unattributed: UnattributedLine[]
  /** 0109 read (invoice links, billing timing, ledger). False until the marker exists. */
  stage2Ready: boolean
  /** clients.id -> billing timing (same month is absent). */
  billingTiming: Record<string, TrueUpBillingTiming>
}

const STATUS_RANK: Record<TrueUpStatus, number> = {
  gap: 0,
  ended: 1,
  no_invoice: 2,
  schedule_incomplete: 3,
  to_raise: 4,
  billed_ahead: 5,
  explained: 6,
  matches: 7,
}

export function needsAction(status: TrueUpStatus): boolean {
  return status === "gap" || status === "ended" || status === "no_invoice" || status === "schedule_incomplete"
}

function idOrNull(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null
}

function suggestionFor(summary: Omit<TrueUpComponentSummary, "suggestion" | "underlyingStatus" | "coveredBy">): string {
  const credit = summary.uncoveredGap > 0
  const ahead =
    summary.coveredMonths.length > 0 ? `Billed ahead for ${summary.coveredMonths.join(", ")}. ` : ""
  switch (summary.status) {
    case "matches":
    case "explained":
      return ""
    case "to_raise":
      return credit ? "Credit recorded to raise. Clears when the credit note syncs" : "Charge recorded to raise. Clears when the invoice syncs"
    case "billed_ahead":
      return summary.coveredMonths.length > 0
        ? `Billed ahead. Don't invoice ${summary.coveredMonths.join(", ")} again`
        : "Billed ahead"
    case "schedule_incomplete":
      return "The plan schedules none of this. Republish the plan with the right settings"
    case "no_invoice":
      return "No invoice found. Check it was billed"
    case "ended":
      return credit ? "Campaign ended. Raise a one-off credit" : "Campaign ended. Raise a one-off charge"
    case "gap": {
      const open = summary.remainingMonths.filter((m) => !summary.coveredMonths.includes(m))
      if (open.length > 1) {
        return `${ahead}${credit ? "Spread the credit over the remaining months" : "Spread the charge over the remaining months"}`
      }
      if (open.length === 1) {
        return `${ahead}${credit ? "Carry the credit to next month" : "Carry the charge to next month"}`
      }
      return `${ahead}${credit ? "No months left. Raise a one-off credit" : "No months left. Raise a one-off charge"}`
    }
  }
}

function parseActions(rows: TrueUpActionSqlRow[] | undefined): Map<string, TrueUpActionRef[]> {
  const out = new Map<string, TrueUpActionRef[]>()
  for (const r of rows ?? []) {
    const component = String(r.component ?? "") as TrueUpComponent
    if (!TRUE_UP_COMPONENTS.includes(component)) continue
    const action = String(r.action ?? "") as TrueUpActionRef["action"]
    if (!["schedule", "explained", "one_off", "credit_note"].includes(action)) continue
    const key = mbaKey(r.mba_number)
    if (!key) continue
    const ref: TrueUpActionRef = {
      id: Number(r.id),
      component,
      action,
      gapCents: Math.round(num(r.gap_cents)),
      amountCents: Math.round(num(r.amount_cents)),
      asOfMonth: monthOf(r.as_of_month) ?? "",
      billingRevisionId: r.billing_revision_id == null ? null : Number(r.billing_revision_id),
      reasonCode: r.reason_code ?? null,
      note: r.note ?? null,
      xeroInvoiceId: r.xero_invoice_id ?? null,
      createdAt: String(r.created_at ?? ""),
      createdByName: r.created_by_name ?? null,
      months: Array.isArray(r.months) ? r.months.map(String) : [],
      strategy: r.strategy ?? null,
    }
    const list = out.get(key) ?? []
    list.push(ref)
    out.set(key, list)
  }
  for (const list of out.values()) list.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
  return out
}

/**
 * Stage 2 ledger: the newest explained, one-off or credit-note entry for the
 * component covers the gap while the gap stays within $1 of what was
 * recorded (explained: gap_cents; one-off and credit note: amount_cents).
 */
function ledgerCover(
  actions: TrueUpActionRef[],
  component: TrueUpComponent,
  gap: Cents,
): { status: TrueUpStatus; ref: TrueUpActionRef } | null {
  for (const a of actions) {
    if (a.component !== component || a.action === "schedule") continue
    const recorded = a.action === "explained" ? a.gapCents : a.amountCents
    if (Math.abs(gap - recorded) >= TRUE_UP_THRESHOLD_CENTS) continue
    return { status: a.action === "explained" ? "explained" : "to_raise", ref: a }
  }
  return null
}

export function buildTrueUpReport(input: TrueUpInput): TrueUpReport {
  const asOf = input.asOfMonth
  const from = input.fromMonth
  const windowMonths = monthRange(from, asOf)
  const inWindow = (m: string) => m >= from && m <= asOf

  // Plans keyed by MBA (lower case). One published version per master.
  const plans = new Map<string, TrueUpPlanSqlRow>()
  for (const p of input.plans) {
    const key = mbaKey(p.mba_number)
    if (key && !plans.has(key)) plans.set(key, p)
  }
  const masters: MbaMaster[] = []
  for (const p of input.plans) {
    const id = idOrNull(p.master_id)
    const mba = String(p.mba_number ?? "").trim()
    if (id && mba) masters.push({ id, mba_number: mba })
  }

  // Schedule by MBA and month.
  const schedule = new Map<string, Map<string, ScheduleMonthCents>>()
  for (const row of input.schedule) {
    const key = mbaKey(row.mba_number)
    const month = monthOf(row.month)
    if (!key || !month) continue
    const byMonth = schedule.get(key) ?? new Map<string, ScheduleMonthCents>()
    const cents = scheduleCentsFromRow(row)
    const prev = byMonth.get(month)
    byMonth.set(
      month,
      prev
        ? {
            fee: prev.fee + cents.fee,
            adserving: prev.adserving + cents.adserving,
            production: prev.production + cents.production,
            media: prev.media + cents.media,
            productionCountedTwice: prev.productionCountedTwice || cents.productionCountedTwice,
          }
        : cents,
    )
    schedule.set(key, byMonth)
  }

  const timingByMba = new Map<string, TrueUpBillingTiming>()
  for (const [key, p] of plans) {
    const t = input.billingTiming?.[String(p.client_id ?? "")]
    if (t === "month_ahead" || t === "in_arrears") timingByMba.set(key, t)
  }
  const actionsByMba = parseActions(input.actions)

  const { lines, unattributed } = attributeInvoiceLines({
    invoices: input.invoices,
    matchedRecords: input.matchedRecords,
    masters,
    publishedMbaKeys: new Set(plans.keys()),
    invoiceLinks: input.invoiceLinks,
    timingByMba,
  })

  const inScopeLines = lines.filter((l) => inWindow(l.month))
  const linesByMba = new Map<string, AttributedLine[]>()
  for (const l of inScopeLines) {
    const list = linesByMba.get(l.mbaKey) ?? []
    list.push(l)
    linesByMba.set(l.mbaKey, list)
  }

  // MBAs in scope: scheduled billing in the window, or an invoice line in the window.
  const keys = new Set<string>()
  for (const [key, byMonth] of schedule) {
    for (const [m, c] of byMonth) {
      if (inWindow(m) && (c.fee || c.adserving || c.production || c.media)) {
        keys.add(key)
        break
      }
    }
  }
  for (const key of linesByMba.keys()) keys.add(key)

  const rows: TrueUpMbaRow[] = []
  for (const key of keys) {
    const plan = plans.get(key)
    if (!plan) continue
    const byMonth = schedule.get(key) ?? new Map<string, ScheduleMonthCents>()
    const mbaLines = linesByMba.get(key) ?? []
    const countedAny = mbaLines.some((l) => l.state === "counted")
    const endMonth = monthOf(plan.campaign_end_date)
    const notes: string[] = []

    const months: TrueUpMonthRow[] = []
    const running = zeroCents()
    for (const m of windowMonths) {
      const sched = byMonth.get(m)
      if (sched?.productionCountedTwice) notes.push(`${m}: production is in both the synthetic and the line rows`)
      const monthLines = mbaLines.filter((l) => l.month === m)
      const components = {} as Record<TrueUpComponent, TrueUpMonthCell>
      for (const c of TRUE_UP_COMPONENTS) {
        const scheduled = sched ? sched[c] : 0
        let invoiced = 0
        let provisional = 0
        for (const l of monthLines) {
          if (l.component !== c) continue
          if (l.state === "counted") invoiced += l.cents
          else provisional += l.cents
        }
        const gap = invoiced - scheduled
        running[c] += gap
        components[c] = { scheduled, invoiced, provisional, gap, runningGap: running[c] }
      }
      const counted = [...new Set(monthLines.filter((l) => l.state === "counted").map((l) => l.invoiceNumber))].sort()
      const prov = [...new Set(monthLines.filter((l) => l.state === "provisional").map((l) => l.invoiceNumber))].sort()
      months.push({ month: m, invoiceNumbers: counted, provisionalInvoiceNumbers: prov, components })
    }

    const futureMonths = [...byMonth.keys()].filter((m) => m > asOf).sort()
    const summaries = {} as Record<TrueUpComponent, TrueUpComponentSummary>
    for (const c of TRUE_UP_COMPONENTS) {
      let scheduledToDate = 0
      let invoicedToDate = 0
      let provisionalToDate = 0
      for (const mr of months) {
        scheduledToDate += mr.components[c].scheduled
        invoicedToDate += mr.components[c].invoiced
        provisionalToDate += mr.components[c].provisional
      }
      const gap = invoicedToDate - scheduledToDate
      const remainingMonths = futureMonths.filter((m) => (byMonth.get(m)?.[c] ?? 0) > 0)
      let remainingScheduled = 0
      for (const m of remainingMonths) remainingScheduled += byMonth.get(m)![c]
      let planTotal = 0
      for (const v of byMonth.values()) planTotal += v[c]

      let status: TrueUpStatus
      const coveredMonths: string[] = []
      let uncoveredGap = gap
      if (Math.abs(gap) < TRUE_UP_THRESHOLD_CENTS) {
        status = "matches"
      } else if (planTotal === 0 && invoicedToDate > 0) {
        status = "schedule_incomplete"
      } else if (!countedAny && scheduledToDate > 0) {
        status = "no_invoice"
      } else if (endMonth != null && endMonth <= asOf) {
        status = "ended"
      } else {
        // Billed ahead: the over-billing pays for one or more whole future
        // months (prebills, catch-ups that billed next month in full). What
        // is left over after those whole months is a gap like any other.
        let covered = 0
        if (gap > 0) {
          for (const m of remainingMonths) {
            const next = byMonth.get(m)![c]
            if (covered + next > gap + TRUE_UP_THRESHOLD_CENTS) break
            coveredMonths.push(m)
            covered += next
          }
        }
        uncoveredGap = gap - covered
        if (coveredMonths.length > 0 && Math.abs(uncoveredGap) < TRUE_UP_THRESHOLD_CENTS) status = "billed_ahead"
        else status = "gap"
      }
      const underlyingStatus = status
      const cover =
        status === "matches" ? null : ledgerCover(actionsByMba.get(key) ?? [], c, uncoveredGap)
      if (cover) status = cover.status
      const base = {
        component: c,
        scheduledToDate,
        invoicedToDate,
        provisionalToDate,
        gap,
        status,
        remainingScheduled,
        remainingMonths,
        coveredMonths,
        uncoveredGap,
      }
      summaries[c] = { ...base, suggestion: suggestionFor(base), underlyingStatus, coveredBy: cover?.ref ?? null }
    }

    // Skip MBAs with nothing scheduled and nothing invoiced in the window.
    const anyMoney = TRUE_UP_COMPONENTS.some(
      (c) => summaries[c].scheduledToDate !== 0 || summaries[c].invoicedToDate !== 0 || summaries[c].provisionalToDate !== 0,
    )
    if (!anyMoney) continue

    let worst: TrueUpStatus = "matches"
    for (const c of TRUE_UP_COMPONENTS) {
      if (STATUS_RANK[summaries[c].status] < STATUS_RANK[worst]) worst = summaries[c].status
    }

    rows.push({
      mbaNumber: String(plan.mba_number ?? "").trim(),
      clientName: String(plan.mp_client_name ?? "").trim(),
      clientsId: idOrNull(plan.client_id),
      campaignName: String(plan.campaign_name ?? "").trim(),
      campaignStatus: String(plan.campaign_status ?? "").trim(),
      campaignEndMonth: endMonth,
      versionId: Number(plan.version_id),
      versionNumber: idOrNull(plan.version_number),
      status: worst,
      components: summaries,
      months,
      hasProvisional: mbaLines.some((l) => l.state === "provisional"),
      notes: [...new Set(notes)],
      actions: actionsByMba.get(key) ?? [],
    })
  }

  rows.sort((a, b) => {
    const r = STATUS_RANK[a.status] - STATUS_RANK[b.status]
    if (r !== 0) return r
    const c = a.clientName.localeCompare(b.clientName)
    if (c !== 0) return c
    return a.mbaNumber.localeCompare(b.mbaNumber)
  })

  const gapByComponent = zeroCents()
  const chargeByComponent = zeroCents()
  const creditByComponent = zeroCents()
  const mbasByStatus: Record<TrueUpStatus, number> = {
    matches: 0,
    billed_ahead: 0,
    gap: 0,
    no_invoice: 0,
    ended: 0,
    schedule_incomplete: 0,
    explained: 0,
    to_raise: 0,
  }
  let mbasNeedingAction = 0
  for (const row of rows) {
    mbasByStatus[row.status] += 1
    if (needsAction(row.status)) mbasNeedingAction += 1
    for (const c of TRUE_UP_COMPONENTS) {
      const s = row.components[c]
      if (s.status === "matches" || s.status === "billed_ahead" || s.status === "explained") continue
      gapByComponent[c] += s.uncoveredGap
      if (s.uncoveredGap < 0) chargeByComponent[c] += -s.uncoveredGap
      else creditByComponent[c] += s.uncoveredGap
    }
  }

  const provisionalIds = new Set<string>()
  for (const inv of input.invoices) {
    if (invoiceCountState(inv) !== "provisional") continue
    const m = monthOf(inv.issue_date)
    if (m && inWindow(m)) provisionalIds.add(inv.xero_invoice_id)
  }

  return {
    asOfMonth: asOf,
    fromMonth: from,
    generatedAt: input.generatedAt ?? null,
    xeroSyncedAt: input.xeroSyncedAt ?? null,
    thresholdCents: TRUE_UP_THRESHOLD_CENTS,
    provisionalInvoices: provisionalIds.size,
    totals: { gapByComponent, chargeByComponent, creditByComponent, mbasByStatus, mbasNeedingAction },
    rows,
    unattributed: unattributed.filter((u) => {
      const m = monthOf(u.issueDate)
      return m != null && inWindow(m)
    }),
    stage2Ready: input.actions !== undefined,
    billingTiming: Object.fromEntries(
      Object.entries(input.billingTiming ?? {}).filter(
        (e): e is [string, TrueUpBillingTiming] => e[1] === "month_ahead" || e[1] === "in_arrears",
      ),
    ),
  }
}
