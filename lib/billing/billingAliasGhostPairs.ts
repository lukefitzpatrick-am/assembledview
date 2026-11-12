/**
 * B20 ghost-row guard (decision Q16: detect and warn, no clean-up SQL).
 *
 * Six saved versions (hema001 v6 and v7, malay003 v4, malay004 v3 and v4,
 * BOSS001 v14, read-only check 3 Nov 2026) hold, in one billing month, an
 * old-scheme row (`ML`, no code, production `-vNNN-pN`) and the row with its
 * current id for the same line (`billingLineIdAlias`). Both carry money, so
 * every month total that sums them is doubled.
 *
 * A pair: same month, same media key, same line number, one `old` and one
 * `current` row, both with a non-zero amount in that month (a $0 row doubles
 * nothing). A no-code or old production id pairs only when the caller passes
 * `aliasNumberCheck` and it proves the number from the loaded lines (B35,
 * MB-40): the editor renumbers those lines from position, so a bare number
 * could name another line, and the guard must never call a real line a ghost.
 * The server checks (finance) pass none: `ML` and current ids only, which
 * covers every live pair (all six versions are `ML`).
 *
 * Pure: no data is changed here. `removeOldAliasGhostRows` returns new months
 * for a working copy only, after a person chooses it.
 */

import {
  billingLinePairingAlias,
  type BillingAliasNumberCheck,
} from "@/lib/billing/billingLineIdAlias"
import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"
import { toBillingOverrideLineItemId } from "@/lib/finance/manualBillingOverridesUi"
import { formatMoney } from "@/lib/format/money"
import { fromCents, parseMoney, sumCents, toCents } from "@/lib/money"

export type BillingAliasGhostPair = {
  monthYear: string
  mediaKey: string
  lineNumber: number
  /** Row ids as they sit in the schedule (bare or `billing-<media>::`). */
  oldId: string
  currentId: string
  oldAmount: number
  currentAmount: number
}

/** One line: its old and current ids, the months both carry money, and the old row's total. */
export type BillingAliasGhostLine = {
  mediaKey: string
  oldId: string
  currentId: string
  months: Array<{ monthYear: string; oldAmount: number; currentAmount: number }>
  oldTotal: number
}

function rowAmount(row: BillingLineItem, monthYear: string): number {
  const n = Number(row?.monthlyAmounts?.[monthYear])
  return Number.isFinite(n) ? n : 0
}

/** Every old-and-current pair in the months, in month, media key and line order. */
export function findBillingAliasGhostPairs(
  months: readonly BillingMonth[] | null | undefined,
  mbaNumber: string | null | undefined,
  aliasNumberCheck?: BillingAliasNumberCheck | null
): BillingAliasGhostPair[] {
  const mba = String(mbaNumber ?? "").trim()
  if (!mba || !Array.isArray(months)) return []
  const pairs: BillingAliasGhostPair[] = []
  for (const month of months) {
    const buckets = month?.lineItems as Record<string, BillingLineItem[] | undefined> | undefined
    if (!buckets || typeof buckets !== "object") continue
    const monthYear = String(month.monthYear ?? "")
    for (const [mediaKey, rows] of Object.entries(buckets)) {
      if (!Array.isArray(rows) || rows.length < 2) continue
      const olds: Array<{ row: BillingLineItem; n: number; amount: number }> = []
      const currents = new Map<number, Array<{ row: BillingLineItem; amount: number }>>()
      for (const row of rows) {
        const alias = billingLinePairingAlias({ id: row?.id, mediaKey, mbaNumber: mba }, aliasNumberCheck)
        if (!alias) continue
        const amount = rowAmount(row, monthYear)
        if (amount === 0) continue
        if (alias.scheme === "old") olds.push({ row, n: alias.lineNumber, amount })
        else currents.set(alias.lineNumber, [...(currents.get(alias.lineNumber) ?? []), { row, amount }])
      }
      for (const old of olds) {
        const current = currents.get(old.n)?.[0]
        if (!current) continue
        pairs.push({
          monthYear,
          mediaKey,
          lineNumber: old.n,
          oldId: String(old.row.id ?? ""),
          currentId: String(current.row.id ?? ""),
          oldAmount: old.amount,
          currentAmount: current.amount,
        })
      }
    }
  }
  return pairs.sort((a, b) =>
    a.mediaKey === b.mediaKey ? a.lineNumber - b.lineNumber : a.mediaKey.localeCompare(b.mediaKey)
  )
}

