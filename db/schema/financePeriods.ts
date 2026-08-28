/**
 * finance_periods, finance_run_items, app_notifications (migration 0010).
 * SQL is source of truth; this mirror is for generate/diff fidelity.
 * RLS is on. Existing callers use raw `sql` templates
 * (`lib/finance/periods/postgresStore.ts`, `lib/billing/lockBillingMonth.ts`,
 * `lib/finance/sections/investment/cutArQuery.ts`); this pack does not change them.
 */
import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core"
import {
  financePeriodStatusEnum,
  financeRunItemStatusEnum,
  financeRunSourceEnum,
} from "./enums"
import { clients } from "./ported"
import { mediaPlanVersions } from "./planCore"

export const financePeriods = pgTable(
  "finance_periods",
  {
    id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    periodMonth: date("period_month").notNull(),
    status: financePeriodStatusEnum("status").notNull().default("open"),
    ranAt: timestamp("ran_at", { withTimezone: true, mode: "string" }),
    lockedAt: timestamp("locked_at", { withTimezone: true, mode: "string" }),
    lockedBy: text("locked_by"),
    amendedAfterLock: boolean("amended_after_lock").notNull().default(false),
    sheetBlobPathname: text("sheet_blob_pathname"),
    sheetVersion: integer("sheet_version").notNull().default(1),
  },
  (table) => [
    unique("uq_finance_periods_period_month").on(table.periodMonth),
    index("idx_finance_periods_status").on(table.status),
  ],
)

export const financeRunItems = pgTable(
  "finance_run_items",
  {
    id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    periodId: bigint("period_id", { mode: "number" })
      .notNull()
      .references(() => financePeriods.id, { onDelete: "cascade" }),
    source: financeRunSourceEnum("source").notNull(),
    naturalKey: text("natural_key").notNull(),
    mbaNumber: text("mba_number"),
    clientId: bigint("client_id", { mode: "number" }).references(() => clients.id),
    versionId: bigint("version_id", { mode: "number" }).references(
      () => mediaPlanVersions.id,
    ),
    /** Confirmed: no FK in the live DB. */
    sowId: bigint("sow_id", { mode: "number" }),
    lineItemsJson: jsonb("line_items_json").notNull().default(sql`'[]'::jsonb`),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull().default(0),
    invoiceReference: text("invoice_reference").notNull(),
    status: financeRunItemStatusEnum("status").notNull().default("pending"),
    adjustmentCents: bigint("adjustment_cents", { mode: "number" }),
    adjustmentReason: text("adjustment_reason"),
    holdReason: text("hold_reason"),
    excludeReason: text("exclude_reason"),
    clientSnapshotJson: jsonb("client_snapshot_json"),
    linkedVarianceFromItemId: bigint("linked_variance_from_item_id", {
      mode: "number",
    }),
    rolledFromItemId: bigint("rolled_from_item_id", { mode: "number" }),
  },
  (table) => [
    unique("uq_finance_run_items_period_source_key").on(
      table.periodId,
      table.source,
      table.naturalKey,
    ),
    index("idx_finance_run_items_mba").on(table.mbaNumber),
    index("idx_finance_run_items_period").on(table.periodId),
    index("idx_finance_run_items_status").on(table.status),
    foreignKey({
      columns: [table.linkedVarianceFromItemId],
      foreignColumns: [table.id],
    }),
    foreignKey({
      columns: [table.rolledFromItemId],
      foreignColumns: [table.id],
    }),
  ],
)

export const appNotifications = pgTable(
  "app_notifications",
  {
    id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    audience: text("audience").notNull(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    readAt: timestamp("read_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    index("idx_app_notifications_audience_created").on(
      table.audience,
      table.createdAt.desc(),
    ),
    index("idx_app_notifications_unread")
      .on(table.audience)
      .where(sql`${table.readAt} IS NULL`),
  ],
)
