/**
 * ingest_stages — staged IngestReviewPackage (migration 0050).
 * RLS on; no ava_readonly grant. Owner path only.
 * expires_at NULL means retained, not expired.
 */
import { sql } from "drizzle-orm"
import {
  bigint,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

export const ingestStages = pgTable(
  "ingest_stages",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    stageId: uuid("stage_id").notNull().unique(),
    reviewPackage: jsonb("review_package").notNull(),
    fileName: text("file_name"),
    uploadedBy: text("uploaded_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }),
    retainedAt: timestamp("retained_at", { withTimezone: true, mode: "string" }),
    masterId: bigint("master_id", { mode: "number" }),
    acceptedVersionId: bigint("accepted_version_id", { mode: "number" }),
  },
  (table) => [
    index("idx_ingest_stages_expires_at")
      .on(table.expiresAt)
      .where(sql`${table.retainedAt} IS NULL AND ${table.expiresAt} IS NOT NULL`),
    index("idx_ingest_stages_master_id")
      .on(table.masterId)
      .where(sql`${table.masterId} IS NOT NULL`),
    index("idx_ingest_stages_accepted_version_id")
      .on(table.acceptedVersionId)
      .where(sql`${table.acceptedVersionId} IS NOT NULL`),
  ],
)
