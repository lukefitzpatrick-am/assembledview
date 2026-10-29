/**
 * True-up tables (migration 0109, monthly invoiced vs billing schedule).
 * SQL is source of truth. 0109 is authored and not applied. Do not
 * db.select() these tables until migration_markers contains 0109_true_up
 * (C-76): every read and write goes through lib/finance/trueUp/marker.ts.
 * RLS on. ava_readonly SELECT (ava_read policy) comes from 0110.
 */
import { sql } from "drizzle-orm"
import { bigint, check, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

import { billingRevisions } from "./billingRevisions"

export const trueUpRuns = pgTable(
  "true_up_runs",
  {
    id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    asOfMonth: date("as_of_month", { mode: "string" }).notNull(),
    fromMonth: date("from_month", { mode: "string" }).notNull(),
    source: text("source").notNull(),
    createdBy: bigint("created_by", { mode: "number" }),
    createdByName: text("created_by_name"),
    xeroSyncedAt: timestamp("xero_synced_at", { withTimezone: true, mode: "string" }),
    provisionalInvoices: integer("provisional_invoices").notNull().default(0),
    mbasNeedingAction: integer("mbas_needing_action").notNull().default(0),
    totals: jsonb("totals").notNull(),
    rows: jsonb("rows").notNull(),
    emailedAt: timestamp("emailed_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    check("true_up_runs_source_check", sql`${table.source} IN ('cron', 'manual')`),
    check(
      "true_up_runs_months_check",
      sql`${table.asOfMonth} = date_trunc('month', ${table.asOfMonth})::date AND ${table.fromMonth} = date_trunc('month', ${table.fromMonth})::date AND ${table.fromMonth} <= ${table.asOfMonth}`,
    ),
    index("idx_true_up_runs_as_of").on(table.asOfMonth.desc(), table.createdAt.desc()),
  ],
)

export const trueUpActions = pgTable(
  "true_up_actions",
  {
    id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    runId: bigint("run_id", { mode: "number" }).references(() => trueUpRuns.id, { onDelete: "set null" }),
    mbaNumber: text("mba_number").notNull(),
    component: text("component").notNull(),
    action: text("action").notNull(),
    strategy: text("strategy"),
    months: text("months").array().notNull().default(sql`'{}'::text[]`),
    asOfMonth: date("as_of_month", { mode: "string" }).notNull(),
    gapCents: bigint("gap_cents", { mode: "number" }).notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull().default(0),
    billingRevisionId: bigint("billing_revision_id", { mode: "number" }).references(() => billingRevisions.id, {
      onDelete: "set null",
    }),
    reasonCode: text("reason_code"),
    note: text("note"),
    xeroInvoiceId: text("xero_invoice_id"),
    status: text("status").notNull().default("applied"),
    createdBy: bigint("created_by", { mode: "number" }).notNull(),
    createdByName: text("created_by_name"),
    undoneAt: timestamp("undone_at", { withTimezone: true, mode: "string" }),
    undoneBy: bigint("undone_by", { mode: "number" }),
    previewHash: text("preview_hash"),
  },
  (table) => [
    check("true_up_actions_component_check", sql`${table.component} IN ('fee', 'adserving', 'production', 'media')`),
    check("true_up_actions_action_check", sql`${table.action} IN ('schedule', 'explained', 'one_off', 'credit_note')`),
    check("true_up_actions_strategy_check", sql`${table.strategy} IS NULL OR ${table.strategy} IN ('spread', 'carry')`),
    check(
      "true_up_actions_reason_check",
      sql`${table.reasonCode} IS NULL OR ${table.reasonCode} IN ('timing', 'prebill', 'client_agreed', 'schedule_incomplete', 'other')`,
    ),
    check("true_up_actions_status_check", sql`${table.status} IN ('applied', 'undone')`),
    check("true_up_actions_mba_check", sql`length(btrim(${table.mbaNumber})) > 0`),
    index("idx_true_up_actions_mba").on(sql`lower(${table.mbaNumber})`, table.component, table.status),
    index("idx_true_up_actions_revision")
      .on(table.billingRevisionId)
      .where(sql`${table.billingRevisionId} IS NOT NULL`),
  ],
)

export const trueUpInvoiceLinks = pgTable(
  "true_up_invoice_links",
  {
    id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    xeroInvoiceId: text("xero_invoice_id").notNull(),
    mbaNumber: text("mba_number").notNull(),
    billingMonth: date("billing_month", { mode: "string" }),
    note: text("note"),
    createdBy: bigint("created_by", { mode: "number" }).notNull(),
    createdByName: text("created_by_name"),
  },
  (table) => [
    check("true_up_invoice_links_mba_check", sql`length(btrim(${table.mbaNumber})) > 0`),
    check(
      "true_up_invoice_links_month_check",
      sql`${table.billingMonth} IS NULL OR ${table.billingMonth} = date_trunc('month', ${table.billingMonth})::date`,
    ),
    uniqueIndex("uq_true_up_invoice_links_invoice").on(table.xeroInvoiceId),
  ],
)
