/**
 * data_quality_items (migration 0123, S17). SQL is source of truth.
 * The Data quality queue: one open row per rule, plan and line
 * (`data_quality_items_open_key`). Read and written only through
 * lib/dataQuality/items.server.ts, behind the switch data_quality_queue,
 * which needs the marker 0123_data_quality_items. RLS on; no ava_readonly grant.
 */
import { sql } from "drizzle-orm"
import { bigint, check, foreignKey, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

import { clients } from "./ported"

export const dataQualityItems = pgTable(
  "data_quality_items",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    ruleKey: text("rule_key").notNull(),
    mbaNumber: text("mba_number").notNull(),
    /** Null for a whole-plan problem. */
    lineItemId: text("line_item_id"),
    clientId: bigint("client_id", { mode: "number" }),
    message: text("message").notNull(),
    fixLabel: text("fix_label").notNull(),
    /** In-app path. */
    fixHref: text("fix_href").notNull(),
    /** Lowercase email; null = unassigned. */
    ownerEmail: text("owner_email"),
    /** open | resolved | dismissed */
    status: text("status").notNull().default("open"),
    dismissReason: text("dismiss_reason"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "string" }),
    /** The actor's email, or `check` when the check stopped finding it. */
    resolvedBy: text("resolved_by"),
  },
  (table) => [
    foreignKey({
      name: "data_quality_items_client_fk",
      columns: [table.clientId],
      foreignColumns: [clients.id],
    }).onDelete("set null"),
    uniqueIndex("data_quality_items_open_key")
      .on(table.ruleKey, table.mbaNumber, sql`(coalesce(${table.lineItemId}, ''))`)
      .where(sql`${table.status} = 'open'`),
    index("data_quality_items_status_owner_idx").on(table.status, table.ownerEmail),
    check("data_quality_items_rule_key_check", sql`char_length(${table.ruleKey}) BETWEEN 1 AND 100`),
    check("data_quality_items_mba_number_check", sql`btrim(${table.mbaNumber}) <> ''`),
    check("data_quality_items_message_check", sql`char_length(${table.message}) BETWEEN 1 AND 2000`),
    check("data_quality_items_fix_label_check", sql`char_length(${table.fixLabel}) BETWEEN 1 AND 200`),
    check(
      "data_quality_items_fix_href_check",
      sql`${table.fixHref} LIKE '/%' AND ${table.fixHref} NOT LIKE '//%'`,
    ),
    check(
      "data_quality_items_owner_email_check",
      sql`${table.ownerEmail} IS NULL OR ${table.ownerEmail} = lower(${table.ownerEmail})`,
    ),
    check("data_quality_items_status_check", sql`${table.status} IN ('open', 'resolved', 'dismissed')`),
    check(
      "data_quality_items_dismiss_reason_check",
      sql`${table.status} <> 'dismissed' OR char_length(btrim(coalesce(${table.dismissReason}, ''))) BETWEEN 1 AND 1000`,
    ),
    check("data_quality_items_resolved_check", sql`(${table.status} = 'open') = (${table.resolvedAt} IS NULL)`),
  ],
)
