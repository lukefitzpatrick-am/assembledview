/**
 * billing_revisions (migration 0106, billing revisions). SQL is source of truth.
 * 0106 is applied (26 Oct 2026). 0109 widens the mode check (true_up,
 * true_up_restore). Do not db.select() this table until
 * migration_markers contains 0106_billing_revisions (C-76): every read and
 * write goes through lib/finance/revisions/marker.ts first.
 * RLS on; no ava_readonly grant.
 */
import { sql } from "drizzle-orm"
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import { mediaPlanMasters, mediaPlanVersions } from "./planCore"

export const billingRevisions = pgTable(
  "billing_revisions",
  {
    id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    masterId: bigint("master_id", { mode: "number" })
      .notNull()
      .references(() => mediaPlanMasters.id, { onDelete: "cascade" }),
    mbaNumber: text("mba_number").notNull(),
    baseVersionId: bigint("base_version_id", { mode: "number" })
      .notNull()
      .references(() => mediaPlanVersions.id, { onDelete: "cascade" }),
    baseVersionNumber: integer("base_version_number").notNull(),
    newVersionId: bigint("new_version_id", { mode: "number" }).references(() => mediaPlanVersions.id, {
      onDelete: "set null",
    }),
    newVersionNumber: integer("new_version_number"),
    mode: text("mode").notNull(),
    params: jsonb("params").notNull(),
    reason: text("reason").notNull(),
    movedCents: bigint("moved_cents", { mode: "number" }).notNull(),
    diff: jsonb("diff").notNull(),
    resultHash: text("result_hash").notNull(),
    source: text("source").notNull(),
    createdBy: bigint("created_by", { mode: "number" }).notNull(),
    createdByName: text("created_by_name"),
    restoresRevisionId: bigint("restores_revision_id", { mode: "number" }),
    status: text("status").notNull().default("applied"),
  },
  (table) => [
    foreignKey({
      columns: [table.restoresRevisionId],
      foreignColumns: [table.id],
      name: "billing_revisions_restores_revision_id_fkey",
    }).onDelete("set null"),
    check(
      "billing_revisions_mode_check",
      sql`${table.mode} IN ('pull_month', 'bill_remainder', 'bill_amount', 'underspend', 'restore', 'true_up', 'true_up_restore')`,
    ),
    check("billing_revisions_reason_check", sql`length(btrim(${table.reason})) > 0`),
    check("billing_revisions_source_check", sql`${table.source} IN ('ui', 'ava')`),
    check("billing_revisions_status_check", sql`${table.status} IN ('applied', 'restored', 'noted')`),
    index("idx_billing_revisions_master_created").on(table.masterId, table.createdAt.desc()),
    index("idx_billing_revisions_mba").on(sql`lower(${table.mbaNumber})`),
    uniqueIndex("uq_billing_revisions_new_version")
      .on(table.newVersionId)
      .where(sql`${table.newVersionId} IS NOT NULL`),
  ],
)
