/**
 * Publisher schedule ingest profiles (migration 0024).
 * Config only — mapping is jsonb on the row, not TypeScript per publisher.
 */
import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core"
import { publishers } from "./ported"

export const publisherProfiles = pgTable(
  "publisher_profiles",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    publisherName: text("publisher_name").notNull(),
    publisherId: bigint("publisher_id", { mode: "number" }).references(
      () => publishers.id,
    ),
    mediaType: text("media_type").notNull(),
    active: boolean("active").notNull().default(true),
    detectSignature: jsonb("detect_signature").notNull().default({}),
    columnMap: jsonb("column_map").notNull().default({}),
    gridSemantics: text("grid_semantics").notNull(),
    lineGranularity: text("line_granularity").notNull().default("per_row"),
    legendMap: jsonb("legend_map").notNull().default({}),
    sheetRules: jsonb("sheet_rules").notNull().default([]),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("publisher_profiles_publisher_name_unique").on(table.publisherName),
    check(
      "publisher_profiles_grid_semantics_check",
      sql`${table.gridSemantics} = ANY (ARRAY['status_matrix'::text, 'count'::text, 'currency'::text])`,
    ),
    check(
      "publisher_profiles_line_granularity_check",
      sql`${table.lineGranularity} = ANY (ARRAY['per_row'::text, 'grouped'::text])`,
    ),
    index("idx_publisher_profiles_media_type").on(table.mediaType),
    index("idx_publisher_profiles_active")
      .on(table.active)
      .where(sql`${table.active} = true`),
    index("idx_publisher_profiles_publisher_id").on(table.publisherId),
  ],
)
