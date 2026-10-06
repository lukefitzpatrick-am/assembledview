/**
 * finance_clearance_sends (migration 0090). SQL is source of truth.
 * Do not db.select() this table against live Postgres before applying (C-76).
 */
import { bigint, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const financeClearanceSends = pgTable("finance_clearance_sends", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  month: text("month").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  hash: text("hash").notNull(),
  counts: jsonb("counts").notNull(),
})
