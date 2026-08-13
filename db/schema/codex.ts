/**
 * Codex v2 (migration 0013) — Postgres-native Tasks module.
 * No FKs to clients (ETL truncate-reload collision until T6).
 * CHECK constraints live in SQL only; columns are text + TS unions here.
 */
import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

export type CodexTaskStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "waiting"
  | "done"
export type CodexTaskPriority = "low" | "normal" | "high"
export type CodexTaskSource = "manual" | "ava" | "template" | "recurring"
export type CodexAuthorKind = "user" | "ava"
export type CodexNoteMatchedBy =
  | "domain"
  | "keyword"
  | "manual"
  | "title"
  | "internal"
export type CodexAttributedType =
  | "client"
  | "publisher"
  | "internal"
  | "new_business"
export type CodexProposalStatus =
  | "proposed"
  | "accepted"
  | "accepted_edited"
  | "rejected"
  | "expired"
export type CodexRuleSource = "manual" | "learned"
export type CodexActorKind = "user" | "ava" | "system"
export type CodexSyncStatus = "running" | "ok" | "error"

export const clientDomains = pgTable(
  "client_domains",
  {
    id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    clientId: bigint("client_id", { mode: "number" }),
    emailDomain: text("email_domain"),
  },
  (table) => [
    index("idx_client_domains_client_id").on(table.clientId),
    index("idx_client_domains_email_domain").on(table.emailDomain),
  ],
)

export const clientNotes = pgTable(
  "client_notes",
  {
    id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    clientId: bigint("client_id", { mode: "number" }),
    mbaNumber: text("mba_number"),
    source: text("source"),
    title: text("title"),
    body: text("body"),
    meetingDate: timestamp("meeting_date", { withTimezone: true, mode: "string" }),
    firefliesMeetingId: text("fireflies_meeting_id"),
    participants: text("participants"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    organizerEmail: text("organizer_email"),
    matchedBy: text("matched_by"),
    /** Fireflies duration (minutes) converted to seconds. */
    durationSeconds: integer("duration_seconds"),
    transcriptUrl: text("transcript_url"),
    /** All attendee domains Assembled — kept with client_id NULL. */
    isInternal: boolean("is_internal").notNull().default(false),
    /** NULL is the unattributed queue. */
    attributedType: text("attributed_type").$type<CodexAttributedType | null>(),
    publisherId: bigint("publisher_id", { mode: "number" }),
  },
  (table) => [
    index("idx_client_notes_client_id").on(table.clientId),
    uniqueIndex("idx_client_notes_fireflies_meeting_id").on(table.firefliesMeetingId),
    index("idx_client_notes_attributed_type").on(table.attributedType),
    index("idx_client_notes_publisher_id").on(table.publisherId),
  ],
)

export const taskTemplates = pgTable("task_templates", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  name: text("name"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
})

export const taskTemplateItems = pgTable(
  "task_template_items",
  {
    id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    templateId: bigint("template_id", { mode: "number" }),
    label: text("label"),
    sort: bigint("sort", { mode: "number" }),
  },
  (table) => [
    index("idx_task_template_items_template_id").on(table.templateId),
    foreignKey({
      columns: [table.templateId],
      foreignColumns: [taskTemplates.id],
      name: "fk_task_template_items_template",
    }).onDelete("cascade"),
  ],
)

export const tasks = pgTable(
  "tasks",
  {
    id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    clientId: bigint("client_id", { mode: "number" }),
    mbaNumber: text("mba_number"),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("todo"),
    priority: text("priority").default("normal"),
    assigneeEmail: text("assignee_email"),
    assigneeName: text("assignee_name"),
    dueDate: timestamp("due_date", { withTimezone: true, mode: "string" }),
    recurringRule: text("recurring_rule"),
    templateId: bigint("template_id", { mode: "number" }),
    clientVisible: boolean("client_visible"),
    createdByEmail: text("created_by_email"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }),
    source: text("source").notNull().default("manual"),
    sourceNoteId: bigint("source_note_id", { mode: "number" }),
    category: text("category"),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    index("idx_tasks_client_id_status").on(table.clientId, table.status),
    index("idx_tasks_assignee_email_due_date").on(table.assigneeEmail, table.dueDate),
    index("idx_tasks_source_note_id").on(table.sourceNoteId),
    foreignKey({
      columns: [table.templateId],
      foreignColumns: [taskTemplates.id],
      name: "fk_tasks_template",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.sourceNoteId],
      foreignColumns: [clientNotes.id],
      name: "tasks_source_note_id_fkey",
    }).onDelete("set null"),
  ],
)

