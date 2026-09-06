/**
 * Parser vs independent audit + ingest invariants (IG-11).
 * Agreement → green. Disagreement / invariant breach → discrepancy.
 */

import { roundCents } from "@/lib/mediaplans/ingest/moneyRules"
import type { IngestReviewPackage } from "@/lib/mediaplans/ingest/buildIngestReview"
import type { IngestProposal, ProposedLineItem } from "@/lib/mediaplans/ingest/proposeLineItems"
import {
  auditRowFromProposedLine,
  datesFromProposedLine,
  formatHeaderFromProposedLine,
  identityFromProposedLine,
  moneyAmountFromProposedLine,
  sourceRowNumber,
  type LineAudit,
  type LineAuditDateRange,
  type LineAuditDiscrepancy,
  type LineAuditIdentity,
  type LineAuditResolution,
  type LineAuditResolutionChoice,
  type LineAuditRow,
} from "@/lib/mediaplans/ingest/lineAudit"

export function discrepancyLoadRefuseMessage(count: number): string {
  if (count === 1) {
    return "1 line discrepancy is still open. Nothing was written."
  }
  return `${count} line discrepancies are still open. Nothing was written.`
}

export const PARSER_RESOLUTION_LABEL = "Parser"
export const AUDIT_RESOLUTION_LABEL = "Audit"

export function discrepancyQuestionId(row: number): string {
  return `ingest:discrepancy:r${row}`
}

export function parseDiscrepancyQuestionRow(id: string): number | null {
  const m = /^ingest:discrepancy:r(\d+)$/.exec(id)
  if (!m) return null
  const n = Number(m[1])
  return Number.isInteger(n) ? n : null
}

