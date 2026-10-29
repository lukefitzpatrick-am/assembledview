/**
 * Feature switches (migration 0111). SQL is source of truth. Do not
 * db.select() these tables until migration_markers contains
 * 0111_feature_switches (C-76): reads go through lib/features/server.ts.
 * RLS on, server connection only.
 */
import { sql } from "drizzle-orm"
import { bigint, boolean, check, index, pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const featureSwitches = pgTable(
  "feature_switches",
  {
    key: text("key").primaryKey(),
    enabled: boolean("enabled").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    updatedBy: bigint("updated_by", { mode: "number" }),
    updatedByName: text("updated_by_name"),
    note: text("note"),
  },
  (table) => [
    check("feature_switches_key_check", sql`${table.key} ~ '^[a-z0-9_]{1,64}$'`),
    check("feature_switches_note_check", sql`${table.note} IS NULL OR length(${table.note}) <= 500`),
  ],
)

export const featureSwitchEvents = pgTable(
  "feature_switch_events",
  {
    id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    key: text("key").notNull(),
    fromEnabled: boolean("from_enabled"),
    toEnabled: boolean("to_enabled").notNull(),
    changedBy: bigint("changed_by", { mode: "number" }),
    changedByName: text("changed_by_name"),
    note: text("note"),
  },
  (table) => [
    check("feature_switch_events_key_check", sql`${table.key} ~ '^[a-z0-9_]{1,64}$'`),
    check("feature_switch_events_note_check", sql`${table.note} IS NULL OR length(${table.note}) <= 500`),
    index("idx_feature_switch_events_key_created").on(table.key, table.createdAt.desc()),
  ],
)