export const taskChecklistItems = pgTable(
  "task_checklist_items",
  {
    id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    taskId: bigint("task_id", { mode: "number" }),
    label: text("label"),
    done: boolean("done"),
    sort: bigint("sort", { mode: "number" }),
  },
  (table) => [
    index("idx_task_checklist_items_task_id").on(table.taskId),
    foreignKey({
      columns: [table.taskId],
      foreignColumns: [tasks.id],
      name: "fk_task_checklist_items_task",
    }).onDelete("cascade"),
  ],
)

export const taskComments = pgTable(
  "task_comments",
  {
    id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    taskId: bigint("task_id", { mode: "number" }),
    body: text("body"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    authorEmail: text("author_email"),
    authorName: text("author_name"),
    authorKind: text("author_kind").notNull().default("user"),
  },
  (table) => [
    index("idx_task_comments_task_id").on(table.taskId),
    foreignKey({
      columns: [table.taskId],
      foreignColumns: [tasks.id],
      name: "fk_task_comments_task",
    }).onDelete("cascade"),
  ],
)

export const teamMembers = pgTable(
  "team_members",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    roleTitle: text("role_title"),
    active: boolean("active").notNull().default(true),
    capacityNotes: text("capacity_notes"),
    workingStyle: text("working_style"),
    defaultClientIds: bigint("default_client_ids", { mode: "number" })
      .array()
      .notNull()
      .default(sql`'{}'::bigint[]`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
)

export const avaTaskProposals = pgTable(
  "ava_task_proposals",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    sourceNoteId: bigint("source_note_id", { mode: "number" }),
    clientId: bigint("client_id", { mode: "number" }),
    proposedTitle: text("proposed_title").notNull(),
    proposedDescription: text("proposed_description"),
    proposedCategory: text("proposed_category"),
    proposedDueDate: timestamp("proposed_due_date", {
      withTimezone: true,
      mode: "string",
    }),
    proposedAssigneeEmail: text("proposed_assignee_email"),
    proposedMbaNumber: text("proposed_mba_number"),
    avaConfidence: numeric("ava_confidence", { precision: 4, scale: 3 }),
    avaRationale: text("ava_rationale"),
    status: text("status").notNull().default("proposed"),
    decidedByEmail: text("decided_by_email"),
    decidedAt: timestamp("decided_at", { withTimezone: true, mode: "string" }),
    createdTaskId: bigint("created_task_id", { mode: "number" }),
    decisionDiff: jsonb("decision_diff"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_ava_task_proposals_status_created").on(table.status, table.createdAt),
    index("idx_ava_task_proposals_client").on(table.clientId),
    foreignKey({
      columns: [table.sourceNoteId],
      foreignColumns: [clientNotes.id],
      name: "ava_task_proposals_source_note_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.createdTaskId],
      foreignColumns: [tasks.id],
      name: "ava_task_proposals_created_task_id_fkey",
    }).onDelete("set null"),
  ],
)

export const assignmentRules = pgTable(
  "assignment_rules",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    clientId: bigint("client_id", { mode: "number" }),
    category: text("category").notNull(),
    assigneeEmail: text("assignee_email").notNull(),
    source: text("source").notNull().default("manual"),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_assignment_rules_scope")
      .on(sql`COALESCE(${table.clientId}, 0)`, table.category)
      .where(sql`${table.active}`),
  ],
)

export const codexActivity = pgTable(
  "codex_activity",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: bigint("entity_id", { mode: "number" }).notNull(),
    actorEmail: text("actor_email"),
    actorKind: text("actor_kind").notNull().default("user"),
    action: text("action").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_codex_activity_entity").on(
      table.entityType,
      table.entityId,
      table.createdAt
    ),
  ],
)

export const firefliesSyncState = pgTable("fireflies_sync_state", {
  id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
  runStartedAt: timestamp("run_started_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  runFinishedAt: timestamp("run_finished_at", { withTimezone: true, mode: "string" }),
  cursorFrom: timestamp("cursor_from", { withTimezone: true, mode: "string" }),
  meetingsSeen: integer("meetings_seen").notNull().default(0),
  notesCreated: integer("notes_created").notNull().default(0),
  notesSkipped: integer("notes_skipped").notNull().default(0),
  unmatched: integer("unmatched").notNull().default(0),
  status: text("status").notNull().default("running"),
  error: text("error"),
})