/** Pairs grouped by line, months in schedule order. */
export function summariseBillingAliasGhostPairs(
  pairs: readonly BillingAliasGhostPair[],
  monthOrder?: readonly string[]
): BillingAliasGhostLine[] {
  const order = new Map((monthOrder ?? []).map((m, i) => [m, i]))
  const byLine = new Map<string, BillingAliasGhostLine>()
  for (const p of pairs) {
    const oldId = toBillingOverrideLineItemId(p.oldId)
    const currentId = toBillingOverrideLineItemId(p.currentId)
    const key = `${p.mediaKey}\u0000${oldId}\u0000${currentId}`
    const line = byLine.get(key) ?? { mediaKey: p.mediaKey, oldId, currentId, months: [], oldTotal: 0 }
    line.months.push({ monthYear: p.monthYear, oldAmount: p.oldAmount, currentAmount: p.currentAmount })
    byLine.set(key, line)
  }
  return [...byLine.values()].map((line) => ({
    ...line,
    months: [...line.months].sort(
      (a, b) => (order.get(a.monthYear) ?? 0) - (order.get(b.monthYear) ?? 0)
    ),
    oldTotal: fromCents(sumCents(line.months.map((m) => toCents(m.oldAmount)))),
  }))
}

/** Total the old rows add to the schedule (the doubled amount). */
export function billingAliasGhostTotal(pairs: readonly BillingAliasGhostPair[]): number {
  return fromCents(sumCents(pairs.map((p) => toCents(p.oldAmount))))
}

/** "hema001ML4 is a duplicate of hema001DD4: May 2026 $3.00 and $3.00" style lines, one per line. */
export function describeBillingAliasGhostLines(lines: readonly BillingAliasGhostLine[]): string[] {
  return lines.map((line) => {
    const months = line.months
      .map((m) => `${m.monthYear} ${formatMoney(m.oldAmount)} and ${formatMoney(m.currentAmount)}`)
      .join("; ")
    return `${line.oldId} is a duplicate of ${line.currentId} (${months})`
  })
}

/**
 * Save stop text, or null when there is no pair. Names every line (first
 * five in full, then a count).
 */
export function billingAliasGhostSaveBlockMessage(
  pairs: readonly BillingAliasGhostPair[],
  monthOrder?: readonly string[]
): string | null {
  if (pairs.length === 0) return null
  const lines = summariseBillingAliasGhostPairs(pairs, monthOrder)
  const described = describeBillingAliasGhostLines(lines)
  const head = described.slice(0, 5).join(". ")
  const more = described.length > 5 ? `. And ${described.length - 5} more line(s)` : ""
  return (
    `Billing holds an old line id and its current id for the same line, so ${formatMoney(billingAliasGhostTotal(pairs))} is counted twice. ` +
    `${head}${more}. Choose "Keep the current rows" in the duplicate billing notice, check the billing, then save.`
  )
}

function adjustMoneyString(value: unknown, deltaCents: number): string {
  const cents = toCents(parseMoney(value) ?? 0) + deltaCents
  return formatMoney(fromCents(cents))
}

/**
 * New months without the old row of each pair; that month's media key bucket,
 * media total (or production) and month total drop by the old amount. Rows
 * with no pair are kept, and nothing else changes. The input is not mutated.
 */
export function removeOldAliasGhostRows(
  months: readonly BillingMonth[],
  pairs: readonly BillingAliasGhostPair[]
): BillingMonth[] {
  if (pairs.length === 0) return months as BillingMonth[]
  const drop = new Map<string, BillingAliasGhostPair>()
  for (const p of pairs) drop.set(`${p.monthYear}\u0000${p.mediaKey}\u0000${p.oldId}`, p)
  return months.map((month) => {
    const buckets = month.lineItems as Record<string, BillingLineItem[] | undefined> | undefined
    if (!buckets) return month
    let changed = false
    let mediaDelta = 0
    let productionDelta = 0
    const nextBuckets: Record<string, BillingLineItem[] | undefined> = { ...buckets }
    const nextCosts: Record<string, string> = { ...(month.mediaCosts as Record<string, string>) }
    for (const [mediaKey, rows] of Object.entries(buckets)) {
      if (!Array.isArray(rows)) continue
      let bucketDelta = 0
      const kept = rows.filter((row) => {
        const hit = drop.get(`${month.monthYear}\u0000${mediaKey}\u0000${String(row?.id ?? "")}`)
        if (!hit) return true
        bucketDelta -= toCents(hit.oldAmount)
        return false
      })
      if (kept.length === rows.length) continue
      changed = true
      nextBuckets[mediaKey] = kept
      if (mediaKey in nextCosts) nextCosts[mediaKey] = adjustMoneyString(nextCosts[mediaKey], bucketDelta)
      if (mediaKey === "production") productionDelta += bucketDelta
      else mediaDelta += bucketDelta
    }
    if (!changed) return month
    return {
      ...month,
      lineItems: nextBuckets as BillingMonth["lineItems"],
      mediaCosts: nextCosts as BillingMonth["mediaCosts"],
      mediaTotal: mediaDelta !== 0 ? adjustMoneyString(month.mediaTotal, mediaDelta) : month.mediaTotal,
      production:
        productionDelta !== 0 ? adjustMoneyString(month.production, productionDelta) : month.production,
      totalAmount: adjustMoneyString(month.totalAmount, mediaDelta + productionDelta),
    }
  })
}
