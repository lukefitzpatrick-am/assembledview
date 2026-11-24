/**
 * billing_above_plan_reasons (migration 0121, S14). SQL is source of truth.
 * The finance reason that lets a billing record held above plan go to Xero.
 * Append only (a trigger refuses UPDATE and DELETE): the latest row for a record is its reason. It stands while the
 * record's amount above plan is at most `coversCents`. Read and written only
 * through lib/finance/abovePlanHold.server.ts, behind the switch
 * billing_above_plan_hold, which needs the marker 0121_billing_above_plan_reasons.
 * RLS on; no ava_readonly grant.
 */
import { sql } from "drizzle-orm"
import { bigint, check, foreignKey, index, pgTable, text, timestamp } from "drizzle-orm/pg-core"

import { financeBillingRecords } from "./ported"

export const billingAbovePlanReasons = pgTable(
  "billing_above_plan_reasons",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    financeBillingRecordId: bigint("finance_billing_record_id", { mode: "number" }).notNull(),
    reason: text("reason").notNull(),
    /** The amount above plan this reason covers, integer cents. */
    coversCents: bigint("covers_cents", { mode: "number" }).notNull(),
    /** Team member id, as `approved_by`. */
    createdBy: bigint("created_by", { mode: "number" }).notNull(),
    createdByName: text("created_by_name"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "billing_above_plan_reasons_record_fk",
      columns: [table.financeBillingRecordId],
      foreignColumns: [financeBillingRecords.id],
    }).onDelete("restrict"),
    index("billing_above_plan_reasons_record_idx").on(table.financeBillingRecordId),
    check("billing_above_plan_reasons_reason_check", sql`char_length(btrim(${table.reason})) BETWEEN 1 AND 2000`),
    check("billing_above_plan_reasons_covers_cents_check", sql`${table.coversCents} > 0`),
  ],
)
