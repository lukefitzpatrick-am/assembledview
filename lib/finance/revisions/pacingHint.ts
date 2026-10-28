/**
 * Q6: underspend actuals are typed by finance. Pacing delivered spend is
 * shown next to each line as a hint, where the pacing mart has the line.
 * Platform spend (MART.VW_PACING_FACT.AMOUNT_SPENT) for the month, in cents.
 * Best effort: any failure returns no hints.
 */
import "server-only"

import { toCents } from "@/lib/money"

import type { Cents, MonthKey } from "./types"
import { addMonthKeys } from "./planBillingRevision"

export async function loadPacingSpendHints(
  lineItemIds: string[],
  month: MonthKey,
): Promise<Record<string, Cents>> {
  const ids = [...new Set(lineItemIds.map((id) => id.trim().toLowerCase()).filter(Boolean))]
  if (ids.length === 0) return {}
  try {
    const { querySnowflake } = await import("@/lib/snowflake/query")
    const start = `${month}-01`
    const end = `${addMonthKeys(month, 1)}-01`
    const rows = await querySnowflake<{ ID: string; SPEND: number | string | null }>(
      `SELECT LOWER(LINE_ITEM_ID) AS ID, SUM(AMOUNT_SPENT) AS SPEND
         FROM ASSEMBLEDVIEW.MART.VW_PACING_FACT
        WHERE LOWER(LINE_ITEM_ID) IN (${ids.map(() => "?").join(", ")})
          AND CAST(DATE_DAY AS DATE) >= TO_DATE(?) AND CAST(DATE_DAY AS DATE) < TO_DATE(?)
        GROUP BY 1`,
      [...ids, start, end],
      { label: "billing_revision_pacing_hint" },
    )
    const byLower = new Map(lineItemIds.map((id) => [id.trim().toLowerCase(), id]))
    const out: Record<string, Cents> = {}
    for (const r of rows) {
      const id = byLower.get(String(r.ID))
      const spend = Number(r.SPEND)
      if (id && Number.isFinite(spend)) out[id] = toCents(spend)
    }
    return out
  } catch (err) {
    console.warn("[billing-revisions] pacing hint failed", err)
    return {}
  }
}
