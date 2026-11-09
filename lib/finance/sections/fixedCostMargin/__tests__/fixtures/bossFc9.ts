/**
 * Live-shaped fixture for FC9 (B31): the four FC1 candidate lines, BOSS010PD1,
 * BOSS010PD2, BOSS011PD1 and BOSS011PD2, read on 10 Nov 2026 (read only).
 *
 * - Billing: Supabase published tips, `schedule_months` media, basis billing,
 *   Aug to Nov 2026 (delivery basis is the same cents and is left out here).
 * - Spend: `MART.VW_PLATFORM_SPEND_LINE_MONTH` per line, month and source,
 *   rounded to cents as `mapSpendRows` does (`toCents`).
 * - Before 30 Oct: the authored `VW_PLATFORM_SPEND_LINE_DAY` body run as a
 *   SELECT, days 1 to 29 Oct, summed per line, rounded once to cents.
 *
 * No line has a fixed cost from date today. The date 30 Oct 2026 is the one
 * the B23 review discussed (hypothetical). Today's report total for these four
 * lines, Aug to Nov: $4,843.99 margin.
 */
import type { FixedCostPlanCell, PlatformSpendCell } from "../../compose.js"

export const BOSS_FROM = "2026-10-30"
export const BOSS_RANGE = { from: "2026-08", to: "2026-11" } as const

type LineSpec = {
  mba: string
  id: string
  platform: string
  source: string
  buyType: string
  billed: Record<string, number>
  spend: Record<string, number>
  /** Platform spend 1 to 29 Oct (before the date), cents. */
  preOctCents: number
}

export const BOSS_LINES: readonly LineSpec[] = [
  {
    mba: "BOSS010",
    id: "BOSS010PD1",
    platform: "DV360",
    source: "DV360",
    buyType: "cpm",
    billed: { "2026-09": 170000, "2026-10": 170000, "2026-11": 170000 },
    // 1,700.052843 / 1,699.50497 / 404.520985
    spend: { "2026-09": 170005, "2026-10": 169950, "2026-11": 40452 },
    preOctCents: 163388, // 1,633.878221
  },
  {
    mba: "BOSS010",
    id: "BOSS010PD2",
    platform: "Taboola",
    source: "Taboola",
    buyType: "cpm",
    billed: { "2026-09": 136000, "2026-10": 136000, "2026-11": 136000 },
    spend: { "2026-09": 61902, "2026-10": 63988, "2026-11": 19308 },
    preOctCents: 59097,
  },
  {
    mba: "BOSS011",
    id: "BOSS011PD1",
    platform: "Taboola",
    source: "Taboola",
    buyType: "cpc",
    billed: { "2026-09": 80080, "2026-10": 80080, "2026-11": 120000 },
    spend: { "2026-09": 48317, "2026-10": 49976, "2026-11": 13982 },
    preOctCents: 46109,
  },
  {
    mba: "BOSS011",
    id: "BOSS011PD2",
    platform: "DV360",
    source: "DV360",
    buyType: "cpm",
    billed: { "2026-09": 80000, "2026-10": 80000, "2026-11": 120000 },
    // August spend sits before the first schedule month ("Spend outside line months").
    spend: { "2026-08": 169747, "2026-09": 79993, "2026-10": 79987, "2026-11": 26154 },
    preOctCents: 77117, // 771.174371
  },
]

/** Plan cells as `loadPlanCells` returns them; `fixedCostFrom` only when given. */
export function bossPlan(fixedCostFrom?: string): FixedCostPlanCell[] {
  const out: FixedCostPlanCell[] = []
  for (const l of BOSS_LINES) {
    for (const [month, amountCents] of Object.entries(l.billed)) {
      const cell: FixedCostPlanCell = {
        clientId: 24,
        clientName: "Boss",
        mbaNumber: l.mba,
        campaignName: l.mba,
        campaignStatus: "booked",
        lineItemId: l.id,
        lineName: "",
        publisher: l.platform,
        platform: l.platform,
        channel: "prog_display",
        buyType: l.buyType,
        fixedCostMedia: true,
        month,
        basis: "billing",
        amountCents,
        costBasis: "platform",
      }
      if (fixedCostFrom) cell.fixedCostFrom = fixedCostFrom
      out.push(cell)
    }
  }
  return out
}

export function bossSpend(): PlatformSpendCell[] {
  const out: PlatformSpendCell[] = []
  for (const l of BOSS_LINES) {
    for (const [month, spendCents] of Object.entries(l.spend)) {
      out.push({ lineItemId: l.id.toLowerCase(), month, source: l.source, spendCents, impressions: 1000, rowCount: 20 })
    }
  }
  return out
}

/** Spend before the date in the date's month, by lowercase line id. */
export function bossPreDateSpend(): Map<string, number> {
  return new Map(BOSS_LINES.map((l) => [l.id.toLowerCase(), l.preOctCents]))
}

/** Today's report margin for the four lines, Aug to Nov 2026 (discovery, 10 Nov). */
export const BOSS_TODAY_MARGIN_CENTS = 484399
