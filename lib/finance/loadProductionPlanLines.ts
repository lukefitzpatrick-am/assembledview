import { and, eq, inArray } from "drizzle-orm"

import { getDb, schema } from "@/db"
import type { ProductionPlanLine } from "@/lib/finance/financeExportProductionRows"

/** Production plan lines (publisher + bursts) per version, for the finance export split. */
export async function loadProductionPlanLinesForVersions(
  versionIds: number[],
): Promise<Map<number, ProductionPlanLine[]>> {
  const out = new Map<number, ProductionPlanLine[]>()
  const ids = [...new Set(versionIds.filter((id) => Number.isFinite(id) && id > 0))]
  if (ids.length === 0) return out
  const rows = await getDb()
    .select({
      versionId: schema.lineItems.versionId,
      lineItemId: schema.lineItems.lineItemId,
      publisher: schema.lineItems.publisher,
      bursts: schema.lineItems.bursts,
    })
    .from(schema.lineItems)
    .where(and(inArray(schema.lineItems.versionId, ids), eq(schema.lineItems.channel, "production")))
  for (const r of rows) {
    const list = out.get(r.versionId) ?? []
    list.push({ lineItemId: r.lineItemId, publisher: r.publisher, bursts: r.bursts })
    out.set(r.versionId, list)
  }
  return out
}
