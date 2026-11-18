/**
 * V66 B (C-342 to C-345): what an expert grid Apply does with a cell the
 * planner did not touch.
 *
 * The grid's cells hold real deliverables. Rebuilding a saved burst from them
 * (quantity x rate) cannot give back what was saved when the budget includes
 * fees, is not a whole multiple of the rate, or the burst has its own rate.
 * So the grid carries each line's saved bursts from open to Apply:
 *
 * - On open, every row gets {@link ExpertCarry}: the rate, buy type and
 *   Budget Includes Fees it opened with, and its saved bursts in groups. A
 *   group is the week columns some saved bursts touch, joined where two
 *   bursts share a week or a merged span covers both, so one cell never
 *   holds bursts from two groups. Each group keeps a print of its cells:
 *   the spans that cover them (bounds, dates, quantity), the week cells and
 *   the day cells.
 * - On Apply a group is untouched when its print is unchanged and the row
 *   still has the rate, buy type and Budget Includes Fees it opened with. An
 *   untouched group writes its saved bursts back as they were: budget,
 *   deliverables, rate, cost and amount (Production), dates. Every other
 *   cell is priced from the grid ({@link expertCellBudget}).
 * - Untouched is read from the values, so every way the grid edits a row
 *   (typing, paste, fill, cut, resize, a span edit, the rate, the Budget
 *   Includes Fees box) drops the carry for what it changed, with no hook in
 *   the grid's edit code. Typing a cell's own number back counts as
 *   untouched.
 * - A cell that holds several bursts (two bursts in one week, a multi-week
 *   burst spread over weeks, day detail, a span with weeks around it) is one
 *   group: carried whole while every cell in it is untouched, priced from
 *   the grid whole once any cell in it is edited (the burst count can then
 *   change, as it always has).
 *
 * Only bursts that reached the grid are carried: a saved budget, a quantity
 * above 0 (or a bonus, package inclusions or fixed cost burst, which the
 * import places whatever their quantity), dates inside the campaign's weeks,
 * and a cell in the group that is not blank. Anything else is left to the
 * mapper, as before (for example a package burst with quantity 0, which
 * `keepZeroQuantityPackageBurstsOnApply` keeps).
 */
import { toDateOnlyString } from "@/lib/dates/civil"
import { formatRate } from "@/lib/format/money"
import { roundMoney2 } from "@/lib/money"
import { formatBurstDateLocal, parseBurstDateLocal } from "./burstDate"
import { burstWindowForWeekColumn } from "./expertSpanDates"
import { parseBurstMoney } from "./formatBurstsForPersist"
import type { WeeklyGanttWeekColumn } from "../utils/weeklyGanttColumns"

/** One saved burst, as the line held it when the grid opened. */
type CarriedBurst = {
  budget: unknown
  buyAmount: unknown
  calculatedValue: unknown
  cost?: unknown
  amount?: unknown
  startYmd: string
  endYmd: string
}

type ExpertCarryGroup = {
  weekKeys: string[]
  print: string
  bursts: CarriedBurst[]
}

export type ExpertCarry = {
  unitRate: number
  buyType: string
  budgetIncludesFees: boolean
  groups: ExpertCarryGroup[]
}

/** The row fields the carry reads. Every expert schedule row has them. */
export type ExpertCarryRow = {
  expertCarry?: ExpertCarry
  unitRate?: unknown
  buyType?: string | null
  budgetIncludesFees?: boolean
  weeklyValues: Readonly<Record<string, unknown>>
  dailyValues?: Readonly<Record<string, unknown>>
  mergedWeekSpans?: ReadonlyArray<{
    startWeekKey: string
    endWeekKey: string
    totalQty?: number
    startYmd?: string
    endYmd?: string
    buyType?: string
  }>
}

/** A burst budget as the expert mappings write it: a plain number string, 2 dp. */
const plainMoney = (n: number) => (Number.isFinite(n) ? String(roundMoney2(n)) : "0")

const lower = (v: unknown) => String(v ?? "").trim().toLowerCase()
const present = (v: unknown) => v !== undefined && v !== null && !(typeof v === "string" && v.trim() === "")

