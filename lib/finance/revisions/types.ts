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

export type RevisionMode = RevisionRequest["mode"]

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
  }>
  hash: string
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
