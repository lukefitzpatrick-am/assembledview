/**
 * web_kpis and web_kpi_targets (migration 0101).
 * SQL is source of truth. 0101 is authored and not applied.
 * Do not db.select() these tables until migration_markers contains
 * 0101_web_kpis (C-76). RLS is on, with no policies.
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
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { clients } from "./ported"

export const webKpis = pgTable(
  "web_kpis",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: bigint("client_id", { mode: "number" }).notNull(),
    label: text("label").notNull(),
    source: text("source").notNull(),
    eventNames: text("event_names").array(),
    metric: text("metric"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedBy: text("updated_by"),
  },
  (table) => [
    check(
      "web_kpis_source_check",
      sql`${table.source} IN ('ga4_event', 'ga4_metric', 'gsc_metric')`,
    ),
    check(
      "web_kpis_metric_check",
      sql`${table.metric} IS NULL OR ${table.metric} IN ('sessions', 'engaged_sessions', 'key_events', 'page_views', 'clicks', 'impressions')`,
    ),
    check(
      "web_kpis_source_fields_check",
      sql`(${table.source} = 'ga4_event' AND ${table.eventNames} IS NOT NULL AND cardinality(${table.eventNames}) >= 1 AND ${table.metric} IS NULL) OR (${table.source} = 'ga4_metric' AND ${table.metric} IN ('sessions', 'engaged_sessions', 'key_events', 'page_views') AND ${table.eventNames} IS NULL) OR (${table.source} = 'gsc_metric' AND ${table.metric} IN ('clicks', 'impressions') AND ${table.eventNames} IS NULL)`,
    ),
    foreignKey({
      columns: [table.clientId],
      foreignColumns: [clients.id],
      name: "web_kpis_client_id_fkey",
    }),
    index("idx_web_kpis_client_id_active").on(table.clientId, table.active),
  ],
)

export const webKpiTargets = pgTable(
  "web_kpi_targets",
  {
    kpiId: uuid("kpi_id").notNull(),
    month: date("month", { mode: "string" }).notNull(),
    target: numeric("target", { precision: 14, scale: 2 }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedBy: text("updated_by"),
  },
  (table) => [
    primaryKey({ name: "web_kpi_targets_pkey", columns: [table.kpiId, table.month] }),
    check("web_kpi_targets_month_check", sql`EXTRACT(DAY FROM ${table.month}) = 1`),
    check("web_kpi_targets_target_check", sql`${table.target} >= 0`),
    foreignKey({
      columns: [table.kpiId],
      foreignColumns: [webKpis.id],
      name: "web_kpi_targets_kpi_id_fkey",
    }).onDelete("cascade"),
  ],
)
