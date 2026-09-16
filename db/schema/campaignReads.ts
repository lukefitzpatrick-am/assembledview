/**
 * campaign_reads (migration 0079). SQL is source of truth; this mirror
 * is for generate/diff fidelity. RLS is on. Do not db.select() this table
 * against live Postgres before applying (C-76).
 */
import { sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core"

export const campaignReads = pgTable(
  "campaign_reads",
  {
    id: serial("id").primaryKey(),
    mbaNumber: text("mba_number").notNull(),
    versionNumber: integer("version_number").notNull(),
    status: text("status").notNull().default("draft"),
    beats: jsonb("beats")
      .$type<{
        planned: string
        happened: string
        vsPlan: string
        best: string
        worst: string
        upcoming: string
      }>()
      .notNull(),
    bodyMarkdown: text("body_markdown").notNull(),
    sources: jsonb("sources").$type<string[] | null>(),
    generatedAt: timestamp("generated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    generatedByEmail: text("generated_by_email").notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true, mode: "string" }),
    editedByEmail: text("edited_by_email"),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "string" }),
    publishedByEmail: text("published_by_email"),
  },
  (table) => [
    check(
      "campaign_reads_status_check",
      sql`${table.status} = ANY (ARRAY['draft'::text, 'published'::text])`,
    ),
    index("idx_campaign_reads_mba_version_status").on(
      table.mbaNumber,
      table.versionNumber,
      table.status,
    ),
    index("idx_campaign_reads_mba_generated").on(
      table.mbaNumber,
      table.generatedAt.desc(),
    ),
  ],
)
