/**
 * Pure pieces of publishBillingRevision (design 5.3), kept apart so they
 * can be tested without a database.
 */

import type { ApprovedSlice } from "@/lib/finance/approvedSlice"

import { stableStringify } from "./planBillingRevision"
import type { Cents, MonthKey, RevisionOk } from "./types"

export type BillingRowLike = {
  lineItemId: string
  component: "media" | "fee" | "adserving"
  month: string // YYYY-MM-01
  amountCents: number
  source: "computed" | "override"
}

function monthDate(m: MonthKey): string {
  return `${m}-01`
}

/**
 * Base billing rows with each changed line's media (and fee, when it moved)
 * replaced by the planned cells. Changed cells carry source 'override'
 * (the revision writes a manual override for them). Every other row is
 * copied as it is, including __service__* rows and ad serving.
 */
export function buildRevisedBillingRows(
  baseRows: readonly BillingRowLike[],
  afterCells: RevisionOk["afterCells"],
): BillingRowLike[] {
  const replaceMedia = new Set(afterCells.filter((c) => c.mediaChanged).map((c) => c.lineItemId))
  const replaceFee = new Set(afterCells.filter((c) => c.feeChanged).map((c) => c.lineItemId))
  const out: BillingRowLike[] = baseRows
    .filter(
      (r) =>
        !(r.component === "media" && replaceMedia.has(r.lineItemId)) &&
        !(r.component === "fee" && replaceFee.has(r.lineItemId)),
    )
    .map((r) => ({ ...r }))
  for (const c of afterCells) {
    if (c.mediaChanged) {
      for (const [m, v] of Object.entries(c.media)) {
        if (v !== 0) out.push({ lineItemId: c.lineItemId, component: "media", month: monthDate(m), amountCents: v, source: "override" })
      }
    }
    if (c.feeChanged) {
      for (const [m, v] of Object.entries(c.fee)) {
        if (v !== 0) out.push({ lineItemId: c.lineItemId, component: "fee", month: monthDate(m), amountCents: v, source: "override" })
      }
    }
  }
  return out.sort((a, b) =>
    `${a.lineItemId}|${a.component}|${a.month}`.localeCompare(`${b.lineItemId}|${b.component}|${b.month}`),
  )
}

/** line|component|YYYY-MM -> cents, zero cells dropped. */
export function rowCentsMap(rows: ReadonlyArray<{ lineItemId: string; component: string; month: string; amountCents: number }>): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of rows) {
    if (!r.amountCents) continue
    const key = `${r.lineItemId}|${r.component}|${String(r.month).slice(0, 7)}`
    out.set(key, (out.get(key) ?? 0) + r.amountCents)
  }
  return out
}

/** Keys whose cents differ between two maps (sorted). */
export function diffCentsMaps(a: Map<string, number>, b: Map<string, number>): string[] {
  const keys = new Set([...a.keys(), ...b.keys()])
  return [...keys].filter((k) => (a.get(k) ?? 0) !== (b.get(k) ?? 0)).sort()
}

/** a - b per key, zeros dropped. */
export function subtractCentsMaps(a: Map<string, number>, b: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>()
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const d = (a.get(k) ?? 0) - (b.get(k) ?? 0)
    if (d !== 0) out.set(k, d)
  }
  return out
}

export type OverrideMonth = { month: MonthKey; amount: number }

/**
 * billing_overrides.months for one line and component: every month from
 * the line's first to last month in base or after, zeros included, in
 * dollars. Same shape as the editor writes ({ month: "YYYY-MM", amount }).
 */
export function overrideMonthsFor(
  baseCells: Record<MonthKey, Cents>,
  afterCells: Record<MonthKey, Cents>,
): OverrideMonth[] {
  const months = [...new Set([...Object.keys(baseCells), ...Object.keys(afterCells)])].sort()
  return months.map((m) => ({ month: m, amount: (afterCells[m] ?? 0) / 100 }))
}

/**
 * The C2 sum law the editor's publish gate (validateManualOverrideSumRules)
 * applies: override months must add to the line's billed total within $0.01.
 * The revision checks against the base version's line totals, which the
 * base publish already passed.
 */
