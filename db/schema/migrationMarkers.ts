/**
 * Migration markers — guards one-shot backfills so re-running SQL migrations
 * cannot silently republish drafts (see 0018 / 0018a).
 */
import { pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const migrationMarkers = pgTable("migration_markers", {
  key: text("key").primaryKey(),
  appliedAt: timestamp("applied_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  note: text("note"),
})
