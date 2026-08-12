/**
 * Campaign insights (migration 0019) — Postgres-native insight store.
 * CHECK constraints are mirrored here for generate/diff fidelity; SQL is source of truth.
 * No FK to clients (ETL truncate-reload collision until T6).
 * mba_number is lowercase by DB CHECK — do not add app-side casing that fights it.
 */
import { sql } from "drizzle-orm"
import {
  bigint,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"

export type CampaignInsightType =
  | "delivery"
  | "audience"
  | "creative"
  | "channel"
  | "commercial"

export type CampaignInsightSource = "ava" | "human"

export const campaignInsights = pgTable(
  "campaign_insights",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    mbaNumber: text("mba_number").notNull(),
    clientId: bigint("client_id", { mode: "number" }).notNull(),
    period: text("period"),
    insightType: text("insight_type").notNull(),
    body: text("body").notNull(),
    source: text("source").notNull(),
    confidence: text("confidence"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    supersededBy: bigint("superseded_by", { mode: "number" }),
    supersededAt: timestamp("superseded_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    foreignKey({
      columns: [table.supersededBy],
      foreignColumns: [table.id],
      name: "campaign_insights_superseded_by_fkey",
    }),
    check(
      "campaign_insights_insight_type_check",
      sql`${table.insightType} = ANY (ARRAY['delivery'::text, 'audience'::text, 'creative'::text, 'channel'::text, 'commercial'::text])`,
    ),
    check(
      "campaign_insights_source_check",
      sql`${table.source} = ANY (ARRAY['ava'::text, 'human'::text])`,
    ),
    check(
      "campaign_insights_mba_number_lowercase",
      sql`${table.mbaNumber} = lower(${table.mbaNumber})`,
    ),
    check(
      "campaign_insights_supersede_pair",
      sql`(${table.supersededBy} IS NULL) = (${table.supersededAt} IS NULL)`,
    ),
    check(
      "campaign_insights_no_self_supersede",
      sql`(${table.supersededBy} IS NULL) OR (${table.supersededBy} <> ${table.id})`,
    ),
    index("idx_campaign_insights_client_created").on(
      table.clientId,
      table.createdAt.desc(),
    ),
    index("idx_campaign_insights_mba").on(table.mbaNumber),
    index("idx_campaign_insights_live")
      .on(table.clientId, table.createdAt.desc())
      .where(sql`${table.supersededBy} IS NULL`),
    index("idx_campaign_insights_body_fts").using(
      "gin",
      sql`to_tsvector('english'::regconfig, ${table.body})`,
    ),
  ],
)
