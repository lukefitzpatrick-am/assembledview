import { bigint, date, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core"

/** Weekday overdue digest. One row per Sydney civil date. Migration 0093, AUTHOR ONLY. */
export const overdueDigestSends = pgTable("overdue_digest_sends", {
  asOfDate: date("as_of_date").primaryKey(),
  sentAt: timestamp("sent_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  invoiceCount: integer("invoice_count").notNull(),
  totalDueCents: bigint("total_due_cents", { mode: "number" }).notNull(),
  recipients: text("recipients").array().notNull(),
})
