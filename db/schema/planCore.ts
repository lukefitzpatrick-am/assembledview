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
import { clients } from "./ported"
import {
  lineChannelEnum,
  scheduleBasisEnum,
  scheduleComponentEnum,
  scheduleSourceEnum,
} from "./enums"

export const mediaPlanMasters = pgTable(
  "media_plan_masters",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  mbaNumber: text('mba_number').notNull().unique(),
  clientId: bigint('client_id', { mode: "number" }).references(() => clients.id),
  mpClientName: text('mp_client_name'),
  campaignName: text('campaign_name'),
  campaignStatus: text('campaign_status'),
  campaignStartDate: date('campaign_start_date'),
  campaignEndDate: date('campaign_end_date'),
  campaignBudgetCents: bigint('campaign_budget_cents', { mode: "number" }),
  publishedVersionId: bigint('published_version_id', { mode: "number" }),
  },
  (table) => [
    foreignKey({
      columns: [table.publishedVersionId],
      foreignColumns: [mediaPlanVersions.id],
      name: "fk_masters_published_version",
    }),
  ],
)

export const mediaPlanVersions = pgTable(
  "media_plan_versions",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  masterId: bigint('master_id', { mode: "number" }).references(() => mediaPlanMasters.id, { onDelete: "cascade" }).notNull(),
  versionNumber: integer('version_number').notNull(),
  mbaNumber: text('mba_number').notNull(),
  campaignName: text('campaign_name'),
  campaignStatus: text('campaign_status'),
  campaignStartDate: date('campaign_start_date'),
  campaignEndDate: date('campaign_end_date'),
  brand: text('brand'),
  clientContact: text('client_contact'),
  poNumber: text('po_number'),
  campaignBudgetCents: bigint('campaign_budget_cents', { mode: "number" }),
  fixedFee: boolean('fixed_fee'),
  channelFlags: jsonb('channel_flags'),
  legacySchedules: jsonb('legacy_schedules'),
  mediaPlanFile: jsonb('media_plan_file'),
  mbaPdfFile: jsonb('mba_pdf_file'),
  aaMediaPlanFile: jsonb('aa_media_plan_file'),
  },
  (table) => [
    unique().on(table.masterId, table.versionNumber),
  ],
)

export const lineItems = pgTable(
  "line_items",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  versionId: bigint('version_id', { mode: "number" }).references(() => mediaPlanVersions.id, { onDelete: "cascade" }).notNull(),
  channel: lineChannelEnum('channel').notNull(),
  lineItemId: text('line_item_id').notNull(),
  position: integer('position'),
  market: text('market'),
  buyingDemo: text('buying_demo'),
  buyType: text('buy_type'),
  publisher: text('publisher'),
  platform: text('platform'),
  bidStrategy: text('bid_strategy'),
  fixedCostMedia: boolean('fixed_cost_media'),
  clientPaysForMedia: boolean('client_pays_for_media'),
  budgetIncludesFees: boolean('budget_includes_fees'),
  noAdserving: boolean('no_adserving'),
  bursts: jsonb('bursts'),
  attrs: jsonb('attrs'),
  },
  (table) => [
    unique().on(table.versionId, table.lineItemId),
    index("idx_line_items_version").on(table.versionId),
    index("idx_line_items_channel").on(table.channel),
    index("idx_line_items_line_item_id").on(table.lineItemId),
  ],
)

export const scheduleMonths = pgTable(
  "schedule_months",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  versionId: bigint('version_id', { mode: "number" }).references(() => mediaPlanVersions.id, { onDelete: "cascade" }).notNull(),
  lineItemId: text('line_item_id').notNull(),
  component: scheduleComponentEnum('component').notNull(),
  basis: scheduleBasisEnum('basis').notNull(),
  month: date('month').notNull(),
  amountCents: bigint('amount_cents', { mode: "number" }).notNull(),
  source: scheduleSourceEnum('source').notNull().default("computed"),
  },
  (table) => [
    unique().on(table.versionId, table.lineItemId, table.component, table.basis, table.month),
    index("idx_schedule_months_version").on(table.versionId),
    index("idx_schedule_months_month").on(table.month),
  ],
)

export const mbaFeeSnapshots = pgTable(
  "mba_fee_snapshots",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  versionId: bigint('version_id', { mode: "number" }).references(() => mediaPlanVersions.id, { onDelete: "cascade" }).notNull().unique(),
  fees: jsonb('fees').notNull(),
  capturedAt: timestamp('captured_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
)

export const billingOverrides = pgTable(
  "billing_overrides",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  versionId: bigint('version_id', { mode: "number" }).references(() => mediaPlanVersions.id, { onDelete: "cascade" }).notNull(),
  lineItemId: text('line_item_id').notNull(),
  component: scheduleComponentEnum('component').notNull(),
  mode: text('mode').default("manual"),
  reason: text('reason'),
  months: jsonb('months'),
  dateBasis: text('date_basis'),
  },
  (table) => [
    unique().on(table.versionId, table.lineItemId, table.component),
  ],
)

/** X5.1 MBA line include/exclude. Absence of a row = approved (all-in). */
export const mbaLineApprovals = pgTable(
  "mba_line_approvals",
  {
    id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    mbaNumber: text("mba_number").notNull(),
    mediaPlanVersion: integer("media_plan_version").notNull(),
    lineItemId: text("line_item_id").notNull(),
    mediaType: text("media_type").notNull(),
    approved: boolean("approved").notNull().default(true),
    approvedInVersion: integer("approved_in_version"),
  },
  (table) => [
    unique().on(
      table.mbaNumber,
      table.mediaPlanVersion,
      table.lineItemId,
      table.mediaType
    ),
    index("idx_mba_line_approvals_mba_version").on(
      table.mbaNumber,
      table.mediaPlanVersion
    ),
    index("idx_mba_line_approvals_line_item_id").on(table.lineItemId),
  ]
)

