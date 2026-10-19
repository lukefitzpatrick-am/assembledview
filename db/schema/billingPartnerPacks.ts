/**
 * billing_partner_packs and billing_partner_pack_items (migration 0100).
 * SQL is source of truth. 0100 is AUTHOR ONLY. Do not SELECT these tables
 * until migration_markers contains 0100_billing_partner_packs (C-76).
 * RLS is on, with no policies.
 */
import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"

import { mediaPlanVersions } from "./planCore"

export const billingPartnerPacks = pgTable(
  "billing_partner_packs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    billingMonth: date("billing_month", { mode: "string" }).notNull(),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "string" }),
    sentBy: text("sent_by"),
    blobPathname: text("blob_pathname"),
    note: text("note"),
  },
  (table) => [
    check(
      "billing_partner_packs_status_check",
      sql`${table.status} IN ('draft', 'sent')`,
    ),
    index("idx_billing_partner_packs_billing_month_status").on(
      table.billingMonth,
      table.status,
    ),
  ],
)

export const billingPartnerPackItems = pgTable(
  "billing_partner_pack_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    packId: uuid("pack_id").notNull(),
    mbaNumber: text("mba_number").notNull(),
    versionId: bigint("version_id", { mode: "number" }).notNull(),
    versionNumber: integer("version_number").notNull(),
    changeKind: text("change_kind").notNull(),
    monthsChanged: jsonb("months_changed"),
    backDated: boolean("back_dated").notNull().default(false),
  },
  (table) => [
    check(
      "billing_partner_pack_items_change_kind_check",
      sql`${table.changeKind} IN ('new', 'amended')`,
    ),
    foreignKey({
      columns: [table.packId],
      foreignColumns: [billingPartnerPacks.id],
      name: "billing_partner_pack_items_pack_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.versionId],
      foreignColumns: [mediaPlanVersions.id],
      name: "billing_partner_pack_items_version_id_fkey",
    }),
    unique("billing_partner_pack_items_pack_id_version_id_key").on(
      table.packId,
      table.versionId,
    ),
    index("idx_billing_partner_pack_items_mba_number").on(table.mbaNumber),
    index("idx_billing_partner_pack_items_version_id").on(table.versionId),
  ],
)
