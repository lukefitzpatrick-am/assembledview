/**
 * Compare approved AssembledView invoices to Xero DRAFT AR, per client-month.
 *
 * Matching order:
 *   a. reference MBA / scope via matchMbaAgainstMasters (T0-3 tokeniser)
 *   b. client + billing month + amount within $0.01
 *   c. client + billing month, single candidate, any amount → Differs
 *   d. otherwise unmatched (Missing / Extra)
 *
 * Two Xero drafts in the same client-month never first-wins — Differs, both listed.
 * VOIDED / DELETED / non-DRAFT are ignored before matching.
 */

import { matchMbaAgainstMasters, type MbaMaster, type ScopeOfWorkRef } from "@/lib/xero/matchMba"
import { xeroArInvoiceViewUrl } from "@/lib/xero/invoiceUrl"

export type DraftMatchOutcome = "Agrees" | "Differs" | "Missing" | "Extra"

export type DraftMatchApproved = {
  invoice_key: string
  clients_id: number
  client_name: string
  mba_number: string | null
  billing_month: string
  approved_amount_cents: number
}

export type DraftMatchXero = {
  xero_invoice_id: string
  invoice_number: string | null
  reference_raw: string | null
  clients_id: number | null
  client_name: string | null
  billing_month: string
  sub_total_cents: number
  status: string
}

export type DraftMatchStamp = {
  invoice_key: string
  xero_invoice_id: string
  matched_by: "auto" | "manual"
}

export type DraftMatchDraftRef = {
  xero_invoice_id: string
  invoice_number: string | null
  reference_raw: string | null
  sub_total_cents: number
  xero_url: string | null
}

export type DraftMatchRow = {
  id: string
  clients_id: number | null
  client_name: string
  billing_month: string
  outcome: DraftMatchOutcome
  approved_amount_cents: number
  xero_amount_cents: number
  delta_cents: number
  approved: DraftMatchApproved[]
  drafts: DraftMatchDraftRef[]
  stamps: DraftMatchStamp[]
}

export type DraftMatchGrouped = {
  Differs: DraftMatchRow[]
  Missing: DraftMatchRow[]
  Extra: DraftMatchRow[]
  Agrees: DraftMatchRow[]
}

export type DraftMatchPayload = {
  lastPulledAt: string | null
  grouped: DraftMatchGrouped
  counts: Record<keyof DraftMatchGrouped, number>
  rows: DraftMatchRow[]
}

export type DraftMatchMbaOption = {
  mba_number: string
  campaign_name: string
  client_id: number | null
}

export type DraftMatchReport = DraftMatchPayload & {
  mbaOptions: DraftMatchMbaOption[]
  approvedCandidates: DraftMatchApproved[]
}

const CENT_TOLERANCE = 1
const ABSENT = new Set(["VOIDED", "DELETED"])

function statusOf(status: string): string {
  return status.trim().toUpperCase()
}

function isLiveDraft(row: DraftMatchXero): boolean {
  const s = statusOf(row.status)
  if (ABSENT.has(s)) return false
  return s === "DRAFT"
}

function amountsAgree(approvedCents: number, xeroCents: number): boolean {
  return Math.abs(approvedCents - xeroCents) <= CENT_TOLERANCE
}

function mbaTokenOf(
  draft: DraftMatchXero,
  masters: MbaMaster[],
  scopes: ScopeOfWorkRef[]
): string | null {
  const result = matchMbaAgainstMasters(draft.reference_raw ?? "", masters, scopes)
  if (!result.matched) return null
  if (result.kind === "mba") return result.mba_number
  return result.scope_id
}

function mbaEquals(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = (a ?? "").trim().toLowerCase()
  const right = (b ?? "").trim().toLowerCase()
  if (!left || !right) return false
  return left === right
}

function toDraftRef(d: DraftMatchXero): DraftMatchDraftRef {
  return {
    xero_invoice_id: d.xero_invoice_id,
    invoice_number: d.invoice_number,
    reference_raw: d.reference_raw,
    sub_total_cents: d.sub_total_cents,
    xero_url: xeroArInvoiceViewUrl(d.xero_invoice_id),
  }
}

