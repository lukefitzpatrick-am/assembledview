/**
 * Clearance report for months already sent to accounts.
 * Pure: classify drafts, hash the set, and decide whether to email.
 */

import { createHash } from "node:crypto"

import { accountsPackMonthLabel } from "@/lib/finance/sendToAccounts"
import { XERO_MATCH_TOLERANCE_CENTS } from "@/lib/finance/sections/xeroBillingMatch"
import { coerceDollars, dollarsToCents } from "@/lib/xero/money"

export const DRAFT_STATUSES = new Set(["DRAFT", "SUBMITTED"])

export type ClearanceLine = {
  description: string
  cents: number
}

export type ClearanceSourceRow = {
  invoiceKey: string
  billingMonth: string
  clientName: string
  mbaNumber: string
  campaignName: string
  expectedCents: number | null
  xeroInvoiceId: string | null
  xeroStatus: string | null
  draftCents: number | null
  invoiceNumber: string | null
  appLines: ClearanceLine[]
  draftLines: ClearanceLine[]
}

export type ClearanceState = "cleared" | "differs" | "missing"

export type MovedLine = {
  description: string
  expectedCents: number
  draftCents: number
  deltaCents: number
}

export type ClearanceEntry = {
  invoiceKey: string
  /** Xero invoice id, or `app:{invoiceKey}` when nothing is drafted. */
  invoiceId: string
  state: ClearanceState
  amountCents: number
  clientName: string
  mbaNumber: string
  campaignName: string
  billingMonth: string
  invoiceNumber: string | null
  expectedCents: number | null
  draftCents: number | null
  deltaCents: number | null
  line: MovedLine | null
}

export type ClearanceCounts = {
  cleared: number
  differs: number
  missing: number
}

export type ClearanceReport = {
  month: string
  monthLabel: string
  entries: ClearanceEntry[]
  cleared: ClearanceEntry[]
  differs: ClearanceEntry[]
  missing: ClearanceEntry[]
  counts: ClearanceCounts
  hash: string
}

function normDesc(value: string): string {
  return value.trim().toLowerCase()
}

export function xeroDraftLines(lineItems: unknown): ClearanceLine[] {
  if (!Array.isArray(lineItems)) return []
  const out: ClearanceLine[] = []
  for (const raw of lineItems) {
    if (!raw || typeof raw !== "object") continue
    const row = raw as Record<string, unknown>
    const description = String(row.Description ?? row.description ?? "").trim() || "Line"
    const dollars = coerceDollars(row.LineAmount ?? row.lineAmount ?? row.line_amount)
    out.push({ description, cents: dollarsToCents(dollars) })
  }
  return out
}

/** Largest ex-GST line gap between the app lines and the Xero draft lines. */
export function lineThatMoved(appLines: ClearanceLine[], draftLines: ClearanceLine[]): MovedLine | null {
  const app = sumByDescription(appLines)
  const draft = sumByDescription(draftLines)
  const keys = new Set([...app.keys(), ...draft.keys()])
  let best: MovedLine | null = null
  for (const key of keys) {
    const expectedCents = app.get(key) ?? 0
    const draftCents = draft.get(key) ?? 0
    const deltaCents = draftCents - expectedCents
    if (best == null || Math.abs(deltaCents) > Math.abs(best.deltaCents)) {
      const description =
        draftLines.find((line) => normDesc(line.description) === key)?.description ??
        appLines.find((line) => normDesc(line.description) === key)?.description ??
        key
      best = { description, expectedCents, draftCents, deltaCents }
    }
  }
  if (best == null || best.deltaCents === 0) return null
  return best
}

function sumByDescription(lines: ClearanceLine[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const line of lines) {
    const key = normDesc(line.description) || "line"
    map.set(key, (map.get(key) ?? 0) + line.cents)
  }
  return map
}

function statusOf(status: string | null): string {
  return (status ?? "").trim().toUpperCase()
}

function isDraft(status: string | null): boolean {
  return DRAFT_STATUSES.has(statusOf(status))
}

/** Already authorised or paid. Left out of the lists and the hash. */
function alreadyIssued(status: string | null): boolean {
  const value = statusOf(status)
  return value === "AUTHORISED" || value === "PAID"
}

