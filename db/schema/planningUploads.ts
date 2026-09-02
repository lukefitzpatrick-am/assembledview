/**
 * planning_audience_uploads + planning_uploaded_audiences (migration 0058).
 * RLS on; no ava_readonly grant. Owner path only.
 * expires_at NULL means retained, not expired.
 */
import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"

export const planningAudienceUploads = pgTable(
  "planning_audience_uploads",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    clientsId: bigint("clients_id", { mode: "number" }),
    fileName: text("file_name").notNull(),
    blobUrl: text("blob_url"),
    byteSize: bigint("byte_size", { mode: "number" }),
    waveCode: text("wave_code"),
    surveyPeriod: text("survey_period"),
    filterLabel: text("filter_label"),
    parseJson: jsonb("parse_json").notNull(),
    uploadedByEmail: text("uploaded_by_email").notNull(),
    status: text("status").notNull().default("staged"),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }),
    retainedAt: timestamp("retained_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    index("idx_planning_audience_uploads_clients_id").on(table.clientsId),
    index("idx_planning_audience_uploads_expires_at")
      .on(table.expiresAt)
      .where(sql`${table.retainedAt} IS NULL AND ${table.expiresAt} IS NOT NULL`),
  ],
)

export const planningUploadedAudiences = pgTable(
  "planning_uploaded_audiences",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    uploadId: bigint("upload_id", { mode: "number" })
      .notNull()
      .references(() => planningAudienceUploads.id),
    clientsId: bigint("clients_id", { mode: "number" }),
    name: text("name").notNull(),
    sheetName: text("sheet_name").notNull(),
    blockId: text("block_id").notNull(),
    segmentKey: text("segment_key").notNull().unique(),
    waveCode: text("wave_code"),
    filterLabel: text("filter_label"),
    audienceWc: numeric("audience_wc"),
    unweightedN: integer("unweighted_n"),
    universeWc: numeric("universe_wc"),
    suppressedCells: integer("suppressed_cells"),
    mappingJson: jsonb("mapping_json").notNull(),
    channelsJson: jsonb("channels_json").notNull(),
    definitionJson: jsonb("definition_json").notNull(),
    createdByEmail: text("created_by_email").notNull(),
    isArchived: boolean("is_archived").notNull().default(false),
  },
  (table) => [
    index("idx_planning_uploaded_audiences_clients_id").on(table.clientsId),
    index("idx_planning_uploaded_audiences_upload_id").on(table.uploadId),
    index("idx_planning_uploaded_audiences_not_archived")
      .on(table.clientsId)
      .where(sql`${table.isArchived} = false`),
  ],
)
