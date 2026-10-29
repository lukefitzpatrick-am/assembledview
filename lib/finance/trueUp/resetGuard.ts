/**
 * True-up reset guard (Luke, 29 Oct 2026: "build the hard block"). A billing
 * reset, or any override write, is refused when it would change a month an
 * applied true-up schedule fix set to what Xero invoiced. Undo the true-up
 * first (Finance > Reports > True-up).
 *
 * A lock is one applied true_up_actions row (action schedule, status applied):
 * its component and the months it set. Pure and client-safe: the editors call
 * scheduleLockConflicts before a full reset; savePlan, replace_line and
 * reset_line call overrideLockConflicts before they write.
 */
import { parseMoney, toCents } from "@/lib/money"

export type TrueUpLockComponent = "fee" | "adserving" | "production" | "media"

export type TrueUpLock = {
  actionId: number
  component: TrueUpLockComponent
  /** YYYY-MM months the fix set to the invoiced amounts. */
  months: string[]
  asOfMonth: string
}

export type TrueUpLockConflict = {
  component: TrueUpLockComponent
  month: string
  lineItemId?: string
  beforeCents: number
  afterCents: number
}

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
}

/** YYYY-MM from YYYY-MM, YYYY-MM-DD or "October 2026". Null otherwise. */
export function normaliseLockMonth(raw: unknown): string | null {
  const s = String(raw ?? "").trim()
  const iso = /^(\d{4})-(0[1-9]|1[0-2])(?:-\d{2})?/.exec(s)
  if (iso) return `${iso[1]}-${iso[2]}`
  const named = /^([A-Za-z]+)\s+(\d{4})$/.exec(s)
  if (named) {
    const mm = MONTHS[named[1]!.toLowerCase()]
    if (mm) return `${named[2]}-${mm}`
  }
  return null
}

export function parseTrueUpLocks(rows: ReadonlyArray<Record<string, unknown>>): TrueUpLock[] {
  const out: TrueUpLock[] = []
  for (const r of rows) {
    const component = String(r.component ?? "") as TrueUpLockComponent
    if (!["fee", "adserving", "production", "media"].includes(component)) continue
    const raw = Array.isArray(r.months) ? r.months : typeof r.months === "string" ? r.months.replace(/[{}]/g, "").split(",") : []
    const months = [...new Set(raw.map(normaliseLockMonth).filter((m): m is string => Boolean(m)))].sort()
    if (months.length === 0) continue
    out.push({
      actionId: Number(r.id ?? r.actionId ?? 0),
      component,
      months,
      asOfMonth: normaliseLockMonth(r.as_of_month ?? r.asOfMonth) ?? months[months.length - 1]!,
    })
  }
  return out
}

function lockedSet(locks: readonly TrueUpLock[]): Set<string> {
  const s = new Set<string>()
  for (const l of locks) for (const m of l.months) s.add(`${l.component}|${m}`)
  return s
}

function cents(value: unknown): number {
  return toCents(parseMoney(value) ?? 0)
}

/** Month header fields per component in the billing schedule blob. */
const HEADER_FIELD: Record<TrueUpLockComponent, string> = {
  fee: "feeTotal",
  adserving: "adservingTechFees",
  production: "production",
  media: "mediaTotal",
}

type ScheduleMonthLike = { monthYear?: unknown } & Record<string, unknown>

function headerCents(months: readonly ScheduleMonthLike[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const m of months) {
    const month = normaliseLockMonth(m.monthYear)
    if (!month) continue
    for (const [component, field] of Object.entries(HEADER_FIELD)) {
      out.set(`${component}|${month}`, (out.get(`${component}|${month}`) ?? 0) + cents(m[field]))
    }
  }
  return out
}

/**
 * Editor full reset: month header totals before (the working schedule) and
 * after (the auto schedule) for every locked component and month. A change
 * of 1 cent or more is a conflict.
 */