/** A cell as the grid shows it: blank and 0 are the same (the grid blanks a 0). */
function cellPrint(v: unknown): string {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : Number.NaN
  return Number.isFinite(n) && n !== 0 ? String(n) : ""
}

function storedQty(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/,/g, "")) : Number.NaN
  return Number.isFinite(n) ? n : 0
}

function rateOf(v: unknown): number {
  return parseBurstMoney(v)
}

/** A burst date's civil day: a Date's own local day (forms and grids hold local midnights), a string as saved. */
function ymd(v: unknown): string {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : toDateOnlyString(v)
  if (typeof v === "string") return formatBurstDateLocal(v)
  return ""
}

/** The week column a civil day falls in: the last week key on or before it. */
function weekOfDay(day: string, weekKeys: readonly string[]): string | undefined {
  let found: string | undefined
  for (const k of weekKeys) {
    if (k > day) break
    found = k
  }
  return found
}

function weekPrint(row: ExpertCarryRow, weekKey: string, nextKey: string | undefined): string {
  const parts: string[] = []
  for (const sp of row.mergedWeekSpans ?? []) {
    if (sp.startWeekKey <= weekKey && weekKey <= sp.endWeekKey) {
      parts.push(
        `s${sp.startWeekKey}~${sp.endWeekKey}~${cellPrint(sp.totalQty)}~${sp.startYmd ?? ""}~${sp.endYmd ?? ""}~${sp.buyType ?? ""}`
      )
    }
  }
  parts.push(`w${cellPrint(row.weeklyValues[weekKey])}`)
  const days = Object.entries(row.dailyValues ?? {})
    .filter(([d, v]) => d >= weekKey && (nextKey === undefined || d < nextKey) && cellPrint(v) !== "")
    .sort(([a], [b]) => a.localeCompare(b))
  for (const [d, v] of days) parts.push(`d${d}=${cellPrint(v)}`)
  return parts.join(",")
}

function groupPrint(row: ExpertCarryRow, keys: readonly string[], weekKeys: readonly string[]): string {
  return keys
    .map((k) => `${k}:${weekPrint(row, k, weekKeys[weekKeys.indexOf(k) + 1])}`)
    .join("|")
}

/** Some cell in these weeks holds a quantity: the group reached the grid. */
function holdsQuantity(row: ExpertCarryRow, keys: readonly string[], weekKeys: readonly string[]): boolean {
  return keys.some(
    (k) =>
      cellPrint(row.weeklyValues[k]) !== "" ||
      (row.mergedWeekSpans ?? []).some(
        (sp) => sp.startWeekKey <= k && k <= sp.endWeekKey && cellPrint(sp.totalQty) !== ""
      ) ||
      Object.entries(row.dailyValues ?? {}).some(
        ([d, v]) => weekOfDay(d, weekKeys) === k && cellPrint(v) !== ""
      )
  )
}

function rawBursts(item: { bursts?: unknown; bursts_json?: unknown }): Record<string, unknown>[] {
  let raw: unknown = item.bursts
  if (raw == null && item.bursts_json != null) {
    try {
      raw = typeof item.bursts_json === "string" ? JSON.parse(item.bursts_json) : item.bursts_json
    } catch {
      raw = []
    }
  }
  return Array.isArray(raw) ? (raw as Record<string, unknown>[]) : []
}

/**
 * A saved burst the carry can give back: it has a budget (a Production burst
 * saved as cost and amount only, or a blank budget, is priced by the mapper as
 * before), and a quantity, or is a bonus, package inclusions or fixed cost
 * burst (the import places those whatever their quantity).
 */
function reachesGrid(b: Record<string, unknown>, lineBuyType: string): boolean {
  if (!present(b.budget)) return false
  const bt = lower(b.buyType) || lineBuyType
  if (bt === "bonus" || bt === "package_inclusions" || bt === "fixed_cost") return true
  return storedQty(b.calculatedValue ?? b.calculated_value) > 0
}

/**
 * Open: give each row its carry. Rows and line items are in the same order
 * (every to-expert mapper maps line items one to one). Mutates the rows and
 * returns them, like `projectLumpSumCardBudgetsOntoExpertRows`, which runs
 * first so the print is the grid as the planner sees it.
 */
