/**
 * Codex v2 (migration 0013) — Postgres-native Tasks module.
 * No FKs to clients (ETL truncate-reload collision until T6).
 * CHECK constraints live in SQL only; columns are text + TS unions here.
 */
import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { publishers } from "./ported"

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
  | "publisher_domain"
  | "title_rule"
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
    publisherId: bigint("publisher_id", { mode: "number" }).references(
      () => publishers.id,
    ),
  },
  (table) => [
    index("idx_client_notes_client_id").on(table.clientId),
    uniqueIndex("idx_client_notes_fireflies_meeting_id").on(table.firefliesMeetingId),
    index("idx_client_notes_attributed_type").on(table.attributedType),
    index("idx_client_notes_publisher_id").on(table.publisherId),
    /**
     * 0116 (Codex search, F8; B37fix). The exact expression
     * lib/codex/searchRepo.ts queries (`CLIENT_NOTES_BODY_FTS_EXPRESSION` in
     * lib/codex/search.ts): JSON keys and `\n` `\r` `\t` escapes blanked.
     * Template literal: `\\s` is `\s` and `\\\\` is `\\` in the SQL.
     */
    index("idx_client_notes_body_fts").using(
      "gin",
      sql`to_tsvector('english'::regconfig, regexp_replace(coalesce(${table.body}, ''), '"(summary|action_items)"\\s*:|\\\\[nrt]', ' ', 'g'))`,
    ),
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
    autoCreated: boolean("auto_created").notNull().default(false),
    avaAutoKey: text("ava_auto_key"),
    estimatedMinutes: integer("estimated_minutes"),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    /** Help-request child → parent. NULL on ordinary tasks. */
    parentTaskId: bigint("parent_task_id", { mode: "number" }),
    helpRequestedByEmail: text("help_requested_by_email"),
    helpPriorStatus: text("help_prior_status"),
  },
  (table) => [
    index("idx_tasks_client_id_status").on(table.clientId, table.status),
    index("idx_tasks_assignee_email_due_date").on(table.assigneeEmail, table.dueDate),
    index("idx_tasks_source_note_id").on(table.sourceNoteId),
    index("idx_tasks_parent_task_id").on(table.parentTaskId),
    uniqueIndex("uq_tasks_ava_auto_key")
      .on(table.avaAutoKey)
      .where(sql`${table.avaAutoKey} IS NOT NULL`),
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
    foreignKey({
      columns: [table.parentTaskId],
      foreignColumns: [table.id],
      name: "tasks_parent_task_id_fkey",
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
    emailAliases: jsonb("email_aliases").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    auth0UserId: text("auth0_user_id").unique(),
    rosterSource: text("roster_source").default("manual"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "string" }),
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
    index("idx_ava_task_proposals_mba")
      .on(table.proposedMbaNumber)
      .where(sql`${table.proposedMbaNumber} IS NOT NULL`),
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

/**
 * Codex saved views (migration 0117, F8; plan section 10, exactly). A named
 * set of list or board filters. Owner renames and deletes; `shared` views are
 * readable by all staff. `filters` holds the /tasks query string as an object
 * (lib/codex/savedViews.ts). RLS on, no ava_readonly grant. Not selected until
 * the marker 0117_codex_saved_views exists (lib/codex/savedViewsRepo.ts).
 */
export const codexSavedViews = pgTable("codex_saved_views", {
  id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  name: text("name").notNull(),
  screen: text("screen").notNull(),
  lens: text("lens").notNull(),
  filters: jsonb("filters").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
  layout: text("layout"),
  groupBy: text("group_by"),
  shared: boolean("shared").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
})

/*
 * Codex S1 (migration 0118, B38; plan section 10 S1). Ten new tables, all
 * RLS on with no policies and no ava_readonly grant, no FK to clients (DI-12).
 * Read only once the marker 0118_codex_s1_projects exists
 * (lib/codex/projectsRepo.ts), so these mirrors deploy in any order.
 *
 * NOT mirrored here yet (C-210): the ten new tasks columns (project_id,
 * section_id, task_type, assigned_by_email, start_on, due_on, sort_order,
 * completed_at, custom_values, created_by_automation) and
 * task_comments.mentions. Drizzle lists every mirrored column in
 * db.select().from(tasks) and in inserts, so adding them before 0118 runs
 * would 500 every Codex read (C-76). The repo reads and writes them with raw
 * SQL behind the marker. Mirror them after 0118 is applied.
 */
export type CodexProjectKind = "campaign" | "retainer" | "onboarding" | "pitch" | "internal" | "ops"
export type CodexProjectStatus = "active" | "on_hold" | "closed"
export type CodexSectionStatusCategory = "todo" | "in_progress" | "waiting" | "done"
export type CodexTaskType = "task" | "subtask" | "help" | "milestone" | "approval"
export type CodexCustomFieldType = "single_select" | "multi_select" | "text" | "date"

export const codexProjects = pgTable(
  "codex_projects",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    kind: text("kind").$type<CodexProjectKind>().notNull(),
    clientId: bigint("client_id", { mode: "number" }),
    mbaNumber: text("mba_number"),
    name: text("name").notNull(),
    ownerEmail: text("owner_email"),
    isPrivate: boolean("is_private").notNull().default(false),
    /** The SEO-style linked progress field (codex_custom_fields, set null on delete). */
    progressFieldId: bigint("progress_field_id", { mode: "number" }),
    status: text("status").$type<CodexProjectStatus>().notNull().default("active"),
    startOn: date("start_on", { mode: "string" }),
    dueOn: date("due_on", { mode: "string" }),
    teamsChannelId: text("teams_channel_id"),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    uniqueIndex("uq_codex_projects_mba")
      .on(table.mbaNumber)
      .where(sql`${table.mbaNumber} IS NOT NULL AND ${table.deletedAt} IS NULL`),
    foreignKey({
      columns: [table.progressFieldId],
      foreignColumns: [codexCustomFields.id],
      name: "codex_projects_progress_field_id_fkey",
    }).onDelete("set null"),
  ],
)

export const codexProjectMembers = pgTable(
  "codex_project_members",
  {
    projectId: bigint("project_id", { mode: "number" })
      .notNull()
      .references(() => codexProjects.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.email] }),
    index("idx_codex_project_members_email").on(table.email),
  ],
)

