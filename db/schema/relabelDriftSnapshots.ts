/**
 * relabel_drift_snapshots (migration 0086). SQL is source of truth; this
 * mirror is for generate/diff fidelity. RLS is on. No ava_readonly grant.
 * Do not db.select() this table against live Postgres before applying (C-76).
 */
import { date, integer, jsonb, pgTable, serial, timestamp, unique } from "drizzle-orm/pg-core"

export const relabelDriftSnapshots = pgTable(
  "relabel_drift_snapshots",
  {
    id: serial("id").primaryKey(),
    asOfDate: date("as_of_date", { mode: "string" }).notNull(),
    findings: jsonb("findings").$type<unknown[]>().notNull(),
    legacyCount: integer("legacy_count").notNull(),
    driftCount: integer("drift_count").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    durationMs: integer("duration_ms"),
  },
  (table) => [unique("relabel_drift_snapshots_as_of_key").on(table.asOfDate)],
)