export function attachExpertCarry<R extends ExpertCarryRow>(
  rows: R[],
  lineItems: ReadonlyArray<{ bursts?: unknown; bursts_json?: unknown; buyType?: unknown; buy_type?: unknown }>,
  weekColumns: readonly WeeklyGanttWeekColumn[],
  campaignStartDate: Date,
  campaignEndDate: Date
): R[] {
  const weekKeys = weekColumns.map((c) => c.weekKey)
  const windows = weekColumns.map((c) => {
    const w = burstWindowForWeekColumn(c, campaignStartDate, campaignEndDate)
    return { key: c.weekKey, start: toDateOnlyString(w.start), end: toDateOnlyString(w.end) }
  })
  rows.forEach((row, i) => {
    const item = lineItems[i]
    if (!item) return
    const lineBuyType = lower(item.buyType ?? item.buy_type)
    const parent = new Map<string, string>()
    const find = (k: string): string => {
      let r = k
      while (parent.get(r) !== r) r = parent.get(r)!
      return r
    }
    const join = (keys: readonly string[]) => {
      for (const k of keys) if (!parent.has(k)) parent.set(k, k)
      for (const k of keys.slice(1)) parent.set(find(k), find(keys[0]!))
    }
    const placed: { burst: CarriedBurst; key: string }[] = []
    for (const b of rawBursts(item)) {
      const startYmd = ymd(b.startDate ?? b.start_date)
      const endYmd = ymd(b.endDate ?? b.end_date) || startYmd
      if (!startYmd || !reachesGrid(b, lineBuyType)) continue
      const keys = windows.filter((w) => startYmd <= w.end && endYmd >= w.start).map((w) => w.key)
      if (keys.length === 0) continue
      join(keys)
      placed.push({
        key: keys[0]!,
        burst: {
          budget: b.budget,
          buyAmount: b.buyAmount ?? b.buy_amount,
          calculatedValue: b.calculatedValue ?? b.calculated_value,
          ...("cost" in b ? { cost: b.cost } : {}),
          ...("amount" in b ? { amount: b.amount } : {}),
          startYmd,
          endYmd,
        },
      })
    }
    if (placed.length === 0) return
    for (const sp of row.mergedWeekSpans ?? []) {
      join(weekKeys.filter((k) => sp.startWeekKey <= k && k <= sp.endWeekKey))
    }
    const byRoot = new Map<string, CarriedBurst[]>()
    for (const p of placed) {
      const root = find(p.key)
      byRoot.set(root, [...(byRoot.get(root) ?? []), p.burst])
    }
    const groups: ExpertCarryGroup[] = []
    for (const [root, bursts] of byRoot) {
      const keys = weekKeys.filter((k) => parent.has(k) && find(k) === root)
      if (holdsQuantity(row, keys, weekKeys)) {
        groups.push({ weekKeys: keys, print: groupPrint(row, keys, weekKeys), bursts })
      }
    }
    if (groups.length === 0) return
    row.expertCarry = {
      unitRate: rateOf(row.unitRate),
      buyType: lower(row.buyType),
      budgetIncludesFees: Boolean(row.budgetIncludesFees),
      groups,
    }
  })
  return rows
}

/** The row's groups the planner has not touched since the grid opened. */
function intactCarryGroups(row: ExpertCarryRow, weekKeys: readonly string[]): ExpertCarryGroup[] {
  const c = row.expertCarry
  if (!c) return []
  if (
    rateOf(row.unitRate) !== c.unitRate ||
    lower(row.buyType) !== c.buyType ||
    Boolean(row.budgetIncludesFees) !== c.budgetIncludesFees
  ) {
    return []
  }
  return c.groups.filter((g) => groupPrint(row, g.weekKeys, weekKeys) === g.print)
}

/**
 * The week columns an untouched group covers, and the saved budget it carries.
 * The grid's money reads this so its totals are what Apply will save.
 */
export function carriedMoney(
  row: ExpertCarryRow,
  weekKeys: readonly string[]
): { weekKeys: Set<string>; budget: number } {
  const groups = intactCarryGroups(row, weekKeys)
  return {
    weekKeys: new Set(groups.flatMap((g) => g.weekKeys)),
    budget: groups.reduce((s, g) => s + g.bursts.reduce((t, b) => t + parseBurstMoney(b.budget), 0), 0),
  }
}

