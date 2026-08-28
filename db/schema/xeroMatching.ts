/**
 * xero_invoice_matches, xero_contact_links, xero_match_month_metrics
 * (migration 0011). SQL is source of truth; this mirror is for generate/diff
 * fidelity. RLS is on. Existing callers use raw `sql` templates
 * (`app/api/finance/xero-match/*`); this pack does not change them.
 */
import {
  bigint,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core"
import { xeroMatchMethodEnum, xeroMatchStatusEnum } from "./enums"
import { financeRunItems } from "./financePeriods"
import { clients } from "./ported"

export const xeroInvoiceMatches = pgTable(
  "xero_invoice_matches",
  {
    id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    xeroInvoiceId: text("xero_invoice_id").notNull(),
    runItemId: bigint("run_item_id", { mode: "number" }).references(
      () => financeRunItems.id,
      { onDelete: "set null" },
    ),
    method: xeroMatchMethodEnum("method").notNull(),
    confidence: numeric("confidence").notNull().default("0"),
    deltaCents: bigint("delta_cents", { mode: "number" }).notNull().default(0),
    status: xeroMatchStatusEnum("status").notNull().default("matched"),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true, mode: "string" }),
    cardKind: text("card_kind"),
    detail: text("detail"),
    periodMonth: date("period_month"),
  },
  (table) => [
    unique("uq_xero_invoice_matches_invoice").on(table.xeroInvoiceId),
    index("idx_xero_invoice_matches_period").on(table.periodMonth),
    index("idx_xero_invoice_matches_run_item").on(table.runItemId),
    index("idx_xero_invoice_matches_status").on(table.status),
  ],
)

export const xeroContactLinks = pgTable(
  "xero_contact_links",
  {
    id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    xeroContactKey: text("xero_contact_key").notNull(),
    clientId: bigint("client_id", { mode: "number" })
      .notNull()
      .references(() => clients.id),
    learnedFrom: text("learned_from"),
  },
  (table) => [
    unique("uq_xero_contact_links_key").on(table.xeroContactKey),
    index("idx_xero_contact_links_client").on(table.clientId),
  ],
)

export const xeroMatchMonthMetrics = pgTable("xero_match_month_metrics", {
  periodMonth: date("period_month").primaryKey(),
  referenceAttempts: integer("reference_attempts").notNull().default(0),
  referenceHits: integer("reference_hits").notNull().default(0),
  referenceHitRate: numeric("reference_hit_rate").notNull().default("0"),
  tier1Matched: integer("tier1_matched").notNull().default(0),
  tier1Diverged: integer("tier1_diverged").notNull().default(0),
  tier2Suggested: integer("tier2_suggested").notNull().default(0),
  duplicates: integer("duplicates").notNull().default(0),
  orphans: integer("orphans").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
})
