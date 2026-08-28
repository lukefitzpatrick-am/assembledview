/**
 * spec_deadline_overrides — explicit manual override of a derived material date.
 * Migration 0042. Same recorded-override rule as billing: who / when / value;
 * never inferred from drift. RLS on; no ava_readonly grant. Owner path only.
 */
import { bigint, date, index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core"

export const specDeadlineOverrides = pgTable(
  "spec_deadline_overrides",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    mbaNumber: text("mba_number").notNull(),
    publisherKey: text("publisher_key").notNull(),
    derivedYmd: date("derived_ymd").notNull(),
    overrideYmd: date("override_ymd").notNull(),
    overriddenBy: text("overridden_by").notNull(),
    overriddenAt: timestamp("overridden_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("spec_deadline_overrides_mba_publisher").on(
      table.mbaNumber,
      table.publisherKey,
    ),
    index("idx_spec_deadline_overrides_mba").on(table.mbaNumber),
  ],
)