export function buildClearanceReport(month: string, rows: ClearanceSourceRow[]): ClearanceReport {
  const monthRows = rows.filter((row) => row.billingMonth === month)
  const entries: ClearanceEntry[] = []
  const groups = new Map<string, ClearanceSourceRow[]>()
  const solo: ClearanceSourceRow[] = []

  for (const row of monthRows) {
    const status = statusOf(row.xeroStatus)
    if (row.xeroInvoiceId && alreadyIssued(status)) continue
    if (!isDraft(row.xeroStatus) || !row.xeroInvoiceId || status === "VOIDED" || status === "DELETED") {
      solo.push(row)
      continue
    }
    const list = groups.get(row.xeroInvoiceId) ?? []
    list.push(row)
    groups.set(row.xeroInvoiceId, list)
  }

  for (const row of solo) {
    entries.push(missingEntry(row))
  }

  for (const [invoiceId, group] of groups) {
    const expectedSum = group.reduce((sum, row) => sum + (row.expectedCents ?? 0), 0)
    const draftCents = group[0]?.draftCents ?? 0
    const deltaCents = draftCents - expectedSum
    const agrees = Math.abs(deltaCents) <= XERO_MATCH_TOLERANCE_CENTS
    const combinedApp = group.flatMap((row) => row.appLines)
    const moved = agrees ? null : lineThatMoved(combinedApp, group[0]?.draftLines ?? [])
    for (const row of group) {
      entries.push({
        invoiceKey: row.invoiceKey,
        invoiceId,
        state: agrees ? "cleared" : "differs",
        amountCents: draftCents,
        clientName: row.clientName,
        mbaNumber: row.mbaNumber,
        campaignName: row.campaignName,
        billingMonth: row.billingMonth,
        invoiceNumber: row.invoiceNumber,
        expectedCents: row.expectedCents,
        draftCents,
        deltaCents,
        line: agrees ? null : moved,
      })
    }
  }

  entries.sort((a, b) => a.invoiceId.localeCompare(b.invoiceId) || a.invoiceKey.localeCompare(b.invoiceKey))
  const cleared = entries.filter((entry) => entry.state === "cleared")
  const differs = entries.filter((entry) => entry.state === "differs")
  const missing = entries.filter((entry) => entry.state === "missing")
  return {
    month,
    monthLabel: accountsPackMonthLabel(month),
    entries,
    cleared,
    differs,
    missing,
    counts: { cleared: cleared.length, differs: differs.length, missing: missing.length },
    hash: clearanceHash(entries),
  }
}

function missingEntry(row: ClearanceSourceRow): ClearanceEntry {
  return {
    invoiceKey: row.invoiceKey,
    invoiceId: `app:${row.invoiceKey}`,
    state: "missing",
    amountCents: row.expectedCents ?? 0,
    clientName: row.clientName,
    mbaNumber: row.mbaNumber,
    campaignName: row.campaignName,
    billingMonth: row.billingMonth,
    invoiceNumber: null,
    expectedCents: row.expectedCents,
    draftCents: null,
    deltaCents: null,
    line: null,
  }
}

export function clearanceHash(entries: ClearanceEntry[]): string {
  const canon = [...entries]
    .map((entry) => ({
      invoiceId: entry.invoiceId,
      state: entry.state,
      amount: entry.amountCents,
    }))
    .sort(
      (a, b) =>
        a.invoiceId.localeCompare(b.invoiceId) ||
        a.state.localeCompare(b.state) ||
        a.amount - b.amount,
    )
  return createHash("sha256").update(JSON.stringify(canon)).digest("hex")
}

export function shouldSendClearance(previousHash: string | null, nextHash: string, force: boolean): boolean {
  if (force) return true
  return previousHash !== nextHash
}

export function clearanceSubject(report: ClearanceReport): string {
  const { counts } = report
  return `${report.monthLabel} drafts · ${counts.cleared} cleared · ${counts.differs} differ · ${counts.missing} not yet drafted`
}

function money(cents: number | null): string {
  if (cents == null) return "—"
  const dollars = cents / 100
  const formatted = Math.abs(dollars).toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${dollars < 0 ? "-" : ""}$${formatted}`
}

function rowLabel(entry: ClearanceEntry): string {
  const who = entry.clientName || "Client"
  const ref = entry.mbaNumber ? ` (${entry.mbaNumber})` : ""
  const campaign = entry.campaignName ? ` ${entry.campaignName}` : ""
  return `${who}${ref}${campaign}`
}

export function clearanceBody(report: ClearanceReport): string {
  const lines: string[] = [
    `${report.monthLabel} clearance. Cleared drafts agree within $1 and are safe to authorise. Do not authorise Differs or rows that are not yet drafted.`,
    "",
    `Cleared (${report.counts.cleared})`,
  ]
  if (report.cleared.length === 0) lines.push("- none")
  for (const entry of report.cleared) {
    lines.push(`- ${rowLabel(entry)} · expected ${money(entry.expectedCents)} · draft ${money(entry.draftCents)}`)
  }
  lines.push("", `Differs (${report.counts.differs})`)
  if (report.differs.length === 0) lines.push("- none")
  for (const entry of report.differs) {
    const moved = entry.line
      ? ` · line ${entry.line.description} expected ${money(entry.line.expectedCents)} draft ${money(entry.line.draftCents)} Δ ${money(entry.line.deltaCents)}`
      : ""
    lines.push(
      `- ${rowLabel(entry)} · expected ${money(entry.expectedCents)} · draft ${money(entry.draftCents)} · delta ${money(entry.deltaCents)}${moved}`,
    )
  }
  lines.push("", `Not yet drafted (${report.counts.missing})`)
  if (report.missing.length === 0) lines.push("- none")
  for (const entry of report.missing) {
    lines.push(`- ${rowLabel(entry)} · expected ${money(entry.expectedCents)}`)
  }
  return lines.join("\n")
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

export function clearanceClearedCsv(report: ClearanceReport): string {
  const header = [
    "client_name",
    "mba_number",
    "campaign_name",
    "billing_month",
    "xero_invoice_id",
    "invoice_number",
    "expected",
    "draft",
  ].join(",")
  const body = report.cleared.map((entry) =>
    [
      csvCell(entry.clientName),
      csvCell(entry.mbaNumber),
      csvCell(entry.campaignName),
      entry.billingMonth,
      csvCell(entry.invoiceId),
      csvCell(entry.invoiceNumber ?? ""),
      entry.expectedCents == null ? "" : (entry.expectedCents / 100).toFixed(2),
      entry.draftCents == null ? "" : (entry.draftCents / 100).toFixed(2),
    ].join(","),
  )
  return [header, ...body].join("\n")
}