export const codexSections = pgTable(
  "codex_sections",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    projectId: bigint("project_id", { mode: "number" })
      .notNull()
      .references(() => codexProjects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    collapsedDefault: boolean("collapsed_default").notNull().default(false),
    statusCategory: text("status_category").$type<CodexSectionStatusCategory>().notNull().default("todo"),
  },
  (table) => [index("idx_codex_sections_project_sort").on(table.projectId, table.sortOrder)],
)

export const codexCustomFields = pgTable(
  "codex_custom_fields",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    projectId: bigint("project_id", { mode: "number" }).references(() => codexProjects.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    fieldType: text("field_type").$type<CodexCustomFieldType>().notNull(),
    options: jsonb("options"),
    doneOption: text("done_option"),
  },
  (table) => [index("idx_codex_custom_fields_project").on(table.projectId)],
)

export const taskFollowers = pgTable(
  "task_followers",
  {
    taskId: bigint("task_id", { mode: "number" })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    reason: text("reason"),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.email] }),
    index("idx_task_followers_email").on(table.email),
  ],
)

export const taskAttachments = pgTable(
  "task_attachments",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    taskId: bigint("task_id", { mode: "number" })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"blob" | "link">().notNull(),
    name: text("name").notNull(),
    blobPathname: text("blob_pathname"),
    url: text("url"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    uploadedByEmail: text("uploaded_by_email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_task_attachments_task_id").on(table.taskId)],
)

export const codexBoardConfigs = pgTable(
  "codex_board_configs",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    scope: text("scope").notNull(),
    ownerEmail: text("owner_email"),
    groupBy: text("group_by").notNull(),
    swimlaneBy: text("swimlane_by"),
    cardFields: jsonb("card_fields").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    hideCompleted: boolean("hide_completed").notNull().default(true),
    wipLimits: jsonb("wip_limits").$type<Record<string, number>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_codex_board_configs_scope_owner").on(table.scope, table.ownerEmail)],
)

export const codexNotifications = pgTable(
  "codex_notifications",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    recipientEmail: text("recipient_email").notNull(),
    kind: text("kind").notNull(),
    taskId: bigint("task_id", { mode: "number" }).references(() => tasks.id, { onDelete: "cascade" }),
    actorEmail: text("actor_email"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true, mode: "string" }),
    teamsSentAt: timestamp("teams_sent_at", { withTimezone: true, mode: "string" }),
    emailDigestAt: timestamp("email_digest_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    index("idx_codex_notifications_recipient_read").on(table.recipientEmail, table.readAt),
    index("idx_codex_notifications_task_id").on(table.taskId),
  ],
)

export const codexNotificationPrefs = pgTable("codex_notification_prefs", {
  email: text("email").primaryKey(),
  prefs: jsonb("prefs").notNull().default(sql`'{}'::jsonb`),
  quietStart: time("quiet_start").default("18:00"),
  quietEnd: time("quiet_end").default("08:00"),
})

export const codexUserPrefs = pgTable("codex_user_prefs", {
  email: text("email").primaryKey(),
  defaultLens: text("default_lens").$type<"plan" | "flow">().notNull().default("plan"),
  calendarFeedTokenHash: text("calendar_feed_token_hash"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
})
