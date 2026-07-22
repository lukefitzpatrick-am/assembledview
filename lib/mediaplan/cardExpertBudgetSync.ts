/**
 * Card ↔ expert-grid budget sync for lump-sum card entries.
 *
 * Expert Net media is rate×weekly-qty. A card lump-sum (budget set, no rate /
 * weekly allocation) imports as Net media $0; Apply then writes empty/"0"
 * bursts and wipes the card. These helpers project the card total onto the
 * grid on open, and refuse Apply that would zero a non-zero card budget.
 */
import { parseBurstMoney } from "@/lib/mediaplan/formatBurstsForPersist"
import {
  expertRowGrossCost,
  expertRowQuantitySum,
  type ExpertRowCostFields,
} from "@/lib/mediaplan/expertRowCost"
import type { ExpertDailyValues } from "@/lib/mediaplan/expertDayModel"
import type { ExpertWeeklyValues } from "@/lib/mediaplan/expertModeWeeklySchedule"

export type LumpSumProjectableExpertRow = ExpertRowCostFields & {
  unitRate?: string | number | null
  weeklyValues: ExpertWeeklyValues
  dailyValues?: ExpertDailyValues
  mergedWeekSpans?: Array<{
    id?: string
    startWeekKey: string
    endWeekKey: string
    totalQty: number
    startYmd?: string
    endYmd?: string
  }>
  /** Import-time sum of card burst budgets (may exceed rate×qty before projection). */
  grossCost?: string | number | null
}

function parseRate(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0
  if (typeof v !== "string" || !v.trim()) return 0
  return parseBurstMoney(v)
}

/**
 * Rate + qty that make schedule gross equal `gross` for the given buy type
 * (fee split still applies later in the Net media column).
 */
export function rateAndQtyForCardGross(
  buyType: string | null | undefined,
  gross: number
): { rate: number; qty: number } {
  const bt = String(buyType || "").toLowerCase()
  if (!(gross > 0)) return { rate: 0, qty: 0 }
  if (bt === "bonus" || bt === "package_inclusions") {
    return { rate: 0, qty: 0 }
  }
  if (bt === "fixed_cost") {
    return { rate: gross, qty: 1 }
  }
  if (bt === "cpm") {
    // (qty/1000)×rate = gross → qty=1000, rate=gross
    return { rate: gross, qty: 1000 }
  }
  // spots / cpc / panels / production / …
  return { rate: gross, qty: 1 }
}

function rateFromGrossAndQty(
  buyType: string | null | undefined,
  gross: number,
  qty: number
): number {
  const bt = String(buyType || "").toLowerCase()
  if (!(gross > 0) || !(qty > 0)) return 0
  if (bt === "fixed_cost") return gross
  if (bt === "cpm") return (gross * 1000) / qty
  return gross / qty
}

function ensureFirstWeekQty(
  row: LumpSumProjectableExpertRow,
  weekKeys: readonly string[],
  qty: number
): void {
  if (weekKeys.length === 0 || !(qty > 0)) return
  const first = weekKeys[0]!
  const existing = row.weeklyValues[first]
  const prev =
    existing === "" || existing === undefined ? 0 : Number(existing)
  row.weeklyValues[first] = prev + qty
}

/**
 * When card gross &gt; 0 but rate×qty would show $0, set unitRate and (if needed)
 * a flight qty so schedule gross == card gross.
 * Mutates rows in place and returns the same array.
 */
export function projectLumpSumCardBudgetsOntoExpertRows<
  T extends LumpSumProjectableExpertRow,
>(rows: T[], weekKeys: readonly string[]): T[] {
  for (const row of rows) {
    const cardGross = parseBurstMoney(row.grossCost)
    if (!(cardGross > 0)) continue

    const raw = expertRowGrossCost(row, weekKeys)
    // Already reflects money (allow 1¢ float).
    if (raw > 0 && Math.abs(raw - cardGross) < 0.02) continue
    // Has meaningful schedule money already — don't clobber intentional edits.
    if (raw > 0.02) continue

    const qty = expertRowQuantitySum(row, weekKeys)
    const rate = parseRate(row.unitRate)

    if (rate > 0 && qty > 0) {
      // Rate+qty present but raw still 0 (e.g. bonus) — leave alone.
      continue
    }

    if (rate <= 0 && qty > 0) {
      row.unitRate = rateFromGrossAndQty(row.buyType, cardGross, qty)
      continue
    }

    if (rate > 0 && qty <= 0) {
      const bt = String(row.buyType || "").toLowerCase()
      const needQty =
        bt === "cpm" ? (cardGross * 1000) / rate : cardGross / rate
      if (Number.isFinite(needQty) && needQty > 0) {
        ensureFirstWeekQty(row, weekKeys, Math.round(needQty) || needQty)
      }
      continue
    }

    // No rate, no qty — classic lump-sum card entry.
    const projected = rateAndQtyForCardGross(row.buyType, cardGross)
    row.unitRate = projected.rate
    if (projected.qty > 0) {
      const spanQty = (row.mergedWeekSpans ?? []).reduce((s, sp) => {
        if (!sp) return s
        return s + (Number.isFinite(sp.totalQty) ? sp.totalQty : 0)
      }, 0)
      if (!(spanQty > 0)) {
        ensureFirstWeekQty(row, weekKeys, projected.qty)
      }
    }
  }
  return rows
}

export function sumBurstsBudgetMoney(
  bursts: ReadonlyArray<{ budget?: unknown }> | null | undefined
): number {
  if (!bursts?.length) return 0
  return bursts.reduce((s, b) => s + parseBurstMoney(b.budget), 0)
}

/**
 * Safety floor: never let Apply replace a non-zero card budget with empty/zero
 * bursts from an unallocated expert grid.
 */
export function preservePreviousBurstsIfApplyWouldZeroBudget<
  B extends { budget?: unknown },
>(generated: B[] | undefined, previous: B[] | undefined): B[] {
  const gen = generated ?? []
  const prev = previous ?? []
  const prevTotal = sumBurstsBudgetMoney(prev)
  const genTotal = sumBurstsBudgetMoney(gen)
  if (prevTotal > 0 && genTotal <= 0) {
    return prev
  }
  return gen
}