export function overrideSumViolations(
  checks: Array<{ lineItemId: string; component: "media" | "fee"; months: OverrideMonth[]; expectedCents: Cents }>,
): string[] {
  const out: string[] = []
  for (const c of checks) {
    const actualCents = Math.round(c.months.reduce((s, m) => s + m.amount, 0) * 100)
    if (Math.abs(actualCents - c.expectedCents) > 1) {
      out.push(`${c.lineItemId} ${c.component}: override months add to ${actualCents}c, line bills ${c.expectedCents}c`)
    }
  }
  return out
}

/**
 * Copy of the frozen approved slice for the new version. Totals never move
 * (line totals are fixed); a changed line's months list follows its new
 * billing months, so a prebill month shows as included.
 */
export function reviseApprovedSlice(
  slice: unknown,
  revisedRows: readonly BillingRowLike[],
  changedLineIds: ReadonlySet<string>,
): ApprovedSlice | null {
  if (slice == null || typeof slice !== "object") return null
  const s = slice as ApprovedSlice
  if (!Array.isArray(s.lines)) return s
  const monthsByLine = new Map<string, Set<string>>()
  for (const r of revisedRows) {
    if (!changedLineIds.has(r.lineItemId) || r.amountCents === 0) continue
    const set = monthsByLine.get(r.lineItemId) ?? new Set<string>()
    set.add(r.month.slice(0, 7))
    monthsByLine.set(r.lineItemId, set)
  }
  return {
    ...s,
    lines: s.lines.map((l) =>
      changedLineIds.has(l.lineItemId) && monthsByLine.has(l.lineItemId)
        ? { ...l, months: [...new Set([...l.months, ...monthsByLine.get(l.lineItemId)!])].sort() }
        : l,
    ),
  }
}

export type FinanceEditDraft = {
  month: MonthKey
  component: "media" | "fee"
  oldCents: Cents
  newCents: Cents
}

/** One finance_edits row per changed MBA-month and component. */
export function financeEditDrafts(plan: RevisionOk): FinanceEditDraft[] {
  const out: FinanceEditDraft[] = []
  for (const m of plan.months) {
    if (m.media.before + m.production.before !== m.media.after + m.production.after) {
      out.push({
        month: m.month,
        component: "media",
        oldCents: m.media.before + m.production.before,
        newCents: m.media.after + m.production.after,
      })
    }
    if (m.fee.before !== m.fee.after) {
      out.push({ month: m.month, component: "fee", oldCents: m.fee.before, newCents: m.fee.after })
    }
  }
  return out
}

/** The diff column on billing_revisions: changed cells only. */
export function revisionDiffPayload(plan: RevisionOk) {
  return {
    lines: plan.lines
      .filter((l) => l.media.length > 0 || l.fee.length > 0 || l.skipped)
      .map((l) => ({ lineItemId: l.lineItemId, label: l.label, media: l.media, fee: l.fee, skipped: l.skipped ?? null })),
    months: plan.months
      .filter((m) => m.total.before !== m.total.after)
      .map((m) => ({
        month: m.month,
        lock: m.lock.reasons,
        media: m.media,
        fee: m.fee,
        production: m.production,
        total: m.total,
      })),
    credits: plan.credits,
    warnings: plan.warnings,
  }
}

/** The before cells of every changed line, for undo (restore target). */
export function restoreTargetFrom(
  baseLines: ReadonlyArray<{ lineItemId: string; media: Record<MonthKey, Cents>; fee: Record<MonthKey, Cents> }>,
  plan: RevisionOk,
): { media: Record<string, Record<MonthKey, Cents>>; fee: Record<string, Record<MonthKey, Cents>> } {
  const media: Record<string, Record<MonthKey, Cents>> = {}
  const fee: Record<string, Record<MonthKey, Cents>> = {}
  for (const c of plan.afterCells) {
    const base = baseLines.find((l) => l.lineItemId === c.lineItemId)
    if (!base) continue
    const fill = (b: Record<MonthKey, Cents>, a: Record<MonthKey, Cents>) => {
      const out: Record<MonthKey, Cents> = {}
      for (const m of new Set([...Object.keys(b), ...Object.keys(a)])) out[m] = b[m] ?? 0
      return out
    }
    if (c.mediaChanged) media[c.lineItemId] = fill(base.media, c.media)
    if (c.feeChanged) fee[c.lineItemId] = fill(base.fee, c.fee)
  }
  return { media, fee }
}

export function canonicalJson(value: unknown): unknown {
  return JSON.parse(stableStringify(value))
}
