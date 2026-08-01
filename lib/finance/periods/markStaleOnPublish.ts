/**
 * After a plan publish, flip open-period run items for that MBA to stale
 * and notify finance (PC5).
 */

import { sql } from "drizzle-orm"
import { getDb } from "@/db"
import { isFinancePeriodsEnabled } from "@/lib/finance/periods/flag"
import { insertNotificationPg } from "@/lib/finance/periods/postgresStore"

export async function markRunItemsStaleOnPublish(args: {
  mbaNumber: string
  versionId?: number | null
}): Promise<number> {
  if (!isFinancePeriodsEnabled()) return 0
  const mba = String(args.mbaNumber ?? "").trim()
  if (!mba) return 0
  try {
    const db = getDb()
    const res = await db.execute(sql`
      UPDATE finance_run_items ri
      SET status = 'stale', updated_at = now()
      FROM finance_periods p
      WHERE ri.period_id = p.id
        AND p.status NOT IN ('locked', 'invoiced', 'reconciled')
        AND ri.source = 'media'
        AND upper(ri.mba_number) = upper(${mba})
        AND ri.status NOT IN ('held', 'excluded', 'stale')
      RETURNING ri.id
    `)
    const rows = (res as { rows?: unknown[] }).rows ?? (Array.isArray(res) ? res : [])
    const n = Array.isArray(rows) ? rows.length : 0
    if (n > 0) {
      await insertNotificationPg({
        audience: "finance",
        kind: "finance_run_items_stale",
        payload: { mbaNumber: mba, versionId: args.versionId ?? null, count: n },
      })
    }
    return n
  } catch (err) {
    console.warn("[PC5] markRunItemsStaleOnPublish failed", err)
    return 0
  }
}