function sumApproved(rows: DraftMatchApproved[]): number {
  return rows.reduce((n, r) => n + r.approved_amount_cents, 0)
}

function sumDrafts(rows: DraftMatchXero[]): number {
  return rows.reduce((n, r) => n + r.sub_total_cents, 0)
}

function makeRow(
  approved: DraftMatchApproved[],
  drafts: DraftMatchXero[],
  outcome: DraftMatchOutcome,
  stamps: DraftMatchStamp[]
): DraftMatchRow {
  const approved_amount_cents = sumApproved(approved)
  const xero_amount_cents = sumDrafts(drafts)
  const client_name =
    approved[0]?.client_name?.trim() ||
    drafts[0]?.client_name?.trim() ||
    "Unresolved client"
  const clients_id = approved[0]?.clients_id ?? drafts[0]?.clients_id ?? null
  const billing_month = approved[0]?.billing_month ?? drafts[0]?.billing_month ?? ""
  const id = [
    outcome,
    clients_id ?? "none",
    billing_month,
    approved.map((a) => a.invoice_key).join(","),
    drafts.map((d) => d.xero_invoice_id).join(","),
  ].join("|")
  return {
    id,
    clients_id,
    client_name,
    billing_month,
    outcome,
    approved_amount_cents,
    xero_amount_cents,
    delta_cents: xero_amount_cents - approved_amount_cents,
    approved,
    drafts: drafts.map(toDraftRef),
    stamps,
  }
}

function pairOutcome(approved: DraftMatchApproved[], drafts: DraftMatchXero[]): DraftMatchOutcome {
  return amountsAgree(sumApproved(approved), sumDrafts(drafts)) ? "Agrees" : "Differs"
}

function oneToOneStamp(approved: DraftMatchApproved[], drafts: DraftMatchXero[]): DraftMatchStamp[] {
  if (approved.length !== 1 || drafts.length !== 1) return []
  return [
    {
      invoice_key: approved[0]!.invoice_key,
      xero_invoice_id: drafts[0]!.xero_invoice_id,
      matched_by: "auto",
    },
  ]
}

function clientMonthKey(clientsId: number, billingMonth: string): string {
  return `${clientsId}|${billingMonth}`
}