export function scheduleLockConflicts(
  locks: readonly TrueUpLock[],
  before: readonly ScheduleMonthLike[],
  after: readonly ScheduleMonthLike[],
): TrueUpLockConflict[] {
  if (locks.length === 0) return []
  const b = headerCents(before)
  const a = headerCents(after)
  const out: TrueUpLockConflict[] = []
  for (const key of [...lockedSet(locks)].sort()) {
    const [component, month] = key.split("|") as [TrueUpLockComponent, string]
    const beforeCents = b.get(key) ?? 0
    const afterCents = a.get(key) ?? 0
    if (Math.abs(afterCents - beforeCents) >= 1) out.push({ component, month, beforeCents, afterCents })
  }
  return out
}

export type OverrideRowLike = { lineItemId: string; component: string; months: unknown }

function overrideCells(rows: readonly OverrideRowLike[], canon: (id: string) => string): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of rows) {
    const component = String(r.component ?? "").toLowerCase()
    let months: unknown = r.months
    if (typeof months === "string") {
      try {
        months = JSON.parse(months)
      } catch {
        months = []
      }
    }
    if (!Array.isArray(months)) continue
    for (const entry of months) {
      const month = normaliseLockMonth((entry as { month?: unknown })?.month)
      if (!month) continue
      const key = `${canon(r.lineItemId)}|${component}|${month}`
      out.set(key, (out.get(key) ?? 0) + cents((entry as { amount?: unknown }).amount))
    }
  }
  return out
}

/**
 * Override writes (save REPLACE-SET, replace_line, reset_line): every existing
 * override cell in a locked component and month must keep its amount (within
 * 1 cent). A deleted row reads as 0. Only media and fee have override rows.
 */
export function overrideLockConflicts(
  locks: readonly TrueUpLock[],
  before: readonly OverrideRowLike[],
  after: readonly OverrideRowLike[],
  canon: (id: string) => string = (id) => String(id ?? "").trim(),
): TrueUpLockConflict[] {
  if (locks.length === 0) return []
  const locked = lockedSet(locks)
  const b = overrideCells(before, canon)
  const a = overrideCells(after, canon)
  const out: TrueUpLockConflict[] = []
  for (const [key, beforeCents] of [...b.entries()].sort(([x], [y]) => x.localeCompare(y))) {
    const [lineItemId, component, month] = key.split("|") as [string, TrueUpLockComponent, string]
    if (!locked.has(`${component}|${month}`)) continue
    const afterCents = a.get(key) ?? 0
    if (Math.abs(afterCents - beforeCents) >= 1) out.push({ lineItemId, component, month, beforeCents, afterCents })
  }
  return out
}

/**
 * savePlan REPLACE-SET (MB-22): rows for payload or cleared lines are replaced
 * by the payload's overrides; other rows stay. A full reset sends the lines
 * with no override, so their locked months read as deleted.
 */
export function replaceSetLockConflicts(args: {
  locks: readonly TrueUpLock[]
  existing: readonly OverrideRowLike[]
  isReplaced: (row: OverrideRowLike) => boolean
  inserts: readonly OverrideRowLike[]
  canon?: (id: string) => string
}): TrueUpLockConflict[] {
  if (args.locks.length === 0) return []
  const after = [...args.existing.filter((r) => !args.isReplaced(r)), ...args.inserts]
  return overrideLockConflicts(args.locks, args.existing, after, args.canon)
}

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function monthLabel(m: string): string {
  return `${SHORT[Number(m.slice(5, 7)) - 1] ?? m.slice(5, 7)} ${m.slice(0, 4)}`
}

const COMPONENT_LABEL: Record<TrueUpLockComponent, string> = {
  fee: "fee",
  adserving: "ad serving",
  production: "production",
  media: "media",
}

export const TRUE_UP_LOCKED_CODE = "TRUE_UP_LOCKED"

/** One plain message for the editors, the save route and the override routes. */
export function trueUpLockMessage(conflicts: readonly Pick<TrueUpLockConflict, "component" | "month">[]): string {
  const months = [...new Set(conflicts.map((c) => c.month))].sort().map(monthLabel)
  const comps = [...new Set(conflicts.map((c) => COMPONENT_LABEL[c.component]))]
  const span = months.length > 3 ? `${months[0]} to ${months[months.length - 1]}` : months.join(", ")
  return `This plan has a true-up applied to what Xero invoiced (${comps.join(", ")}, ${span}). This change would undo it. Undo the true-up first on Finance > Reports > True-up, then reset or change billing.`
}
