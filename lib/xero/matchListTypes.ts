export type XeroMatchRow = {
  id: number
  xeroInvoiceId: string
  runItemId: number | null
  method: "reference" | "heuristic" | "manual"
  confidence: number
  deltaCents: number
  status: "matched" | "diverged" | "disputed" | "written_off"
  decidedBy: string | null
  decidedAt: string | null
  cardKind: string | null
  detail: string | null
  periodMonth: string | null
  mbaNumber: string | null
  clientId: number | null
  clientName: string | null
  invoiceReference: string | null
  amountCents: number | null
  invoiceNumber: string | null
}

export type XeroMonthMetric = {
  periodMonth: string
  referenceAttempts: number
  referenceHits: number
  referenceHitRate: number
  tier1Matched: number
  tier1Diverged: number
  tier2Suggested: number
  duplicates: number
  orphans: number
  /** Sum of |delta_cents| for diverged matches in this month (display unmatched $). */
  unmatchedCents: number
}
