/**
 * Monthly report queue insert. drizzle-orm 0.45.2 names the conflict-target
 * predicate `where` on onConflictDoNothing (onConflictDoUpdate uses targetWhere).
 * The same predicate matches today's full unique constraint and the 0097
 * partial index WHERE kind <> 'on_demand_deck'.
 */
import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import * as schema from "@/db/schema"
import type { QueuedReportRun } from "@/lib/reports/selectMonthlyReportMbas"

export function queueMonthlyReportRuns<TSchema extends Record<string, unknown>>(
  db: PostgresJsDatabase<TSchema>,
  rows: readonly QueuedReportRun[],
) {
  return db
    .insert(schema.reportRuns)
    .values([...rows])
    .onConflictDoNothing({
      target: [
        schema.reportRuns.kind,
        schema.reportRuns.mbaNumber,
        schema.reportRuns.periodStart,
      ],
      where: sql`kind <> 'on_demand_deck'`,
    })
    .returning({ id: schema.reportRuns.id })
}
