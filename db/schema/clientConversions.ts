/**
 * client_conversion_settings and client_conversion_events (migration 0103).
 * SQL is source of truth. 0103 is authored and not applied.
 * Do not db.select() these tables until migration_markers contains
 * 0103_client_conversions (C-76). RLS is on; ava_readonly has SELECT.
 */
import { sql } from "drizzle-orm"
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core"

import { clients } from "./ported"

export const clientConversionSettings = pgTable(
  "client_conversion_settings",
  {
    clientId: bigint("client_id", { mode: "number" })
      .primaryKey()
      .references(() => clients.id),
    enabled: boolean("enabled").notNull().default(false),
    headline: text("headline").notNull().default("conversions"),
    showRevenue: boolean("show_revenue").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedBy: text("updated_by"),
  },
  (table) => [
    check(
      "client_conversion_settings_headline_check",
      sql`${table.headline} in ('purchases','leads','conversions')`,
    ),
  ],
)

export const clientConversionEvents = pgTable(
  "client_conversion_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    clientId: bigint("client_id", { mode: "number" })
      .notNull()
      .references(() => clients.id),
    platform: text("platform").notNull(),
    eventKey: text("event_key").notNull(),
    label: text("label"),
    category: text("category").notNull(),
    includeValue: boolean("include_value").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedBy: text("updated_by"),
  },
  (table) => [
    check(
      "client_conversion_events_platform_check",
      sql`${table.platform} in ('meta_ads','google_ads','tiktok','dv360','cm360','taboola','reddit')`,
    ),
    check(
      "client_conversion_events_category_check",
      sql`${table.category} in ('purchase','lead','other')`,
    ),
    unique("client_conversion_events_client_platform_key").on(
      table.clientId,
      table.platform,
      table.eventKey,
    ),
    index("idx_client_conversion_events_client_active").on(table.clientId, table.active),
  ],
)
