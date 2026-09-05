/**
 * Programmatic delivery platform → source (migration 0063).
 * AUTHOR ONLY — do not drizzle-kit migrate; Luke applies the SQL.
 * Runtime lookup uses the TypeScript seed in lib/delivery/deliverySourceMap.ts
 * until 0063 is applied. Do not SELECT this table against live Postgres (C-76).
 */
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const deliverySourceMap = pgTable("delivery_source_map", {
  publisherKey: text("publisher_key").primaryKey(),
  deliverySource: text("delivery_source").notNull(),
  deriveSpendFromPlan: boolean("derive_spend_from_plan").notNull().default(false),
  active: boolean("active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
})
