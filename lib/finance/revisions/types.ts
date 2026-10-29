/**
 * Billing revisions (design 2026-10-26, option a). Shared types.
 *
 * All money is integer cents. Months are "YYYY-MM".
 * The planner is pure: no DB, no clock. Callers pass locks and the current
 * Sydney month in.
 */

export type Cents = number
export type MonthKey = string

export type LockLevel = "open" | "soft" | "hard"

export type LockReason =
  | "past_month" // before the current Sydney month (a flag, not a level)
  | "approved" // approved_at set, exported_at null -> soft
  | "sent_to_accounts" // exported_at set -> hard
  | "xero_matched" // matched_xero_invoice_id set -> hard
  | "xero_outside_av" // a xero: row for this mba + month -> hard
  | "legacy_billed" // billed = true or billed_at set -> hard
  | "aa_pack_sent" // month covered by a sent AA pack (AA lines only) -> hard
  | "finance_period_locked" // finance_periods locked, only when FINANCE_PERIODS=on -> hard
  | "after_campaign" // after the campaign end month -> hard

export type MonthLock = {
  month: MonthKey
  level: LockLevel
  reasons: LockReason[]
  /** True when the month is before the current Sydney month. */
  past: boolean
}

export type RevisionLine = {
  lineItemId: string
  label: string
  channel: string
  isProduction: boolean
  clientPaysForMedia: boolean
  isAaLine: boolean
  media: Record<MonthKey, Cents>
  fee: Record<MonthKey, Cents>
  adserving: Record<MonthKey, Cents>
}

export type BillAmountStrategy = "earliest_first" | "proportional"

/** Q5: when a line has no open month left for its underspend gap. */
export type UnderspendNoRemainingChoice = "last_month" | "credit"

export type RevisionOptions = {
  /** Soft-locked (approved, not sent) months the user ticked open. */
  unlockApprovedMonths: MonthKey[]
  includeProduction: boolean
  feeMode: "follow" | "keep"
  /** v1 keeps ad serving on delivery timing (Q7: C10 dropped). */
  adservingMode: "keep"
  lineFilter?: string[]
}

export type RestoreTarget = {
  media: Record<string, Record<MonthKey, Cents>>
  fee?: Record<string, Record<MonthKey, Cents>>
  /** True-up revisions only (the other kinds never move ad serving). */
  adserving?: Record<string, Record<MonthKey, Cents>>
}

/** The four true-up components. Production and media are both media cells, split by line. */
export type TrueUpComponentKey = "fee" | "adserving" | "production" | "media"

export type TrueUpStrategy = "spread" | "carry"

/**
 * True-up (design DESIGN-AV-true-up-2026-10-29, section 4). Months listed in
 * `actuals` are set to what was invoiced (MBA level, counted invoices only),
 * split across lines pro rata to the month's schedule. The open months after
 * them rebalance so every line keeps its contract total. A month listed with
 * zeros is a no-invoice month finance chose to carry (decision 2, mixed).
 */
export type TrueUpRequest = {
  mode: "true_up"
  asOfMonth: MonthKey
  strategy: TrueUpStrategy
  components: TrueUpComponentKey[]
  actuals: Record<MonthKey, Partial<Record<TrueUpComponentKey, Cents>>>
  /** The report window's first month (the apply rebuilds the same report to check nothing moved). */
  fromMonth?: MonthKey
  /** No-invoice months finance chose to carry (listed in actuals with zeros). */
  noInvoiceMonths?: MonthKey[]
}

/** Undo of a true-up: puts the before cells back (media, fee, ad serving). */
export type TrueUpRestoreRequest = {
  mode: "true_up_restore"
  target: RestoreTarget
  /**
   * The current month when the true-up ran. Months from it on were open
   * months then and must still be open to undo; earlier months were trued
   * up and must still be writable (not in a closed period or sent AA pack).
   */
  fixedAtMonth: MonthKey
}

export type RevisionRequest =
  | { mode: "pull_month"; fromMonth: MonthKey; intoMonth: MonthKey }
  | { mode: "bill_remainder"; intoMonth: MonthKey }
  | {
      mode: "bill_amount"
      intoMonth: MonthKey
      amountCents: Cents
      strategy: BillAmountStrategy
    }
  | {
      mode: "underspend"
      month: MonthKey
      actualByLine: Record<string, Cents>
      noRemaining?: Record<string, UnderspendNoRemainingChoice>
    }
  | { mode: "restore"; target: RestoreTarget }
  | TrueUpRequest
  | TrueUpRestoreRequest

export type RevisionMode = RevisionRequest["mode"]

/** True-up kinds. Only the true-up service builds these; the generic billing revision routes refuse them. */
export const TRUE_UP_REVISION_MODES = ["true_up", "true_up_restore"] as const

export function isTrueUpRevisionMode(mode: unknown): mode is (typeof TRUE_UP_REVISION_MODES)[number] {
  return mode === "true_up" || mode === "true_up_restore"
}

/** The generic billing revision modes (the true-up kinds are separate). */
export const REVISION_MODES: readonly RevisionMode[] = [
  "pull_month",
  "bill_remainder",
  "bill_amount",
  "underspend",
  "restore",
] as const

