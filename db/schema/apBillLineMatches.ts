/**
 * ap_bill_line_matches (migration 0107, MAR-4). SQL is source of truth.
 * 0107 is authored and not applied. Do not read or write this table until
 * migration_markers contains 0107_ap_bill_line_matches: every read and write
 * goes through lib/finance/sections/fixedCostMargin/manualMatches.ts, which
 * checks the marker first. RLS on; no ava_readonly grant.
 */
import { sql } from "drizzle-orm"
import { bigint, check, date, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

export const apBillLineMatches = pgTable(
  "ap_bill_line_matches",
  {
    id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    xeroInvoiceId: text("xero_invoice_id").notNull(),
    xeroLineItemId: text("xero_line_item_id").notNull(),
    lineIndex: integer("line_index").notNull(),
    mbaNumber: text("mba_number").notNull(),
    lineItemId: text("line_item_id").notNull(),
    month: date("month").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    matchedBy: text("matched_by").notNull(),
    matchedByName: text("matched_by_name"),
    matchedAt: timestamp("matched_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    note: text("note"),
  },
  (table) => [
    check("ap_bill_line_matches_line_index_check", sql`${table.lineIndex} >= 0`),
    check("ap_bill_line_matches_month_check", sql`EXTRACT(DAY FROM ${table.month}) = 1`),
    check(
      "ap_bill_line_matches_ids_check",
      sql`length(btrim(${table.xeroInvoiceId})) > 0 AND length(btrim(${table.xeroLineItemId})) > 0 AND length(btrim(${table.mbaNumber})) > 0 AND length(btrim(${table.lineItemId})) > 0 AND length(btrim(${table.matchedBy})) > 0`,
    ),
    uniqueIndex("uq_ap_bill_line_matches_bill_line").on(table.xeroInvoiceId, table.xeroLineItemId),
    index("idx_ap_bill_line_matches_line").on(sql`lower(${table.lineItemId})`),
  ],
)