export function compareDraftsToApproved(input: {
  approved: DraftMatchApproved[]
  drafts: DraftMatchXero[]
  masters: MbaMaster[]
  scopes: ScopeOfWorkRef[]
}): { rows: DraftMatchRow[] } {
  const liveDrafts = input.drafts.filter(isLiveDraft)
  const unusedApproved = new Set(input.approved.map((a) => a.invoice_key))
  const unusedDrafts = new Set(liveDrafts.map((d) => d.xero_invoice_id))
  const rows: DraftMatchRow[] = []

  const takeApproved = (list: DraftMatchApproved[]) => {
    for (const a of list) unusedApproved.delete(a.invoice_key)
  }
  const takeDrafts = (list: DraftMatchXero[]) => {
    for (const d of list) unusedDrafts.delete(d.xero_invoice_id)
  }

  const emit = (
    approved: DraftMatchApproved[],
    drafts: DraftMatchXero[],
    outcome: DraftMatchOutcome,
    stamps: DraftMatchStamp[]
  ) => {
    rows.push(makeRow(approved, drafts, outcome, stamps))
    takeApproved(approved)
    takeDrafts(drafts)
  }

  type Claim = { draft: DraftMatchXero; approved: DraftMatchApproved }
  const uniqueClaims: Claim[] = []
  const contendedApproved = new Set<string>()
  const claimCount = new Map<string, number>()

  for (const draft of liveDrafts) {
    const token = mbaTokenOf(draft, input.masters, input.scopes)
    if (!token) continue
    const cands = input.approved.filter(
      (a) => unusedApproved.has(a.invoice_key) && mbaEquals(a.mba_number, token)
    )
    const sameMonth = cands.filter((a) => a.billing_month === draft.billing_month)
    const pool = sameMonth.length > 0 ? sameMonth : cands
    if (pool.length !== 1) continue
    const key = pool[0]!.invoice_key
    claimCount.set(key, (claimCount.get(key) ?? 0) + 1)
    uniqueClaims.push({ draft, approved: pool[0]! })
  }

  for (const [key, n] of claimCount) {
    if (n > 1) contendedApproved.add(key)
  }

  for (const claim of uniqueClaims) {
    if (contendedApproved.has(claim.approved.invoice_key)) continue
    if (!unusedDrafts.has(claim.draft.xero_invoice_id)) continue
    if (!unusedApproved.has(claim.approved.invoice_key)) continue
    const approved = [claim.approved]
    const drafts = [claim.draft]
    emit(approved, drafts, pairOutcome(approved, drafts), oneToOneStamp(approved, drafts))
  }

  type Group = { approved: DraftMatchApproved[]; drafts: DraftMatchXero[] }
  const groups = new Map<string, Group>()
  const ensure = (key: string): Group => {
    const existing = groups.get(key)
    if (existing) return existing
    const created: Group = { approved: [], drafts: [] }
    groups.set(key, created)
    return created
  }

  for (const a of input.approved) {
    if (!unusedApproved.has(a.invoice_key)) continue
    ensure(clientMonthKey(a.clients_id, a.billing_month)).approved.push(a)
  }
  for (const d of liveDrafts) {
    if (!unusedDrafts.has(d.xero_invoice_id)) continue
    if (d.clients_id == null || !Number.isFinite(d.clients_id) || d.clients_id <= 0) continue
    ensure(clientMonthKey(d.clients_id, d.billing_month)).drafts.push(d)
  }

  for (const g of groups.values()) {
    if (g.drafts.length >= 2) {
      emit(g.approved, g.drafts, "Differs", [])
      continue
    }
    if (g.drafts.length === 1 && g.approved.length === 1) {
      const approved = g.approved
      const drafts = g.drafts
      emit(approved, drafts, pairOutcome(approved, drafts), oneToOneStamp(approved, drafts))
      continue
    }
    if (g.drafts.length === 1 && g.approved.length > 1) {
      const draft = g.drafts[0]!
      const hits = g.approved.filter((a) => amountsAgree(a.approved_amount_cents, draft.sub_total_cents))
      if (hits.length === 1) {
        emit([hits[0]!], [draft], "Agrees", oneToOneStamp([hits[0]!], [draft]))
        continue
      }
      emit(g.approved, g.drafts, "Differs", [])
    }
  }

  const leftoverApprovedByMonth = new Map<string, DraftMatchApproved[]>()
  for (const a of input.approved) {
    if (!unusedApproved.has(a.invoice_key)) continue
    const key = clientMonthKey(a.clients_id, a.billing_month)
    const list = leftoverApprovedByMonth.get(key) ?? []
    list.push(a)
    leftoverApprovedByMonth.set(key, list)
  }
  for (const list of leftoverApprovedByMonth.values()) {
    emit(list, [], "Missing", [])
  }

  const leftoverDraftsByMonth = new Map<string, DraftMatchXero[]>()
  const unresolved: DraftMatchXero[] = []
  for (const d of liveDrafts) {
    if (!unusedDrafts.has(d.xero_invoice_id)) continue
    if (d.clients_id == null || !Number.isFinite(d.clients_id) || d.clients_id <= 0) {
      unresolved.push(d)
      continue
    }
    const key = clientMonthKey(d.clients_id, d.billing_month)
    const list = leftoverDraftsByMonth.get(key) ?? []
    list.push(d)
    leftoverDraftsByMonth.set(key, list)
  }
  for (const list of leftoverDraftsByMonth.values()) {
    emit([], list, "Extra", [])
  }
  for (const d of unresolved) {
    emit([], [d], "Extra", [])
  }

  return { rows }
}

export function groupDraftMatchRows(rows: DraftMatchRow[]): DraftMatchGrouped {
  const grouped: DraftMatchGrouped = {
    Differs: [],
    Missing: [],
    Extra: [],
    Agrees: [],
  }
  for (const row of rows) grouped[row.outcome].push(row)
  return grouped
}
