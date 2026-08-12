/**
 * MyHours mirrored time + structure links (migration 0028+).
 * Mirror remains pull-SoR; Confirm path is the sole intentional MyHours entry write.
 */
import {
  bigint,
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
import { clientNotes } from "./codex"

export type TimeMappingSource = "name_match" | "manual" | "unmapped"
export type MyHoursLinkKind = "client_project" | "campaign_task"
export type TimeEntryProposalStatus =
  | "proposed"
  | "confirmed"
  | "skipped"
  | "blocked_overlap"
  | "blocked_structure"

export const timeEntries = pgTable(
  "time_entries",
  {
    id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    myhoursLogId: text("myhours_log_id").notNull(),
    memberEmail: text("member_email").notNull(),
    entryDate: date("entry_date").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    note: text("note"),
    myhoursProjectId: text("myhours_project_id"),
    myhoursProjectName: text("myhours_project_name"),
    myhoursTaskId: text("myhours_task_id"),
    myhoursTaskName: text("myhours_task_name"),
    clientId: bigint("client_id", { mode: "number" }),
    mbaNumber: text("mba_number"),
    mappingSource: text("mapping_source").notNull().default("unmapped"),
    raw: jsonb("raw"),
    syncedAt: timestamp("synced_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (table) => [
    uniqueIndex("time_entries_myhours_log_id_unique").on(table.myhoursLogId),
    index("idx_time_entries_member_email_entry_date").on(
      table.memberEmail,
      table.entryDate
    ),
    index("idx_time_entries_mba_number").on(table.mbaNumber),
    index("idx_time_entries_client_id").on(table.clientId),
  ]
)

export const myhoursLinks = pgTable(
  "myhours_links",
  {
    id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    kind: text("kind").notNull(),
    clientId: bigint("client_id", { mode: "number" }),
    mbaNumber: text("mba_number"),
    myhoursId: text("myhours_id").notNull(),
    myhoursName: text("myhours_name"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("myhours_links_kind_myhours_id_unique").on(
      table.kind,
      table.myhoursId
    ),
  ]
)

export const myhoursSyncRuns = pgTable("myhours_sync_runs", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true, mode: "string" }),
  entriesUpserted: integer("entries_upserted").notNull().default(0),
  structuresCreated: integer("structures_created").notNull().default(0),
  unmappedCount: integer("unmapped_count").notNull().default(0),
  unknownUserCount: integer("unknown_user_count").notNull().default(0),
  error: text("error"),
})

export const avaTimeEntryProposals = pgTable(
  "ava_time_entry_proposals",
  {
    id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    sourceNoteId: bigint("source_note_id", { mode: "number" }).notNull(),
    memberEmail: text("member_email").notNull(),
    entryDate: date("entry_date").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    note: text("note").notNull(),
    clientId: bigint("client_id", { mode: "number" }),
    mbaNumber: text("mba_number"),
    myhoursProjectId: text("myhours_project_id"),
    myhoursTaskId: text("myhours_task_id"),
    status: text("status").notNull().default("proposed"),
    blockReason: text("block_reason"),
    myhoursLogId: text("myhours_log_id"),
    confirmedByEmail: text("confirmed_by_email"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("ava_time_entry_proposals_note_member_unique").on(
      table.sourceNoteId,
      table.memberEmail
    ),
    uniqueIndex("ava_time_entry_proposals_log_id_unique").on(table.myhoursLogId),
    index("idx_ava_time_entry_proposals_week").on(table.entryDate, table.status),
    index("idx_ava_time_entry_proposals_member").on(
      table.memberEmail,
      table.entryDate
    ),
    foreignKey({
      columns: [table.sourceNoteId],
      foreignColumns: [clientNotes.id],
      name: "ava_time_entry_proposals_source_note_id_fkey",
    }).onDelete("cascade"),
  ]
)
