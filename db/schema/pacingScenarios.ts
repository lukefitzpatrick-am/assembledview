/**
 * pacing_scenarios (migration 0084). SQL is source of truth; this
 * mirror is for generate/diff fidelity. RLS is on. No ava_readonly grant.
 * Do not db.select() this table against live Postgres before applying (C-76).
 */
import { index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core"

export const pacingScenarios = pgTable(
  "pacing_scenarios",
  {
    id: serial("id").primaryKey(),
    mbaNumber: text("mba_number").notNull(),
    versionNumber: integer("version_number").notNull(),
    name: text("name").notNull(),
    levers: jsonb("levers").notNull(),
    result: jsonb("result").notNull(),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("pacing_scenarios_mba_created_idx").on(table.mbaNumber, table.createdAt.desc()),
  ],
)