/** Which week column holds a day key, for summing the cells a carry does not cover. */
export function weekKeyOfDay(dayKey: string, weekKeys: readonly string[]): string | undefined {
  return weekOfDay(dayKey, weekKeys)
}

/** The template's rate text, written for the saved rate (same formatter the mapper used). */
function carriedBuyAmount(template: unknown, saved: unknown): unknown {
  const was = parseBurstMoney(template)
  const now = parseBurstMoney(saved)
  if (was === now) return template
  if (typeof template === "string") {
    if (template === formatRate(was)) return formatRate(now)
    if (template === plainMoney(was)) return plainMoney(now)
  }
  return saved
}

/**
 * A saved burst in the shape the mapper gave this cell's burst (same keys,
 * same order, same formats), so a line Apply already returned exactly stays
 * byte for byte the same.
 */
function carriedBurst<B extends Record<string, unknown>>(template: B, saved: CarriedBurst): B {
  const out: Record<string, unknown> = { ...template }
  const budget = parseBurstMoney(saved.budget)
  out.budget = typeof template.budget === "number" ? budget : plainMoney(budget)
  // A rate, cost or amount the burst was saved without keeps the mapper's value.
  if ("buyAmount" in template && present(saved.buyAmount)) {
    out.buyAmount = carriedBuyAmount(template.buyAmount, saved.buyAmount)
  }
  if ("calculatedValue" in template) {
    const qty = storedQty(saved.calculatedValue)
    if (qty > 0) out.calculatedValue = qty
  }
  // Television writes TARPs as the deliverable's text.
  if ("tarps" in template) out.tarps = String(out.calculatedValue)
  for (const key of ["cost", "amount"] as const) {
    if (key in template && present(saved[key])) {
      const n = storedQty(saved[key])
      if (Number.isFinite(n)) out[key] = n
    }
  }
  if (ymd(template.startDate) !== saved.startYmd) out.startDate = parseBurstDateLocal(saved.startYmd)
  if (ymd(template.endDate) !== saved.endYmd) out.endDate = parseBurstDateLocal(saved.endYmd)
  return out as B
}

/**
 * Apply: the line the mapper built from a row, with each untouched group's
 * generated bursts replaced by its saved bursts, in place.
 */
function applyExpertCarry<L>(row: ExpertCarryRow, line: L, weekKeys: readonly string[]): L {
  const groups = intactCarryGroups(row, weekKeys)
  const bursts = (line as { bursts?: unknown }).bursts
  if (groups.length === 0 || !Array.isArray(bursts) || bursts.length === 0) return line
  const groupOfWeek = new Map<string, number>()
  groups.forEach((g, i) => g.weekKeys.forEach((k) => groupOfWeek.set(k, i)))
  const groupOf = (b: Record<string, unknown>) => {
    const week = weekOfDay(ymd(b.startDate), weekKeys)
    return week === undefined ? undefined : groupOfWeek.get(week)
  }
  const generated = new Map<number, Record<string, unknown>[]>()
  for (const b of bursts as Record<string, unknown>[]) {
    const g = groupOf(b)
    if (g !== undefined) generated.set(g, [...(generated.get(g) ?? []), b])
  }
  const out: unknown[] = []
  const done = new Set<number>()
  for (const b of bursts as Record<string, unknown>[]) {
    const g = groupOf(b)
    if (g === undefined) {
      out.push(b)
      continue
    }
    if (done.has(g)) continue
    done.add(g)
    const mine = generated.get(g)!
    groups[g]!.bursts.forEach((saved, n) => out.push(carriedBurst(mine[n] ?? mine[0]!, saved)))
  }
  return { ...line, bursts: out }
}

/**
 * Every from-expert mapper: build each row's line as before, then put the
 * untouched cells' saved bursts back.
 */
export function mapRowsWithCarry<R extends ExpertCarryRow, L>(
  rows: readonly R[],
  weekColumns: readonly WeeklyGanttWeekColumn[],
  toLine: (row: R, idx: number) => L
): L[] {
  const weekKeys = weekColumns.map((c) => c.weekKey)
  return rows.map((row, idx) => applyExpertCarry(row, toLine(row, idx), weekKeys))
}
