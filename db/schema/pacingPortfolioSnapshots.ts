/**
 * pacing_portfolio_snapshots (migration 0081). SQL is source of truth; this
 * mirror is for generate/diff fidelity. RLS is on. No ava_readonly grant.
 * Do not db.select() this table against live Postgres before applying (C-76).
 */
import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core"

export const pacingPortfolioSnapshots = pgTable(
  "pacing_portfolio_snapshots",
  {
    id: serial("id").primaryKey(),
    asOfDate: date("as_of_date", { mode: "string" }).notNull(),
    scopeKey: text("scope_key").notNull(),
    liveOnly: boolean("live_only").notNull(),
    rows: jsonb("rows").$type<unknown[]>().notNull(),
    counts: jsonb("counts").$type<Record<string, number>>().notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    durationMs: integer("duration_ms"),
  },
  (table) => [
    unique("pacing_portfolio_snapshots_as_of_scope_live_key").on(
      table.asOfDate,
      table.scopeKey,
      table.liveOnly,
    ),
  ],
)
