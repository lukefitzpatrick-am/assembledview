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
 * Only bursts that reached the grid are carried in groups: a saved budget
 * (a bonus or package inclusions burst may be saved with a blank one), a
 * quantity above 0 (or a bonus, package inclusions or fixed cost burst, which
 * the import places whatever their quantity, or a panels burst with a rate,
 * which OOH's import reads as the panel count), dates inside the campaign's
 * weeks, and a cell in the group that is not blank. A carried burst keeps its
 * own buy type (or none) as saved.
 *
 * C-370 (V99 A): a saved burst the grid cannot place (no campaign week, or no
 * quantity the import can open: 0 deliverables with a $0.00 rate or a $0.00
 * or blank budget, V102 A) has no cell the planner could edit, so Apply gives it back exactly
 * as saved, outside every group, whatever else changed. The grid's money
 * counts its budget. The cells the import makes for such a burst with 0 (a 0
 * span, a 0 week cell, the empty line's campaign burst) carry no quantity or
 * money and are not written beside it.
 *
 * Anything else is left to the mapper, as before (for example a package
 * burst with quantity 0, which `keepZeroQuantityPackageBurstsOnApply` keeps).
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
  /** The burst's own buy type, when it was saved with one (OOH writes `bonus` on a bonus burst). */
  buyType?: unknown
  /** A bonus, package inclusions or fixed cost burst: saved without a quantity, it takes the grid's. */
  takesGridQty: boolean
  startYmd: string
  endYmd: string
  /**
   * C-370: a burst the grid cannot place (or, V105 A, carried in a lump-sum week 1) has no
   * cell of its own, so Apply gives back the line's own burst, every field as the line held it.
   */
  asSaved?: Record<string, unknown>
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
  /** C-370 (V99 A): saved bursts the grid cannot place, given back as saved on every Apply. */
  unplaced: CarriedBurst[]
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

const isInclusion = (bt: string) => bt === "bonus" || bt === "package_inclusions"
const takesGridQty = (bt: string) => isInclusion(bt) || bt === "fixed_cost"

/**
 * C-370 (V99 A): no import can open a quantity for this burst: 0 deliverables
 * and no rate or no budget to work one out from (Radio's import works out
 * deliverables from budget and rate; OOH reads a panels rate as the count).
 * Fixed cost always opens as 1, and package inclusions opens as 1 on the
 * fourteen non-spread grids, so neither is ever counted here. Production
 * opens its amount.
 *
 * shortcut: a second copy of the imports' quantity rules, not what each
 * import placed (C-370, C370 review F4; live 0). Too narrow: OOH (not panels)
 * and the 13 week-cell imports read deliverables only, so a burst with a
 * budget and a rate but 0 deliverables is neither placed nor carried, and
 * Radio opens a budget under one spot as 0: a no-edit Apply drops either.
 * Too wide: on an OOH panels line a burst with its own bonus type, a rate and
 * 0 panels opens its rate as the count but is counted here, so beside a
 * placed burst in a shown week an edited Apply writes it twice. Upgrade when
 * a live line has either shape or V104 to V106 are built: each import
 * records the bursts it placed and `attachExpertCarry` reads that.
 */
function opensNoQuantity(b: Record<string, unknown>, bt: string, lineBuyType: string): boolean {
  if (bt === "fixed_cost" || bt === "package_inclusions") return false
  if (lineBuyType === "fixed_cost" || lineBuyType === "package_inclusions") return false
  if (storedQty(b.calculatedValue ?? b.calculated_value) > 0 || storedQty(b.amount) > 0) return false
  const rate = parseBurstMoney(b.buyAmount ?? b.buy_amount)
  return !(rate > 0 && (bt === "panels" || parseBurstMoney(b.budget) > 0))
}

/**
 * A saved burst the carry can give back: it has a budget (a blank budget is
 * priced by the mapper as before; a Production burst saved as cost and amount
 * only reads cost x amount, V104 A), and a quantity, or is a bonus, package inclusions or fixed cost
 * burst (the import places those whatever their quantity), or is a panels
 * burst with a rate: OOH's import reads the rate as the panel count when the
 * deliverables are 0 or blank (`panelsBurstQtyForExpert`), so it reached the
 * grid and its saved budget must come back (C342Bfix L1).
 */
function reachesGrid(b: Record<string, unknown>, lineBuyType: string): boolean {
  const bt = lower(b.buyType) || lineBuyType
  // C-370 (V99 A): a bonus or package inclusions burst saved with a blank budget is $0 all the same.
  if (!present(b.budget) && !isInclusion(bt)) return false
  if (takesGridQty(bt)) return true
  if (storedQty(b.calculatedValue ?? b.calculated_value) > 0) return true
  return bt === "panels" && parseBurstMoney(b.buyAmount ?? b.buy_amount) > 0
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
  campaignEndDate: Date,
  /**
   * The import puts a burst dated outside the campaign in the first or last
   * week (`weekColumnForDate`: the 13 week-cell grids). There such a burst
   * has a cell and is carried in that week's group; elsewhere it has no cell
   * (C-370).
   */
  outsideToEdgeWeek = false
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
    const seen: { raw: Record<string, unknown>; b: Record<string, unknown>; keys: string[]; saved: CarriedBurst; noCell: boolean }[] = []
    for (const raw of rawBursts(item)) {
      // V104 A: `ProductionContainer`'s load keeps cost, amount and dates only. Read them as the
      // Production import does (`normalizeProductionBursts`): budget cost x amount, rate and deliverables the amount.
      const b = present(raw.budget) || !("cost" in raw)
        ? raw
        : { buyAmount: String(storedQty(raw.amount)), calculatedValue: raw.amount, ...raw, budget: plainMoney(storedQty(raw.cost) * storedQty(raw.amount)) }
      const startYmd = ymd(b.startDate ?? b.start_date)
      const endYmd = ymd(b.endDate ?? b.end_date) || startYmd
      if (!startYmd) continue
      const bt = lower(b.buyType) || lineBuyType
      const inside = windows.filter((w) => startYmd <= w.end && endYmd >= w.start).map((w) => w.key)
      const edge = startYmd > (windows[windows.length - 1]?.end ?? "") ? weekKeys.slice(-1) : weekKeys.slice(0, 1)
      const keys = inside.length === 0 && outsideToEdgeWeek ? edge : inside
      const saved: CarriedBurst = {
        budget: b.budget,
        buyAmount: b.buyAmount ?? b.buy_amount,
        calculatedValue: b.calculatedValue ?? b.calculated_value,
        ...("cost" in b ? { cost: b.cost } : {}),
        ...("amount" in b ? { amount: b.amount } : {}),
        ...(present(b.buyType) ? { buyType: b.buyType } : {}),
        takesGridQty: takesGridQty(bt),
        startYmd,
        endYmd,
      }
      // V102 A: a burst with no quantity counts whatever its budget (a blank one is $0).
      const noCell =
        opensNoQuantity(b, bt, lineBuyType) || (keys.length === 0 && (present(b.budget) || isInclusion(bt)))
      seen.push({ raw, b, keys, saved, noCell })
    }
    // Backstop: every week no other burst touches must be blank. If one holds a
    // quantity, something opened one for these bursts after all (an import
    // rule, or the card's lump sum put in the first week when no dated burst
    // was placed: `projectLumpSumCardBudgetsOntoExpertRows`), so they are
    // treated as before, unless week 1 is the only week with a quantity (V105 A).
    const otherKeys = new Set(seen.filter((x) => !x.noCell).flatMap((x) => x.keys))
    const opened = weekKeys.some((k) => !otherKeys.has(k) && holdsQuantity(row, [k], weekKeys))
    const placed: { burst: CarriedBurst; key: string }[] = []
    const unplaced: CarriedBurst[] = []
    // V105 A (C-370 (3)): the only quantity on the row is week 1's (the card's lump
    // sum when no dated burst was placed), so the line's saved bursts are one week-1
    // group: untouched they come back as saved; edit week 1 and it is priced from the grid.
    const lump = opened && weekKeys.every((k, i) => holdsQuantity(row, [k], weekKeys) === (i === 0))
    if (lump) {
      join(weekKeys.slice(0, 1))
      for (const { raw, saved } of seen) placed.push({ key: weekKeys[0]!, burst: { ...saved, asSaved: raw } })
    }
    for (const { raw, b, keys, saved, noCell } of lump ? [] : seen) {
      if (noCell && !opened) {
        unplaced.push({ ...saved, asSaved: raw })
        continue
      }
      if (!reachesGrid(b, lineBuyType) || keys.length === 0) continue
      join(keys)
      placed.push({ key: keys[0]!, burst: saved })
    }
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
    if (groups.length === 0 && unplaced.length === 0) return
    row.expertCarry = {
      unitRate: rateOf(row.unitRate),
      buyType: lower(row.buyType),
      budgetIncludesFees: Boolean(row.budgetIncludesFees),
      groups,
      unplaced,
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

const savedBudget = (bursts: readonly CarriedBurst[]) => bursts.reduce((t, b) => t + parseBurstMoney(b.budget), 0)

/**
 * The week columns an untouched group covers, and the saved budget Apply
 * gives back: the untouched groups' and every burst the grid cannot place
 * (C-370). The grid's money reads this so its totals are what Apply will save.
 */
export function carriedMoney(
  row: ExpertCarryRow,
  weekKeys: readonly string[]
): { weekKeys: Set<string>; budget: number } {
  const groups = intactCarryGroups(row, weekKeys)
  return {
    weekKeys: new Set(groups.flatMap((g) => g.weekKeys)),
    budget:
      groups.reduce((s, g) => s + savedBudget(g.bursts), 0) +
      // A bonus or package inclusions burst is $0 to the card whatever budget it was saved with.
      savedBudget((row.expertCarry?.unplaced ?? []).filter((b) => !isInclusion(lower(b.buyType) || row.expertCarry!.buyType))),
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
    if (qty > 0 || !saved.takesGridQty) out.calculatedValue = qty
  }
  // The burst's own buy type is the saved burst's, never the generated burst's
  // in the same place: spans come out before weeks, so a paid burst can sit
  // where the mapper wrote a bonus one (C342Bfix L2; `lineTotals` counts a
  // bonus burst as $0).
  if (present(saved.buyType)) out.buyType = saved.buyType
  else delete out.buyType
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
  const unplaced = row.expertCarry?.unplaced ?? []
  const bursts = (line as { bursts?: unknown }).bursts
  if (!Array.isArray(bursts) || bursts.length === 0) return line
  if (groups.length === 0 && unplaced.length === 0) return line
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
  // C-370: beside bursts the grid cannot place, a burst with no quantity and
  // no money outside the untouched groups is not written: it is a cell the
  // import made for such a burst with 0 (a 0 span or week cell) or the empty
  // line's campaign burst.
  const echoes = (b: Record<string, unknown>) =>
    unplaced.length > 0 && storedQty(b.calculatedValue) === 0 && parseBurstMoney(b.budget) === 0
  const out: Record<string, unknown>[] = []
  const done = new Set<number>()
  for (const b of bursts as Record<string, unknown>[]) {
    const g = groupOf(b)
    if (g === undefined) {
      if (!echoes(b)) out.push(b)
      continue
    }
    if (done.has(g)) continue
    done.add(g)
    const mine = generated.get(g)!
    groups[g]!.bursts.forEach((saved, n) => out.push(saved.asSaved ? { ...saved.asSaved } : carriedBurst(mine[n] ?? mine[0]!, saved)))
  }
  // Each unplaced burst goes back in date order, after any burst that starts the same day.
  for (const saved of unplaced) {
    const at = out.findIndex((b) => ymd(b.startDate) > saved.startYmd)
    out.splice(at < 0 ? out.length : at, 0, { ...saved.asSaved })
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
