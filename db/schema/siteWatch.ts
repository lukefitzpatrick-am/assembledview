/**
 * Site Watch (migration 0122). SQL is source of truth. A daily scan of each
 * client website: sites, one run per site per Melbourne date, the latest
 * snapshot per page, and the change log (runs and their changes are deleted
 * after 90 days). Read and written only through lib/siteWatch/store.ts,
 * behind the switch site_watch, which needs the marker 0122_site_watch.
 * RLS on; no ava_readonly grant.
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
  uniqueIndex,
} from "drizzle-orm/pg-core"

import { clients } from "./ported"

export const siteWatchSites = pgTable(
  "site_watch_sites",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    clientId: bigint("client_id", { mode: "number" }).notNull(),
    label: text("label").notNull(),
    baseUrl: text("base_url").notNull(),
    /** Sitemap URLs must start with origin + this path; null = the whole host. */
    urlPrefix: text("url_prefix"),
    sitemapUrl: text("sitemap_url"),
    robotsUrl: text("robots_url"),
    keyUrls: text("key_urls").array().notNull().default(sql`'{}'`),
    pageLimit: integer("page_limit").notNull().default(100),
    ignoreSelectors: text("ignore_selectors").array().notNull().default(sql`'{}'`),
    watchText: boolean("watch_text").notNull().default(true),
    watchVisual: boolean("watch_visual").notNull().default(true),
    enabled: boolean("enabled").notNull().default(true),
    /** Latest robots.txt body; null until first read. */
    robotsTxt: text("robots_txt"),
    /** Latest sitemap URL set; null until first read. */
    sitemapUrls: text("sitemap_urls").array(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "site_watch_sites_client_fk",
      columns: [table.clientId],
      foreignColumns: [clients.id],
    }).onDelete("cascade"),
    uniqueIndex("site_watch_sites_base_url_uq").on(sql`lower(${table.baseUrl})`),
    index("site_watch_sites_client_idx").on(table.clientId),
    check("site_watch_sites_page_limit_check", sql`${table.pageLimit} BETWEEN 1 AND 500`),
    check("site_watch_sites_base_url_check", sql`${table.baseUrl} ~* '^https?://'`),
  ],
)

export const siteWatchRuns = pgTable(
  "site_watch_runs",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    siteId: bigint("site_id", { mode: "number" }).notNull(),
    scanDate: date("scan_date", { mode: "string" }).notNull(),
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    /** The page list, fixed when the run is planned; null until then. */
    pageUrls: text("page_urls").array(),
    /** Resume cursor into page_urls. */
    nextPage: integer("next_page").notNull().default(0),
    cssHashes: jsonb("css_hashes").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    pagesChecked: integer("pages_checked").notNull().default(0),
    pagesChanged: integer("pages_changed").notNull().default(0),
    pagesFailed: integer("pages_failed").notNull().default(0),
    /** `blocked` (bot protection), `thin_html` (near-empty server HTML). */
    flags: text("flags").array().notNull().default(sql`'{}'`),
    error: text("error"),
    emailedAt: timestamp("emailed_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    foreignKey({
      name: "site_watch_runs_site_fk",
      columns: [table.siteId],
      foreignColumns: [siteWatchSites.id],
    }).onDelete("cascade"),
    uniqueIndex("site_watch_runs_site_date_uq").on(table.siteId, table.scanDate),
    index("site_watch_runs_status_idx").on(table.status, table.createdAt),
    check("site_watch_runs_status_check", sql`${table.status} IN ('queued', 'running', 'done', 'failed')`),
  ],
)

export const siteWatchPages = pgTable(
  "site_watch_pages",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    siteId: bigint("site_id", { mode: "number" }).notNull(),
    url: text("url").notNull(),
    fields: jsonb("fields").notNull(),
    pageText: text("page_text"),
    layout: text("layout"),
    /** Set while the page fails to load; the last good fields stay. */
    failError: text("fail_error"),
    lastRunId: bigint("last_run_id", { mode: "number" }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    lastChangedAt: timestamp("last_changed_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "site_watch_pages_site_fk",
      columns: [table.siteId],
      foreignColumns: [siteWatchSites.id],
    }).onDelete("cascade"),
    uniqueIndex("site_watch_pages_site_url_uq").on(table.siteId, table.url),
  ],
)

export const siteWatchChanges = pgTable(
  "site_watch_changes",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    siteId: bigint("site_id", { mode: "number" }).notNull(),
    runId: bigint("run_id", { mode: "number" }).notNull(),
    /** Null for site-level changes (robots.txt, sitemap). */
    url: text("url"),
    category: text("category").notNull(),
    field: text("field").notNull(),
    severity: text("severity").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    /** Line diff `{ lines, total }` for copy, layout and robots.txt. */
    diff: jsonb("diff"),
    /** Set when the same change hit more than 10 pages in one run. */
    groupKey: text("group_key"),
    detectedAt: timestamp("detected_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    acknowledgedBy: text("acknowledged_by"),
    acknowledgedByName: text("acknowledged_by_name"),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true, mode: "string" }),
    note: text("note"),
    teamsReportedAt: timestamp("teams_reported_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    foreignKey({
      name: "site_watch_changes_site_fk",
      columns: [table.siteId],
      foreignColumns: [siteWatchSites.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "site_watch_changes_run_fk",
      columns: [table.runId],
      foreignColumns: [siteWatchRuns.id],
    }).onDelete("cascade"),
    index("site_watch_changes_site_detected_idx").on(table.siteId, table.detectedAt.desc()),
    index("site_watch_changes_run_idx").on(table.runId),
    check("site_watch_changes_category_check", sql`${table.category} IN ('technical', 'tracking', 'content', 'visual')`),
    check("site_watch_changes_severity_check", sql`${table.severity} IN ('critical', 'high', 'medium', 'low')`),
  ],
)
