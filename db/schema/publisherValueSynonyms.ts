/**
 * Learned publisher prose → AV canonical (migration 0060).
 * publisher_id NULL = global suggestion tier (never auto-applied).
 * AUTHOR ONLY — do not drizzle-kit migrate; Luke applies the SQL.
 */
import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { publishers } from "./ported"

export const publisherValueSynonyms = pgTable(
  "publisher_value_synonyms",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    publisherId: bigint("publisher_id", { mode: "number" }).references(
      () => publishers.id,
    ),
    mediaType: text("media_type").notNull(),
    vocabulary: text("vocabulary").notNull(),
    avField: text("av_field").notNull(),
    rawValue: text("raw_value").notNull(),
    rawValueDisplay: text("raw_value_display").notNull(),
    avCanonical: text("av_canonical").notNull(),
    learnedFromStageId: uuid("learned_from_stage_id"),
    createdBy: text("created_by").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    retiredAt: timestamp("retired_at", { withTimezone: true, mode: "string" }),
    retiredBy: text("retired_by"),
  },
  (table) => [
    uniqueIndex("uq_pvs_scope")
      .on(sql`coalesce(${table.publisherId}, 0)`, table.vocabulary, table.rawValue)
      .where(sql`${table.isActive} = true`),
    index("idx_pvs_lookup")
      .on(table.vocabulary, table.rawValue)
      .where(sql`${table.isActive} = true`),
  ],
)
