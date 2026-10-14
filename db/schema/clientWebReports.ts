/**
 * client_web_reports and client_web_report_versions (migration 0098).
 * Requires 0098 applied.
 * RLS on, no policies, no ava_readonly grant.
 * Do not db.select() these tables until 0098 is applied (C-76).
 */
import { sql } from "drizzle-orm"
import {
  bigint,
  bigserial,
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core"

import { clients } from "./ported"

export type ClientWebReportLayoutItem = {
  elementId: string
  settings: unknown
}

export const clientWebReports = pgTable(
  "client_web_reports",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    clientId: bigint("client_id", { mode: "number" })
      .notNull()
      .references(() => clients.id),
    status: text("status").notNull().default("draft"),
    currentVersion: integer("current_version").notNull().default(0),
    ga4PropertyRef: text("ga4_property_ref"),
    gscSiteRef: text("gsc_site_ref"),
    brandTerms: text("brand_terms")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    defaultPeriod: text("default_period").notNull().default("last_month"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }),
    updatedBy: text("updated_by"),
  },
  (table) => [
    check("client_web_reports_status_chk", sql`${table.status} in ('draft','published')`),
    check(
      "client_web_reports_default_period_chk",
      sql`${table.defaultPeriod} in ('last_month','last_28_days','month_to_date_yoy')`,
    ),
    unique("client_web_reports_client_id_uq").on(table.clientId),
  ],
)

export const clientWebReportVersions = pgTable(
  "client_web_report_versions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    reportId: bigint("report_id", { mode: "number" })
      .notNull()
      .references(() => clientWebReports.id),
    version: integer("version").notNull(),
    layout: jsonb("layout").$type<ClientWebReportLayoutItem[]>().notNull(),
    savedBy: text("saved_by"),
    savedAt: timestamp("saved_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("client_web_report_versions_report_version_uq").on(table.reportId, table.version),
  ],
)