export type RevisionInput = {
  lines: RevisionLine[]
  locks: MonthLock[]
  /** Months covered by a sent AA pack. Hard for AA lines only. */
  aaLockedMonths?: MonthKey[]
  currentMonth: MonthKey
  /** Campaign start..end months, inclusive. */
  campaignMonths: MonthKey[]
  /** True when the blob carries a header-only fixed fee (__service__fees). */
  hasFixedHeaderFee?: boolean
  /**
   * True-up only: billing cells that are not on a plan line (__service__*
   * header rows, rows with no line). They count toward a month's schedule
   * but never change.
   */
  fixedCells?: Partial<Record<TrueUpComponentKey, Record<MonthKey, Cents>>>
  request: RevisionRequest
  options: RevisionOptions
}

export type CellDiff = { month: MonthKey; before: Cents; after: Cents }

export type SkipReason = "client_pays" | "production" | "filtered"

export type LineDiff = {
  lineItemId: string
  label: string
  media: CellDiff[]
  fee: CellDiff[]
  adserving: CellDiff[]
  skipped?: SkipReason
}

export type MonthDiff = {
  month: MonthKey
  lock: MonthLock
  /** Effective level after unlockApprovedMonths. */
  effectiveLevel: LockLevel
  media: CellDiff
  fee: CellDiff
  adserving: CellDiff
  production: CellDiff
  total: CellDiff
}

export type RevisionWarningCode =
  | "PREBILL_BEFORE_START"
  | "FEE_NO_MEDIA"
  | "FIXED_FEE_NOT_MOVED"
  | "AA_LINE_LOCKED"
  | "UNDERSPEND_CREDIT_NOTED"
  | "UNDERSPEND_TO_LAST_MONTH"
  | "UNDERSPEND_LINE_SKIPPED"
  | "RESTORE_LINE_NOT_UNDONE"
  | "TRUE_UP_RESIDUAL"
  | "TRUE_UP_MONTH_LOCKED"
  | "TRUE_UP_NO_LINES"

export type RevisionWarning = {
  code: RevisionWarningCode
  message: string
  lineItemId?: string
  month?: MonthKey
}

/** Q5 credit: a note in the change log only. No schedule change, no Xero action. */
export type UnderspendCredit = { lineItemId: string; month: MonthKey; cents: Cents }

export type RevisionErrorCode =
  | "TARGET_LOCKED"
  | "SOURCE_LOCKED"
  | "SOURCE_EMPTY"
  | "AMOUNT_NOT_POSITIVE"
  | "AMOUNT_EXCEEDS_AVAILABLE"
  | "TARGET_OUTSIDE_CAMPAIGN"
  | "TARGET_IN_PAST"
  | "SAME_MONTH"
  | "UNDERSPEND_ACTUAL_ABOVE_PLAN"
  | "UNDERSPEND_ACTUAL_NEGATIVE"
  | "UNDERSPEND_NEEDS_CHOICE"
  | "LAST_MONTH_UNAVAILABLE"
  | "MONTH_HARD_LOCKED"
  | "PARTIAL_MBA_UNSUPPORTED"
  | "BAD_MONTH"
  | "NO_CHANGE"
  | "TRUE_UP_BAD_REQUEST"

export type UnderspendChoiceNeeded = {
  lineItemId: string
  label: string
  gapCents: Cents
  /** The line's last month, when it can take the gap. */
  lastMonth: MonthKey | null
}

export type RevisionOk = {
  ok: true
  lines: LineDiff[]
  months: MonthDiff[]
  movedCents: Cents
  credits: UnderspendCredit[]
  warnings: RevisionWarning[]
  /** Restore only: lines that could not be undone and why. */
  cannotUndo: Array<{ lineItemId: string; months: MonthKey[] }>
  /** Changed lines after the revision (all months), for the writer. */
  afterCells: Array<{
    lineItemId: string
    media: Record<MonthKey, Cents>
    fee: Record<MonthKey, Cents>
    mediaChanged: boolean
    feeChanged: boolean
    /** True-up kinds only. The other kinds never move ad serving. */
    adserving?: Record<MonthKey, Cents>
    adservingChanged?: boolean
  }>
  hash: string
  /** True-up kinds only. */
  trueUp?: TrueUpPlanSummary
}

export type TrueUpComponentSummaryPlan = {
  component: TrueUpComponentKey
  /** Invoiced minus scheduled over the trued-up months, before the fix. */
  gapBefore: Cents
  /** What the schedule could not absorb: + credit to raise, - charge to raise. */
  residual: Cents
  /** Cents moved into or out of the open months. */
  rebalanced: Cents
}

export type TrueUpPlanSummary = {
  asOfMonth: MonthKey
  strategy: TrueUpStrategy
  months: MonthKey[]
  components: TrueUpComponentSummaryPlan[]
}

export type RevisionFail = {
  ok: false
  code: RevisionErrorCode
  message: string
  availableCents?: Cents
  lockedMonths?: MonthLock[]
  choicesNeeded?: UnderspendChoiceNeeded[]
  cannotUndo?: Array<{ lineItemId: string; months: MonthKey[] }>
}

export type RevisionResult = RevisionOk | RevisionFail

/** Thrown when the planner breaks one of its own laws. A bug, never user input. */
export class RevisionInvariantError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RevisionInvariantError"
  }
}
