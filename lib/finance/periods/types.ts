export type FinancePeriodStatus =
  | "open"
  | "pre_run_review"
  | "run"
  | "review"
  | "locked"
  | "invoiced"
  | "reconciled"

export type FinanceRunSource = "media" | "retainer" | "sow"

export type FinanceRunItemStatus =
  | "pending"
  | "approved"
  | "adjusted"
  | "held"
  | "excluded"
  | "stale"

export type FinancePeriod = {
  id: number
  periodMonth: string // YYYY-MM
  status: FinancePeriodStatus
  ranAt: string | null
  lockedAt: string | null
  lockedBy: string | null
  amendedAfterLock: boolean
  sheetBlobPathname: string | null
  sheetVersion: number
}

export type ClientSnapshot = {
  legalBusinessName: string
  abn: string
  paymentTerms: string
  paymentDays: number
  streetAddress: string
  suburb: string
  state: string
  postcode: string
  clientId: number
  clientName: string
}

export type FinanceRunItem = {
  id: number
  periodId: number
  source: FinanceRunSource
  naturalKey: string
  mbaNumber: string | null
  clientId: number | null
  versionId: number | null
  sowId: number | null
  lineItemsJson: unknown
  amountCents: number
  invoiceReference: string
  status: FinanceRunItemStatus
  adjustmentCents: number | null
  adjustmentReason: string | null
  holdReason: string | null
  excludeReason: string | null
  clientSnapshotJson: ClientSnapshot | null
  linkedVarianceFromItemId: number | null
  rolledFromItemId: number | null
}

export type RunCandidate = {
  source: FinanceRunSource
  naturalKey: string
  mbaNumber: string | null
  clientId: number | null
  versionId: number | null
  sowId: number | null
  lineItemsJson: unknown
  amountCents: number
  invoiceReference: string
  /** When set, item is created as held with this reason. */
  heldReason?: string | null
}

export type ReviewAction =
  | { type: "approve" }
  | { type: "adjust"; adjustmentCents: number; reason: string }
  | { type: "hold"; reason: string }
  | { type: "exclude"; reason: string }

export type AppNotification = {
  id: number
  audience: string
  kind: string
  payload: Record<string, unknown>
  createdAt: string
  readAt: string | null
}