function norm(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function identityEq(a: LineAuditIdentity, b: LineAuditIdentity): boolean {
  return (
    norm(a.panel) === norm(b.panel) &&
    norm(a.name) === norm(b.name) &&
    norm(a.market) === norm(b.market) &&
    norm(a.section) === norm(b.section)
  )
}

function moneyEq(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return roundCents(a) === roundCents(b)
}

function dateKey(d: LineAuditDateRange): string {
  return `${norm(d.from)}|${norm(d.to)}`
}

function datesEq(a: LineAuditDateRange[], b: LineAuditDateRange[]): boolean {
  const sa = a.map(dateKey).sort()
  const sb = b.map(dateKey).sort()
  if (sa.length !== sb.length) return false
  return sa.every((k, i) => k === sb[i])
}

function cellsFor(audit: LineAuditRow | null, extra: string[] = []): string[] {
  const out = [...extra]
  if (audit?.money.cell) out.push(audit.money.cell)
  for (const run of audit?.status_runs ?? []) {
    out.push(`${run.from_col}:${run.to_col}`)
  }
  return [...new Set(out.filter(Boolean))]
}

function isBonusStatus(status: string): boolean {
  const k = status.toLowerCase()
  return k === "bonus" || k === "bonus_display"
}

function isPaidStatus(status: string): boolean {
  return status.toLowerCase() === "paid"
}

export const INVARIANT_RULES = [
  "money_only_on_paid",
  "bonus_zero_own_flight",
  "bursts_inside_runs",
  "one_section_per_line",
  "format_from_section",
  "campaign_window",
] as const

export type InvariantRule = (typeof INVARIANT_RULES)[number]

export type CampaignWindow = {
  start: string
  end: string
}

function buyKindFromStatus(status: string): "bonus" | "paid" | "other" {
  if (isBonusStatus(status)) return "bonus"
  if (isPaidStatus(status)) return "paid"
  return "other"
}

function parserBuyKind(item: ProposedLineItem): "bonus" | "paid" | "mixed" {
  const kinds = new Set(
    item.bursts.map((b) => buyKindFromStatus(b.booking_status)).filter(
      (k) => k === "bonus" || k === "paid",
    ),
  )
  if (kinds.has("bonus") && kinds.has("paid")) return "mixed"
  if (kinds.has("bonus") && kinds.size === 1) return "bonus"
  return "paid"
}

function auditBuyKind(
  auditRow: LineAuditRow | null,
): "bonus" | "paid" | "mixed" | null {
  if (!auditRow || auditRow.status_runs.length === 0) return null
  const kinds = new Set(
    auditRow.status_runs
      .map((r) => buyKindFromStatus(r.status))
      .filter((k) => k === "bonus" || k === "paid"),
  )
  if (kinds.size === 0) return null
  if (kinds.has("bonus") && kinds.has("paid")) return "mixed"
  if (kinds.has("bonus") && kinds.size === 1) return "bonus"
  return "paid"
}

function inCampaignWindow(
  from: string | null | undefined,
  to: string | null | undefined,
  window: CampaignWindow,
): boolean {
  if (!from || !to) return true
  return from >= window.start && to <= window.end
}

export function invariantBreachesForLine(
  item: ProposedLineItem,
  campaignWindow?: CampaignWindow | null,
): Array<{ rule: InvariantRule; detail: string }> {
  const breaches: Array<{ rule: InvariantRule; detail: string }> = []
  for (const burst of item.bursts) {
    if (isBonusStatus(burst.booking_status) && roundCents(burst.media_amount) !== 0) {
      breaches.push({
        rule: "money_only_on_paid",
        detail: `bonus burst carries $${burst.media_amount}`,
      })
      breaches.push({
        rule: "bonus_zero_own_flight",
        detail: `bonus burst is not $0`,
      })
    }
    if (
      !isPaidStatus(burst.booking_status) &&
      !isBonusStatus(burst.booking_status) &&
      roundCents(burst.media_amount) !== 0
    ) {
      breaches.push({
        rule: "money_only_on_paid",
        detail: `${burst.booking_status} burst carries $${burst.media_amount}`,
      })
    }
  }

  const bonusFlights = (item.panels[0]?.flights ?? []).filter((f) => f.is_bonus)
  const bonusBursts = item.bursts.filter((b) => isBonusStatus(b.booking_status))
  if (bonusFlights.length > 0 && bonusBursts.length === 0) {
    breaches.push({
      rule: "bonus_zero_own_flight",
      detail: "bonus flights have no bonus burst",
    })
  }

  const flights = item.panels.flatMap((p) => p.flights)
  if (flights.length > 0) {
    for (const burst of item.bursts) {
      const from = burst.start_date
      const to = burst.end_date
      if (!from || !to) continue
      const inside = flights.some(
        (f) => f.period_start <= to && f.period_end >= from,
      )
      if (!inside) {
        breaches.push({
          rule: "bursts_inside_runs",
          detail: `burst ${from}–${to} sits outside status runs`,
        })
      }
    }
  }

  const sections = new Set<string>()
  const rawSection = norm(item.grouping.publisher_format_name)
  if (rawSection) sections.add(rawSection)
  for (const p of item.panels) {
    const n = norm(p.descriptors.publisher_format_name)
    if (n) sections.add(n)
  }
  if (sections.size > 1) {
    breaches.push({
      rule: "one_section_per_line",
      detail: `line spans ${[...sections].join(" / ")}`,
    })
  }

  const sectionHeader = rawSection
  const otherRaw = item.panels
    .map((p) => norm(p.descriptors.publisher_format_name))
    .find((n) => n && n !== sectionHeader)
  if (sectionHeader && otherRaw) {
    breaches.push({
      rule: "format_from_section",
      detail: `format ${otherRaw} is not section ${sectionHeader}`,
    })
  }

  if (campaignWindow?.start && campaignWindow?.end) {
    for (const burst of item.bursts) {
      if (!inCampaignWindow(burst.start_date, burst.end_date, campaignWindow)) {
        breaches.push({
          rule: "campaign_window",
          detail: `burst ${burst.start_date}–${burst.end_date} sits outside campaign ${campaignWindow.start}–${campaignWindow.end}`,
        })
      }
    }
  }

  return breaches
}

export function parserAuditRowFromLine(item: ProposedLineItem): LineAuditRow | null {
  return auditRowFromProposedLine(item)
}

function push(
  list: LineAuditDiscrepancy[],
  row: LineAuditDiscrepancy,
): void {
  list.push(row)
}

export function reconcileLineAudit(
  proposal: IngestProposal,
  audit: LineAudit,
  opts?: { campaignWindow?: CampaignWindow | null },
): LineAudit {
  const auditByRow = new Map(audit.rows.map((r) => [r.row, r]))
  const discrepancies: LineAuditDiscrepancy[] = []
  const greenRows = new Set<number>()

  for (const item of proposal.line_items) {
    const parserRow = parserAuditRowFromLine(item)
    const ref = item.panels[0]?.source_row_ref ?? ""
    const row = parserRow?.row ?? sourceRowNumber(ref)
    if (row == null) continue
    const auditRow = auditByRow.get(row) ?? null
    const rowDiscrepancies: LineAuditDiscrepancy[] = []

    if (!auditRow || !parserRow) {
      rowDiscrepancies.push({
        source_row_ref: ref,
        row,
        field: "identity",
        parser: parserRow?.identity ?? null,
        audit: auditRow?.identity ?? null,
        cells: cellsFor(auditRow),
      })
    } else {
      if (!identityEq(parserRow.identity, auditRow.identity)) {
        rowDiscrepancies.push({
          source_row_ref: ref,
          row,
          field: "identity",
          parser: parserRow.identity,
          audit: auditRow.identity,
          cells: cellsFor(auditRow),
        })
      }
      if (!moneyEq(parserRow.money.amount, auditRow.money.amount)) {
        rowDiscrepancies.push({
          source_row_ref: ref,
          row,
          field: "money",
          parser: parserRow.money,
          audit: auditRow.money,
          cells: cellsFor(auditRow, parserRow.money.cell ? [parserRow.money.cell] : []),
        })
      }
      if (!datesEq(parserRow.dates_implied, auditRow.dates_implied)) {
        rowDiscrepancies.push({
          source_row_ref: ref,
          row,
          field: "dates",
          parser: parserRow.dates_implied,
          audit: auditRow.dates_implied,
          cells: cellsFor(auditRow),
        })
      }
      if (norm(parserRow.format_header) !== norm(auditRow.format_header)) {
        rowDiscrepancies.push({
          source_row_ref: ref,
          row,
          field: "format",
          parser: parserRow.format_header,
          audit: auditRow.format_header,
          cells: cellsFor(auditRow),
        })
      }
      const parserKind = parserBuyKind(item)
      const auditKind = auditBuyKind(auditRow)
      if (auditKind != null && parserKind !== auditKind) {
        rowDiscrepancies.push({
          source_row_ref: ref,
          row,
          field: "buy_type",
          parser: { kind: parserKind },
          audit: { kind: auditKind, status_runs: auditRow.status_runs },
          cells: cellsFor(auditRow),
        })
      }
    }

    for (const breach of invariantBreachesForLine(item, opts?.campaignWindow)) {
      rowDiscrepancies.push({
        source_row_ref: ref,
        row,
        field: "invariant",
        rule: breach.rule,
        parser: {
          identity: identityFromProposedLine(item),
          money_amount: moneyAmountFromProposedLine(item),
          dates: datesFromProposedLine(item),
          format_header: formatHeaderFromProposedLine(item),
        },
        audit: auditRow,
        cells: cellsFor(auditRow),
      })
    }

    if (rowDiscrepancies.length === 0) greenRows.add(row)
    for (const d of rowDiscrepancies) push(discrepancies, d)
  }

  return {
    ...audit,
    discrepancies,
    green_count: greenRows.size,
  }
}

export function unresolvedDiscrepancyRows(audit: LineAudit | null | undefined): number[] {
  if (!audit?.discrepancies?.length) return []
  const resolved = audit.resolutions ?? {}
  const rows = new Set<number>()
  for (const d of audit.discrepancies) {
    const id = discrepancyQuestionId(d.row)
    const ref = d.source_row_ref
    if (resolved[id] || resolved[ref] || resolved[`r${d.row}`]) continue
    rows.add(d.row)
  }
  return [...rows].sort((a, b) => a - b)
}

export function discrepanciesForRow(
  audit: LineAudit | null | undefined,
  row: number,
): LineAuditDiscrepancy[] {
  return (audit?.discrepancies ?? []).filter((d) => d.row === row)
}

export function formatDiscrepancyCardText(args: {
  row: number
  items: LineAuditDiscrepancy[]
}): string {
  const money = args.items.find((d) => d.field === "money")
  const identity = args.items.find((d) => d.field === "identity")
  const dates = args.items.find((d) => d.field === "dates")
  const format = args.items.find((d) => d.field === "format")
  const invariant = args.items.filter((d) => d.field === "invariant")
  const bits: string[] = [`Row r${args.row} disagrees.`]
  if (money) {
    const parserAmt =
      money.parser && typeof money.parser === "object" && money.parser !== null
        ? (money.parser as { amount?: number | null }).amount
        : money.parser
    const auditAmt =
      money.audit && typeof money.audit === "object" && money.audit !== null
        ? (money.audit as { amount?: number | null }).amount
        : money.audit
    const cells = money.cells.length ? ` (${money.cells.join(", ")})` : ""
    bits.push(`Parser money ${parserAmt ?? "—"}; audit money ${auditAmt ?? "—"}${cells}.`)
  }
  if (identity) {
    bits.push("Parser and audit disagree on panel / name / market / section.")
  }
  if (dates) bits.push("Parser and audit disagree on dates.")
  if (format) bits.push("Parser and audit disagree on format.")
  const buyType = args.items.find((d) => d.field === "buy_type")
  if (buyType) bits.push("Parser and audit disagree on buy type.")
  for (const inv of invariant) {
    bits.push(`Invariant ${inv.rule ?? "breach"}.`)
  }
  bits.push("Choose Parser, Audit, or type the value.")
  return bits.join(" ")
}

export function parseResolutionChoice(
  answer: string,
): LineAuditResolutionChoice {
  const raw = answer.replace(/\s+/g, " ").trim()
  const lower = raw.toLowerCase()
  if (lower === PARSER_RESOLUTION_LABEL.toLowerCase() || lower === "parser") {
    return "parser"
  }
  if (lower === AUDIT_RESOLUTION_LABEL.toLowerCase() || lower === "audit") {
    return "audit"
  }
  return "typed"
}

function setLineMoney(item: ProposedLineItem, amount: number): ProposedLineItem {
  const paidIdx = item.bursts
    .map((b, i) => (b.booking_status === "paid" ? i : -1))
    .filter((i) => i >= 0)
  const bursts = item.bursts.map((b) => ({ ...b }))
  if (paidIdx.length === 1) {
    bursts[paidIdx[0]!] = {
      ...bursts[paidIdx[0]!]!,
      media_amount: roundCents(amount),
    }
  } else if (paidIdx.length > 1) {
    const total = paidIdx.reduce((s, i) => s + bursts[i]!.media_amount, 0)
    paidIdx.forEach((i, n) => {
      const share =
        total === 0
          ? amount / paidIdx.length
          : (bursts[i]!.media_amount / total) * amount
      bursts[i] = { ...bursts[i]!, media_amount: roundCents(share) }
      if (n === paidIdx.length - 1) {
        const used = paidIdx
          .slice(0, -1)
          .reduce((s, j) => s + bursts[j]!.media_amount, 0)
        bursts[i] = { ...bursts[i]!, media_amount: roundCents(amount - used) }
      }
    })
  }
  return { ...item, bursts, bought_rate: roundCents(amount) }
}

function overlayAuditOnLine(
  item: ProposedLineItem,
  auditRow: LineAuditRow,
): ProposedLineItem {
  const identity = auditRow.identity
  const grouping = { ...item.grouping }
  if (identity.panel) grouping.site_number = identity.panel
  if (identity.name) grouping.panel_name = identity.name
  if (identity.market) grouping.market = identity.market
  if (identity.section || auditRow.format_header) {
    grouping.publisher_format_name =
      identity.section ?? auditRow.format_header ?? grouping.publisher_format_name
  }
  let next: ProposedLineItem = { ...item, grouping }
  if (auditRow.money.amount != null) {
    next = setLineMoney(next, auditRow.money.amount)
  }
  if (auditRow.dates_implied.length > 0 && next.bursts.length > 0) {
    const d0 = auditRow.dates_implied[0]!
    next = {
      ...next,
      bursts: next.bursts.map((b, i) =>
        i === 0
          ? {
              ...b,
              start_date: d0.from ?? b.start_date,
              end_date: d0.to ?? b.end_date,
            }
          : b,
      ),
    }
  }
  return next
}

export function recordDiscrepancyResolution(args: {
  review: IngestReviewPackage
  row: number
  answer: string
  by: string
}): IngestReviewPackage {
  const audit = args.review.line_audit
  if (!audit) return args.review
  const choice = parseResolutionChoice(args.answer)
  const id = discrepancyQuestionId(args.row)
  const resolution: LineAuditResolution = {
    choice,
    typed: choice === "typed" ? args.answer.trim() : null,
    by: args.by,
    at: new Date().toISOString(),
  }
  const nextAudit: LineAudit = {
    ...audit,
    resolutions: { ...(audit.resolutions ?? {}), [id]: resolution },
  }
  let proposal = args.review.proposal
  if (proposal && choice !== "parser") {
    const auditRow = audit.rows.find((r) => r.row === args.row)
    proposal = {
      ...proposal,
      line_items: proposal.line_items.map((item) => {
        const ref = item.panels[0]?.source_row_ref ?? ""
        if (sourceRowNumber(ref) !== args.row) return item
        if (choice === "audit" && auditRow) return overlayAuditOnLine(item, auditRow)
        if (choice === "typed") {
          const n = Number(String(args.answer).replace(/[$,]/g, ""))
          if (Number.isFinite(n)) return setLineMoney(item, n)
        }
        return item
      }),
    }
  }
  return { ...args.review, proposal, line_audit: nextAudit }
}
