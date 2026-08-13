import "server-only"

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  max,
  ne,
  or,
  type SQL,
} from "drizzle-orm"
import { db, schema, type Db } from "@/db"
import type { CodexActorKind } from "@/db/schema/codex"
import { clampPage, clampPerPage, parseStatusFilter } from "@/lib/codex/queryHelpers"
import { sydneyCivilParts } from "@/lib/codex/quickAddParse"
import {
  descriptionHasPeriod,
  descriptionWithPeriod,
  formatPeriodMarker,
  normaliseRecurringRule,
} from "@/lib/codex/recurringRule"
import type {
  ChecklistItem,
  CodexActivity,
  CodexPagedResponse,
  CodexTask,
  TaskComment,
  TaskTemplate,
  TaskTemplateItem,
  TeamMember,
} from "@/lib/codex/types"

export { clampPerPage, parseStatusFilter } from "@/lib/codex/queryHelpers"

const {
  tasks,
  clientNotes,
  teamMembers,
  codexActivity,
  taskChecklistItems,
  taskComments,
  taskTemplates,
  taskTemplateItems,
} = schema

/** Root `db` or a `db.transaction` callback handle — both share the query API. */
type DbExecutor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0]

export type TaskSort = "due_date_asc" | "due_date_desc" | "created_at_desc"

export type ListTasksFilters = {
  clientId?: number
  /** Exact assignee match (All-tasks filter). Null assignees excluded. */
  assigneeEmail?: string
  /**
   * My-tasks scope: assignee_email = email OR created_by_email = email.
   * Includes unassigned tasks created by this user.
   */
  mineForEmail?: string
  status?: string[]
  mbaNumber?: string
  dueBefore?: string
  dueAfter?: string
  category?: string
  source?: string
  includeDeleted?: boolean
  sort?: TaskSort
  page?: number
  perPage?: number
}

export type CreateTaskInput = {
  title: string
  clientId: number
  description?: string | null
  status?: string | null
  priority?: string | null
  assigneeEmail?: string | null
  assigneeName?: string | null
  dueDate?: string | null
  mbaNumber?: string | null
  category?: string | null
  clientVisible?: boolean | null
  source?: string | null
  /** When set, checklist items are copied from the template in the same txn. */
  templateId?: number | null
  /** Seed series rule — see `lib/codex/recurringRule.ts`. */
  recurringRule?: string | null
  /** C-39 — campaign seed / system writers pass `"system"`. Default `"user"`. */
  actorKind?: CodexActorKind
  /** Fireflies / AVA proposal link back to client_notes. */
  sourceNoteId?: number | null
  createdByEmail: string
}

export type UpdateTaskInput = {
  title?: string
  description?: string | null
  status?: string
  priority?: string | null
  assigneeEmail?: string | null
  assigneeName?: string | null
  dueDate?: string | null
  mbaNumber?: string | null
  category?: string | null
  clientVisible?: boolean | null
  /** App-level exists-check required at the route when set (no DB FK until T6). */
  clientId?: number
  templateId?: number | null
  recurringRule?: string | null
}

export type CreateTemplateInput = {
  name: string
  description?: string | null
}

export type UpdateTemplateInput = {
  name?: string
  description?: string | null
}

export type CreateTemplateItemInput = {
  label: string
}

export type UpdateTemplateItemInput = {
  label?: string
}

export type ListClientNotesFilters = {
  clientId?: number
  mbaNumber?: string
  meetingBefore?: string
  meetingAfter?: string
  page?: number
  perPage?: number
}

/** @deprecated use TeamMember from lib/codex/types — kept for import compat */
export type TeamMemberRow = TeamMember

export type CreateTeamMemberInput = {
  email: string
  name: string
  roleTitle?: string | null
  active?: boolean
  capacityNotes?: string | null
  workingStyle?: string | null
  defaultClientIds?: number[]
}

export type UpdateTeamMemberInput = {
  name?: string
  roleTitle?: string | null
  active?: boolean
  capacityNotes?: string | null
  workingStyle?: string | null
  defaultClientIds?: number[]
  email?: string
}

export type CreateChecklistItemInput = {
  label: string
  done?: boolean
}

export type UpdateChecklistItemInput = {
  label?: string
  done?: boolean
}

export type CreateCommentInput = {
  body: string
  authorEmail: string | null
  authorName?: string | null
  /** Default `user`. AVA comments (Stage 4) pass `ava` — do not invent that path here. */
  authorKind?: "user" | "ava"
}

function pagedEnvelope<T>(
  items: T[],
  itemsTotal: number,
  page: number,
  perPage: number
): CodexPagedResponse<T> {
  const pageTotal = Math.max(1, Math.ceil(itemsTotal / perPage) || 1)
  return {
    items,
    itemsTotal,
    curPage: page,
    pageTotal,
    nextPage: page < pageTotal ? page + 1 : null,
    prevPage: page > 1 ? page - 1 : null,
  }
}

function taskRowToApi(row: typeof tasks.$inferSelect): CodexTask {
  return {
    id: row.id,
    title: row.title,
    client_id: Number(row.clientId ?? 0),
    status: row.status,
    priority: row.priority,
    assignee_email: row.assigneeEmail,
    assignee_name: row.assigneeName,
    due_date: row.dueDate,
    mba_number: row.mbaNumber,
    description: row.description,
    client_visible: row.clientVisible,
    created_by: row.createdByEmail,
    created_by_email: row.createdByEmail,
    category: row.category,
    source: row.source,
    recurring_rule: row.recurringRule ?? null,
    template_id: row.templateId ?? null,
    deleted_at: row.deletedAt,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}

function templateRowToApi(row: typeof taskTemplates.$inferSelect): TaskTemplate {
  return {
    id: row.id,
    name: row.name ?? "",
    description: row.description ?? null,
    created_at: row.createdAt,
  }
}

function templateItemRowToApi(
  row: typeof taskTemplateItems.$inferSelect
): TaskTemplateItem {
  return {
    id: row.id,
    template_id: Number(row.templateId ?? 0),
    label: row.label ?? "",
    sort: Number(row.sort ?? 0),
  }
}

async function copyTemplateItemsToTask(
  tx: DbExecutor,
  taskId: number,
  templateId: number,
  actorEmail: string | null
): Promise<void> {
  const items = await tx
    .select()
    .from(taskTemplateItems)
    .where(eq(taskTemplateItems.templateId, templateId))
    .orderBy(asc(taskTemplateItems.sort), asc(taskTemplateItems.id))

  for (const item of items) {
    const label = (item.label ?? "").trim()
    if (!label) continue
    const [row] = await tx
      .insert(taskChecklistItems)
      .values({
        taskId,
        label,
        done: false,
        sort: Number(item.sort ?? 0),
      })
      .returning()
    await appendActivity(tx, {
      entityType: "checklist_item",
      entityId: row.id,
      actorEmail: actorEmail?.toLowerCase() ?? null,
      action: "create",
      after: checklistRowToApi(row),
    })
  }
}

async function appendActivity(
  database: DbExecutor,
  args: {
    entityType: string
    entityId: number
    actorEmail: string | null
    action: string
    before?: unknown
    after?: unknown
    /** C-39 — was hardcoded `"user"`; Stage 4 AVA writes pass `"ava"`. */
    actorKind?: CodexActorKind
  }
): Promise<void> {
  await database.insert(codexActivity).values({
    entityType: args.entityType,
    entityId: args.entityId,
    actorEmail: args.actorEmail,
    actorKind: args.actorKind ?? "user",
    action: args.action,
    before: args.before ?? null,
    after: args.after ?? null,
  })
}

/** Live (non–soft-deleted) task row, or null. Used before touching child rows. */
async function getLiveTaskRow(
  database: DbExecutor,
  taskId: number
): Promise<typeof tasks.$inferSelect | null> {
  const [row] = await database
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt)))
    .limit(1)
  return row ?? null
}

function checklistRowToApi(
  row: typeof taskChecklistItems.$inferSelect
): ChecklistItem {
  return {
    id: Number(row.id),
    task_id: Number(row.taskId ?? 0),
    label: row.label ?? "",
    done: Boolean(row.done),
    sort: Number(row.sort ?? 0),
  }
}

function commentRowToApi(row: typeof taskComments.$inferSelect): TaskComment {
  const kind = row.authorKind === "ava" ? "ava" : "user"
  return {
    id: Number(row.id),
    task_id: Number(row.taskId ?? 0),
    body: row.body ?? "",
    created_at: row.createdAt,
    author_email: row.authorEmail,
    author_name: row.authorName,
    author_kind: kind,
  }
}

export async function listTasks(
  filters: ListTasksFilters = {},
  database: Db = db
): Promise<CodexPagedResponse<CodexTask>> {
  const page = clampPage(filters.page)
  const perPage = clampPerPage(filters.perPage)
  const offset = (page - 1) * perPage

  const conds: SQL[] = []
  if (!filters.includeDeleted) conds.push(isNull(tasks.deletedAt))
  if (filters.clientId != null) conds.push(eq(tasks.clientId, filters.clientId))
  if (filters.mineForEmail) {
    const email = filters.mineForEmail.trim().toLowerCase()
    const mineScope = or(
      eq(tasks.assigneeEmail, email),
      eq(tasks.createdByEmail, email)
    )
    if (mineScope) conds.push(mineScope)
  } else if (filters.assigneeEmail) {
    conds.push(eq(tasks.assigneeEmail, filters.assigneeEmail.trim().toLowerCase()))
  }
  if (filters.status?.length) conds.push(inArray(tasks.status, filters.status))
  if (filters.mbaNumber) conds.push(eq(tasks.mbaNumber, filters.mbaNumber))
  if (filters.dueBefore) conds.push(lte(tasks.dueDate, filters.dueBefore))
  if (filters.dueAfter) conds.push(gte(tasks.dueDate, filters.dueAfter))
  if (filters.category) conds.push(eq(tasks.category, filters.category))
  if (filters.source) conds.push(eq(tasks.source, filters.source))

  const where = conds.length > 0 ? and(...conds) : undefined

  const sort = filters.sort ?? "due_date_asc"
  const orderBy =
    sort === "due_date_desc"
      ? desc(tasks.dueDate)
      : sort === "created_at_desc"
        ? desc(tasks.createdAt)
        : asc(tasks.dueDate)

  const [totalRow] = await database
    .select({ c: count() })
    .from(tasks)
    .where(where)
  const itemsTotal = Number(totalRow?.c ?? 0)

  const rows = await database
    .select()
    .from(tasks)
    .where(where)
    .orderBy(orderBy, desc(tasks.id))
    .limit(perPage)
    .offset(offset)

  const apiTasks = rows.map(taskRowToApi)
  const ids = apiTasks.map((t) => Number(t.id)).filter((id) => Number.isFinite(id) && id > 0)
  if (ids.length === 0) {
    return pagedEnvelope(apiTasks, itemsTotal, page, perPage)
  }

  const checkRows = await database
    .select({
      taskId: taskChecklistItems.taskId,
      done: taskChecklistItems.done,
    })
    .from(taskChecklistItems)
    .where(inArray(taskChecklistItems.taskId, ids))

  const progress = new Map<number, { done: number; total: number }>()
  for (const row of checkRows) {
    const tid = Number(row.taskId ?? 0)
    if (!tid) continue
    const cur = progress.get(tid) ?? { done: 0, total: 0 }
    cur.total += 1
    if (row.done) cur.done += 1
    progress.set(tid, cur)
  }

  const withProgress = apiTasks.map((t) => {
    const p = progress.get(Number(t.id))
    return {
      ...t,
      checklist_done: p?.done ?? 0,
      checklist_total: p?.total ?? 0,
    }
  })

  return pagedEnvelope(withProgress, itemsTotal, page, perPage)
}

export type MbaTaskCounts = {
  mba_number: string
  /** Live tasks with status ≠ done. */
  open: number
  /** Open tasks with due_date before Sydney civil today. */
  overdue: number
}

/**
 * Open + overdue counts per MBA for campaign badges.
 * Soft-deleted rows excluded. Overdue uses Australia/Sydney civil date.
 * Returns a row for every requested MBA (zeros when none).
 */
export async function countTasksByMba(
  mbaNumbers: string[],
  database: Db = db,
  now: Date = new Date()
): Promise<MbaTaskCounts[]> {
  const unique: string[] = []
  const seen = new Set<string>()
  for (const raw of mbaNumbers) {
    const m = raw.trim()
    if (!m || seen.has(m)) continue
    seen.add(m)
    unique.push(m)
  }
  if (unique.length === 0) return []

  const sydneyToday = sydneyCivilParts(now).ymd

  const rows = await database
    .select({
      mbaNumber: tasks.mbaNumber,
      open: count(),
    })
    .from(tasks)
    .where(
      and(
        isNull(tasks.deletedAt),
        inArray(tasks.mbaNumber, unique),
        ne(tasks.status, "done")
      )
    )
    .groupBy(tasks.mbaNumber)

  const overdueRows = await database
    .select({
      mbaNumber: tasks.mbaNumber,
      overdue: count(),
    })
    .from(tasks)
    .where(
      and(
        isNull(tasks.deletedAt),
        inArray(tasks.mbaNumber, unique),
        ne(tasks.status, "done"),
        isNotNull(tasks.dueDate),
        lt(tasks.dueDate, sydneyToday)
      )
    )
    .groupBy(tasks.mbaNumber)

  const openBy = new Map<string, number>()
  for (const r of rows) {
    if (r.mbaNumber) openBy.set(r.mbaNumber, Number(r.open ?? 0))
  }
  const overdueBy = new Map<string, number>()
  for (const r of overdueRows) {
    if (r.mbaNumber) overdueBy.set(r.mbaNumber, Number(r.overdue ?? 0))
  }

  return unique.map((mba) => ({
    mba_number: mba,
    open: openBy.get(mba) ?? 0,
    overdue: overdueBy.get(mba) ?? 0,
  }))
}

export async function getTask(
  id: number,
  database: Db = db
): Promise<CodexTask | null> {
  const [row] = await database.select().from(tasks).where(eq(tasks.id, id)).limit(1)
  if (!row || row.deletedAt) return null
  return taskRowToApi(row)
}

/**
 * Activity for a task entity (entity_type = 'task'), newest first.
 * Checklist/comment activity is keyed by child entity ids — detail UI may
 * also load those separately later; Stage 1 panel reads task-scoped rows.
 */
export async function listTaskActivity(
  taskId: number,
  database: Db = db
): Promise<CodexActivity[]> {
  const rows = await database
    .select()
    .from(codexActivity)
    .where(
      and(
        eq(codexActivity.entityType, "task"),
        eq(codexActivity.entityId, taskId)
      )
    )
    .orderBy(desc(codexActivity.createdAt), desc(codexActivity.id))
  return rows.map((r) => ({
    id: Number(r.id),
    entity_type: r.entityType,
    entity_id: Number(r.entityId),
    actor_email: r.actorEmail,
    actor_kind: r.actorKind,
    action: r.action,
    before: r.before,
    after: r.after,
    created_at: r.createdAt,
  }))
}

export async function createTask(
  input: CreateTaskInput,
  actorEmail: string | null = input.createdByEmail,
  database: Db = db
): Promise<CodexTask> {
  const recurringRule = normaliseRecurringRule(input.recurringRule ?? null)
  if (input.recurringRule != null && input.recurringRule.trim() !== "" && !recurringRule) {
    throw new Error("Invalid recurring_rule")
  }
  const templateId =
    input.templateId != null && Number.isFinite(input.templateId) && input.templateId > 0
      ? input.templateId
      : null

  return database.transaction(async (tx) => {
    if (templateId != null) {
      const [tpl] = await tx
        .select({ id: taskTemplates.id })
        .from(taskTemplates)
        .where(eq(taskTemplates.id, templateId))
        .limit(1)
      if (!tpl) throw new Error(`template_id ${templateId} does not exist`)
    }

    const now = new Date().toISOString()
    const source =
      input.source?.trim() ||
      (templateId != null ? "template" : "manual")

    const [row] = await tx
      .insert(tasks)
      .values({
        title: input.title,
        clientId: input.clientId,
        description: input.description ?? null,
        status: input.status?.trim() || "todo",
        priority: input.priority ?? "normal",
        assigneeEmail: input.assigneeEmail?.trim().toLowerCase() || null,
        assigneeName: input.assigneeName ?? null,
        dueDate: input.dueDate ?? null,
        mbaNumber: input.mbaNumber ?? null,
        category: input.category ?? null,
        clientVisible: input.clientVisible ?? false,
        source,
        templateId,
        recurringRule,
        sourceNoteId:
          input.sourceNoteId != null && Number.isFinite(input.sourceNoteId)
            ? input.sourceNoteId
            : null,
        createdByEmail: input.createdByEmail.trim().toLowerCase(),
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    if (templateId != null) {
      await copyTemplateItemsToTask(tx, row.id, templateId, actorEmail)
    }

    await appendActivity(tx, {
      entityType: "task",
      entityId: row.id,
      actorEmail: actorEmail?.toLowerCase() ?? null,
      actorKind: input.actorKind ?? "user",
      action: "create",
      after: taskRowToApi(row),
    })
    return taskRowToApi(row)
  })
}

export async function updateTask(
  id: number,
  patch: UpdateTaskInput,
  actorEmail: string | null,
  database: Db = db
): Promise<CodexTask | null> {
  if (patch.recurringRule !== undefined && patch.recurringRule != null && patch.recurringRule.trim() !== "") {
    if (!normaliseRecurringRule(patch.recurringRule)) {
      throw new Error("Invalid recurring_rule")
    }
  }

  return database.transaction(async (tx) => {
    const [before] = await tx.select().from(tasks).where(eq(tasks.id, id)).limit(1)
    if (!before || before.deletedAt) return null

    if (patch.templateId !== undefined && patch.templateId != null) {
      const [tpl] = await tx
        .select({ id: taskTemplates.id })
        .from(taskTemplates)
        .where(eq(taskTemplates.id, patch.templateId))
        .limit(1)
      if (!tpl) throw new Error(`template_id ${patch.templateId} does not exist`)
    }

    const values: Partial<typeof tasks.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    }
    if (patch.title !== undefined) values.title = patch.title
    if (patch.description !== undefined) values.description = patch.description
    if (patch.status !== undefined) values.status = patch.status
    if (patch.priority !== undefined) values.priority = patch.priority
    if (patch.assigneeEmail !== undefined) {
      values.assigneeEmail = patch.assigneeEmail?.trim().toLowerCase() || null
    }
    if (patch.assigneeName !== undefined) values.assigneeName = patch.assigneeName
    if (patch.dueDate !== undefined) values.dueDate = patch.dueDate
    if (patch.mbaNumber !== undefined) values.mbaNumber = patch.mbaNumber
    if (patch.category !== undefined) values.category = patch.category
    if (patch.clientVisible !== undefined) values.clientVisible = patch.clientVisible
    if (patch.clientId !== undefined) values.clientId = patch.clientId
    if (patch.templateId !== undefined) values.templateId = patch.templateId
    if (patch.recurringRule !== undefined) {
      values.recurringRule =
        patch.recurringRule == null || patch.recurringRule.trim() === ""
          ? null
          : normaliseRecurringRule(patch.recurringRule)
    }

    const [row] = await tx
      .update(tasks)
      .set(values)
      .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
      .returning()
    if (!row) return null

    await appendActivity(tx, {
      entityType: "task",
      entityId: id,
      actorEmail: actorEmail?.toLowerCase() ?? null,
      action: "update",
      before: taskRowToApi(before),
      after: taskRowToApi(row),
    })
    return taskRowToApi(row)
  })
}

export async function softDeleteTask(
  id: number,
  actorEmail: string | null,
  database: Db = db
): Promise<boolean> {
  return database.transaction(async (tx) => {
    const [before] = await tx.select().from(tasks).where(eq(tasks.id, id)).limit(1)
    if (!before || before.deletedAt) return false

    const deletedAt = new Date().toISOString()
    const [row] = await tx
      .update(tasks)
      .set({ deletedAt, updatedAt: deletedAt })
      .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
      .returning()
    if (!row) return false

    await appendActivity(tx, {
      entityType: "task",
      entityId: id,
      actorEmail: actorEmail?.toLowerCase() ?? null,
      action: "soft_delete",
      before: taskRowToApi(before),
      after: { ...taskRowToApi(row), deleted_at: deletedAt },
    })
    return true
  })
}

export async function listClientNotes(
  filters: ListClientNotesFilters = {},
  database: Db = db
): Promise<CodexPagedResponse<Record<string, unknown>>> {
  const page = clampPage(filters.page)
  const perPage = clampPerPage(filters.perPage)
  const offset = (page - 1) * perPage

  const conds: SQL[] = []
  if (filters.clientId != null) conds.push(eq(clientNotes.clientId, filters.clientId))
  if (filters.mbaNumber) conds.push(eq(clientNotes.mbaNumber, filters.mbaNumber))
  if (filters.meetingBefore) {
    conds.push(lte(clientNotes.meetingDate, filters.meetingBefore))
  }
  if (filters.meetingAfter) {
    conds.push(gte(clientNotes.meetingDate, filters.meetingAfter))
  }
  const where = conds.length > 0 ? and(...conds) : undefined

  const [totalRow] = await database
    .select({ c: count() })
    .from(clientNotes)
    .where(where)
  const itemsTotal = Number(totalRow?.c ?? 0)

  const rows = await database
    .select()
    .from(clientNotes)
    .where(where)
    .orderBy(desc(clientNotes.meetingDate), desc(clientNotes.id))
    .limit(perPage)
    .offset(offset)

  const items = rows.map((r) => ({
    id: r.id,
    client_id: r.clientId,
    mba_number: r.mbaNumber,
    source: r.source,
    title: r.title,
    body: r.body,
    meeting_date: r.meetingDate,
    fireflies_meeting_id: r.firefliesMeetingId,
    participants: r.participants,
    created_at: r.createdAt,
    organizer_email: r.organizerEmail,
    matched_by: r.matchedBy,
    duration_seconds: r.durationSeconds,
    transcript_url: r.transcriptUrl,
    is_internal: r.isInternal,
  }))

  return pagedEnvelope(items, itemsTotal, page, perPage)
}

function teamRowToApi(row: typeof teamMembers.$inferSelect): TeamMember {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role_title: row.roleTitle,
    active: row.active,
    capacity_notes: row.capacityNotes,
    working_style: row.workingStyle,
    default_client_ids: (row.defaultClientIds ?? []).map(Number),
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    email_aliases: Array.isArray(row.emailAliases) ? row.emailAliases : [],
    auth0_user_id: row.auth0UserId ?? null,
    roster_source: row.rosterSource ?? "manual",
    last_login_at: row.lastLoginAt ?? null,
  }
}

export async function listTeamMembers(
  opts: { activeOnly?: boolean; page?: number; perPage?: number } = {},
  database: Db = db
): Promise<CodexPagedResponse<TeamMember>> {
  const page = clampPage(opts.page)
  const perPage = clampPerPage(opts.perPage)
  const offset = (page - 1) * perPage
  const where = opts.activeOnly ? eq(teamMembers.active, true) : undefined

  const [totalRow] = await database
    .select({ c: count() })
    .from(teamMembers)
    .where(where)
  const itemsTotal = Number(totalRow?.c ?? 0)

  const rows = await database
    .select()
    .from(teamMembers)
    .where(where)
    .orderBy(asc(teamMembers.name), asc(teamMembers.id))
    .limit(perPage)
    .offset(offset)

  return pagedEnvelope(rows.map(teamRowToApi), itemsTotal, page, perPage)
}

/** Report-only roster rows for Auth0 never-logged-in (Team tab). */
export async function listRosterLoginRows(
  database: Db = db
): Promise<Array<{ email: string; active: boolean }>> {
  const rows = await database
    .select({
      email: teamMembers.email,
      active: teamMembers.active,
    })
    .from(teamMembers)
  return rows.map((r) => ({
    email: r.email,
    active: r.active,
  }))
}

export async function createTeamMember(
  input: CreateTeamMemberInput,
  actorEmail: string | null,
  database: Db = db
): Promise<TeamMember> {
  return database.transaction(async (tx) => {
    const now = new Date().toISOString()
    const email = input.email.trim().toLowerCase()
    const [row] = await tx
      .insert(teamMembers)
      .values({
        email,
        name: input.name.trim(),
        roleTitle: input.roleTitle ?? null,
        active: input.active ?? true,
        capacityNotes: input.capacityNotes ?? null,
        workingStyle: input.workingStyle ?? null,
        defaultClientIds: input.defaultClientIds ?? [],
        rosterSource: "manual",
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    await appendActivity(tx, {
      entityType: "team_member",
      entityId: row.id,
      actorEmail: actorEmail?.toLowerCase() ?? null,
      action: "create",
      after: teamRowToApi(row),
    })
    return teamRowToApi(row)
  })
}

export async function updateTeamMember(
  id: number,
  patch: UpdateTeamMemberInput,
  actorEmail: string | null,
  database: Db = db
): Promise<TeamMember | null> {
  return database.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.id, id))
      .limit(1)
    if (!before) return null

    const values: Partial<typeof teamMembers.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    }
    if (patch.email !== undefined) values.email = patch.email.trim().toLowerCase()
    if (patch.name !== undefined) values.name = patch.name.trim()
    if (patch.roleTitle !== undefined) values.roleTitle = patch.roleTitle
    if (patch.active !== undefined) values.active = patch.active
    if (patch.capacityNotes !== undefined) values.capacityNotes = patch.capacityNotes
    if (patch.workingStyle !== undefined) values.workingStyle = patch.workingStyle
    if (patch.defaultClientIds !== undefined) {
      values.defaultClientIds = patch.defaultClientIds
    }

    const [row] = await tx
      .update(teamMembers)
      .set(values)
      .where(eq(teamMembers.id, id))
      .returning()
    if (!row) return null

    await appendActivity(tx, {
      entityType: "team_member",
      entityId: id,
      actorEmail: actorEmail?.toLowerCase() ?? null,
      action: "update",
      before: teamRowToApi(before),
      after: teamRowToApi(row),
    })
    return teamRowToApi(row)
  })
}

// ---------------------------------------------------------------------------
// Stage 1 — task detail children (checklist + comments)
// Soft-delete applies to `tasks.deleted_at` only. Checklist items and comments
// have no deleted_at column — hard delete is correct for them. Do not add soft
// delete to these tables later without an explicit Stage decision.
// ---------------------------------------------------------------------------

export async function listChecklistItems(
  taskId: number,
  database: Db = db
): Promise<ChecklistItem[]> {
  const rows = await database
    .select()
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.taskId, taskId))
    .orderBy(asc(taskChecklistItems.sort), asc(taskChecklistItems.id))
  return rows.map(checklistRowToApi)
}

export async function createChecklistItem(
  taskId: number,
  input: CreateChecklistItemInput,
  actorEmail: string | null,
  database: Db = db
): Promise<ChecklistItem | null> {
  const label = input.label.trim()
  if (!label) return null

  return database.transaction(async (tx) => {
    if (!(await getLiveTaskRow(tx, taskId))) return null

    const [agg] = await tx
      .select({ m: max(taskChecklistItems.sort) })
      .from(taskChecklistItems)
      .where(eq(taskChecklistItems.taskId, taskId))
    const nextSort = Number(agg?.m ?? -1) + 1

    const [row] = await tx
      .insert(taskChecklistItems)
      .values({
        taskId,
        label,
        done: input.done ?? false,
        sort: nextSort,
      })
      .returning()

    const api = checklistRowToApi(row)
    await appendActivity(tx, {
      entityType: "checklist_item",
      entityId: api.id,
      actorEmail: actorEmail?.toLowerCase() ?? null,
      action: "create",
      after: api,
    })
    return api
  })
}

export async function updateChecklistItem(
  taskId: number,
  itemId: number,
  patch: UpdateChecklistItemInput,
  actorEmail: string | null,
  database: Db = db
): Promise<ChecklistItem | null> {
  return database.transaction(async (tx) => {
    if (!(await getLiveTaskRow(tx, taskId))) return null

    const [before] = await tx
      .select()
      .from(taskChecklistItems)
      .where(
        and(
          eq(taskChecklistItems.id, itemId),
          eq(taskChecklistItems.taskId, taskId)
        )
      )
      .limit(1)
    if (!before) return null

    const values: Partial<typeof taskChecklistItems.$inferInsert> = {}
    if (patch.label !== undefined) {
      const label = patch.label.trim()
      if (!label) return null
      values.label = label
    }
    if (patch.done !== undefined) values.done = patch.done
    if (Object.keys(values).length === 0) return checklistRowToApi(before)

    const [row] = await tx
      .update(taskChecklistItems)
      .set(values)
      .where(
        and(
          eq(taskChecklistItems.id, itemId),
          eq(taskChecklistItems.taskId, taskId)
        )
      )
      .returning()
    if (!row) return null

    const api = checklistRowToApi(row)
    await appendActivity(tx, {
      entityType: "checklist_item",
      entityId: itemId,
      actorEmail: actorEmail?.toLowerCase() ?? null,
      action: "update",
      before: checklistRowToApi(before),
      after: api,
    })
    return api
  })
}

export async function deleteChecklistItem(
  taskId: number,
  itemId: number,
  actorEmail: string | null,
  database: Db = db
): Promise<boolean> {
  return database.transaction(async (tx) => {
    if (!(await getLiveTaskRow(tx, taskId))) return false

    const [before] = await tx
      .select()
      .from(taskChecklistItems)
      .where(
        and(
          eq(taskChecklistItems.id, itemId),
          eq(taskChecklistItems.taskId, taskId)
        )
      )
      .limit(1)
    if (!before) return false

    // Hard delete — no deleted_at on task_checklist_items (see Stage 1 note above).
    await tx
      .delete(taskChecklistItems)
      .where(
        and(
          eq(taskChecklistItems.id, itemId),
          eq(taskChecklistItems.taskId, taskId)
        )
      )

    await appendActivity(tx, {
      entityType: "checklist_item",
      entityId: itemId,
      actorEmail: actorEmail?.toLowerCase() ?? null,
      action: "delete",
      before: checklistRowToApi(before),
    })
    return true
  })
}

/**
 * Reassigns `sort` to 0..n-1 from `orderedIds`.
 * `orderedIds` must be a permutation of every checklist item id for the task.
 */
export async function reorderChecklistItems(
  taskId: number,
  orderedIds: number[],
  actorEmail: string | null,
  database: Db = db
): Promise<ChecklistItem[] | null> {
  return database.transaction(async (tx) => {
    if (!(await getLiveTaskRow(tx, taskId))) return null

    const existing = await tx
      .select()
      .from(taskChecklistItems)
      .where(eq(taskChecklistItems.taskId, taskId))
      .orderBy(asc(taskChecklistItems.sort), asc(taskChecklistItems.id))

    const existingIds = existing.map((r) => Number(r.id))
    const existingSet = new Set(existingIds)
    if (
      orderedIds.length !== existingIds.length ||
      orderedIds.some((id) => !existingSet.has(id)) ||
      new Set(orderedIds).size !== orderedIds.length
    ) {
      throw new Error(
        "orderedIds must be a permutation of checklist item ids for this task"
      )
    }

    const before = existing.map(checklistRowToApi)
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(taskChecklistItems)
        .set({ sort: i })
        .where(
          and(
            eq(taskChecklistItems.id, orderedIds[i]!),
            eq(taskChecklistItems.taskId, taskId)
          )
        )
    }

    const afterRows = await tx
      .select()
      .from(taskChecklistItems)
      .where(eq(taskChecklistItems.taskId, taskId))
      .orderBy(asc(taskChecklistItems.sort), asc(taskChecklistItems.id))
    const after = afterRows.map(checklistRowToApi)

    await appendActivity(tx, {
      entityType: "task",
      entityId: taskId,
      actorEmail: actorEmail?.toLowerCase() ?? null,
      action: "checklist_reorder",
      before: { items: before },
      after: { items: after },
    })
    return after
  })
}

export async function listComments(
  taskId: number,
  database: Db = db
): Promise<TaskComment[]> {
  const rows = await database
    .select()
    .from(taskComments)
    .where(eq(taskComments.taskId, taskId))
    .orderBy(asc(taskComments.createdAt), asc(taskComments.id))
  return rows.map(commentRowToApi)
}

export async function createComment(
  taskId: number,
  input: CreateCommentInput,
  actorEmail: string | null = input.authorEmail,
  database: Db = db
): Promise<TaskComment | null> {
  const body = input.body.trim()
  if (!body) return null

  return database.transaction(async (tx) => {
    if (!(await getLiveTaskRow(tx, taskId))) return null

    const authorKind = input.authorKind === "ava" ? "ava" : "user"
    const [row] = await tx
      .insert(taskComments)
      .values({
        taskId,
        body,
        authorEmail: input.authorEmail?.trim().toLowerCase() || null,
        authorName: input.authorName ?? null,
        authorKind,
      })
      .returning()

    const api = commentRowToApi(row)
    await appendActivity(tx, {
      entityType: "task_comment",
      entityId: api.id,
      actorEmail: actorEmail?.toLowerCase() ?? null,
      actorKind: authorKind === "ava" ? "ava" : "user",
      action: "create",
      after: api,
    })
    return api
  })
}

export async function deleteComment(
  taskId: number,
  commentId: number,
  actorEmail: string | null,
  database: Db = db
): Promise<boolean> {
  return database.transaction(async (tx) => {
    if (!(await getLiveTaskRow(tx, taskId))) return false

    const [before] = await tx
      .select()
      .from(taskComments)
      .where(
        and(eq(taskComments.id, commentId), eq(taskComments.taskId, taskId))
      )
      .limit(1)
    if (!before) return false

    // Hard delete — no deleted_at on task_comments (see Stage 1 note above).
    await tx
      .delete(taskComments)
      .where(
        and(eq(taskComments.id, commentId), eq(taskComments.taskId, taskId))
      )

    await appendActivity(tx, {
      entityType: "task_comment",
      entityId: commentId,
      actorEmail: actorEmail?.toLowerCase() ?? null,
      action: "delete",
      before: commentRowToApi(before),
    })
    return true
  })
}

// ---------------------------------------------------------------------------
// Stage 1 step 5 — templates + template items
// ---------------------------------------------------------------------------

export async function listTemplates(
  opts: { includeItems?: boolean; page?: number; perPage?: number } = {},
  database: Db = db
): Promise<CodexPagedResponse<TaskTemplate>> {
  const page = clampPage(opts.page)
  const perPage = clampPerPage(opts.perPage ?? 100)
  const offset = (page - 1) * perPage

  const [totalRow] = await database.select({ c: count() }).from(taskTemplates)
  const itemsTotal = Number(totalRow?.c ?? 0)

  const rows = await database
    .select()
    .from(taskTemplates)
    .orderBy(asc(taskTemplates.name), asc(taskTemplates.id))
    .limit(perPage)
    .offset(offset)

  const items = rows.map(templateRowToApi)

  if (opts.includeItems && items.length) {
    const ids = items.map((t) => t.id)
    const itemRows = await database
      .select()
      .from(taskTemplateItems)
      .where(inArray(taskTemplateItems.templateId, ids))
      .orderBy(asc(taskTemplateItems.sort), asc(taskTemplateItems.id))
    const byTpl = new Map<number, TaskTemplateItem[]>()
    for (const r of itemRows) {
      const api = templateItemRowToApi(r)
      const list = byTpl.get(api.template_id) ?? []
      list.push(api)
      byTpl.set(api.template_id, list)
    }
    for (const t of items) {
      t.items = byTpl.get(t.id) ?? []
    }
  }

  return pagedEnvelope(items, itemsTotal, page, perPage)
}

export async function getTemplate(
  id: number,
  database: Db = db
): Promise<TaskTemplate | null> {
  const [row] = await database
    .select()
    .from(taskTemplates)
    .where(eq(taskTemplates.id, id))
    .limit(1)
  if (!row) return null
  const api = templateRowToApi(row)
  api.items = await listTemplateItems(id, database)
  return api
}

export async function createTemplate(
  input: CreateTemplateInput,
  actorEmail: string | null,
  database: Db = db
): Promise<TaskTemplate | null> {
  const name = input.name.trim()
  if (!name) return null

  return database.transaction(async (tx) => {
    const [row] = await tx
      .insert(taskTemplates)
      .values({
        name,
        description: input.description?.trim() || null,
      })
      .returning()
    const api = templateRowToApi(row)
    await appendActivity(tx, {
      entityType: "task_template",
      entityId: api.id,
      actorEmail: actorEmail?.toLowerCase() ?? null,
      action: "create",
      after: api,
    })
    return { ...api, items: [] }
  })
}

export async function updateTemplate(
  id: number,
  patch: UpdateTemplateInput,
  actorEmail: string | null,
  database: Db = db
): Promise<TaskTemplate | null> {
  return database.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(taskTemplates)
      .where(eq(taskTemplates.id, id))
      .limit(1)
    if (!before) return null

    const values: Partial<typeof taskTemplates.$inferInsert> = {}
    if (patch.name !== undefined) {
      const name = patch.name.trim()
      if (!name) return null
      values.name = name
    }
    if (patch.description !== undefined) {
      values.description = patch.description?.trim() || null
    }
    if (Object.keys(values).length === 0) {
      const api = templateRowToApi(before)
      api.items = await listTemplateItems(id, tx)
      return api
    }

    const [row] = await tx
      .update(taskTemplates)
      .set(values)
      .where(eq(taskTemplates.id, id))
      .returning()
    if (!row) return null

    const api = templateRowToApi(row)
    await appendActivity(tx, {
      entityType: "task_template",
      entityId: id,
      actorEmail: actorEmail?.toLowerCase() ?? null,
      action: "update",
      before: templateRowToApi(before),
      after: api,
    })
    api.items = await listTemplateItems(id, tx)
    return api
  })
}

export async function deleteTemplate(
  id: number,
  actorEmail: string | null,
  database: Db = db
): Promise<boolean> {
  return database.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(taskTemplates)
      .where(eq(taskTemplates.id, id))
      .limit(1)
    if (!before) return false

    // Cascade deletes template items via FK.
    await tx.delete(taskTemplates).where(eq(taskTemplates.id, id))

    await appendActivity(tx, {
      entityType: "task_template",
      entityId: id,
      actorEmail: actorEmail?.toLowerCase() ?? null,
      action: "delete",
      before: templateRowToApi(before),
    })
    return true
  })
}

export async function listTemplateItems(
  templateId: number,
  database: DbExecutor = db
): Promise<TaskTemplateItem[]> {
  const rows = await database
    .select()
    .from(taskTemplateItems)
    .where(eq(taskTemplateItems.templateId, templateId))
    .orderBy(asc(taskTemplateItems.sort), asc(taskTemplateItems.id))
  return rows.map(templateItemRowToApi)
}

export async function createTemplateItem(
  templateId: number,
  input: CreateTemplateItemInput,
  actorEmail: string | null,
  database: Db = db
): Promise<TaskTemplateItem | null> {
  const label = input.label.trim()
  if (!label) return null

  return database.transaction(async (tx) => {
    const [tpl] = await tx
      .select({ id: taskTemplates.id })
      .from(taskTemplates)
      .where(eq(taskTemplates.id, templateId))
      .limit(1)
    if (!tpl) return null

    const [agg] = await tx
      .select({ m: max(taskTemplateItems.sort) })
      .from(taskTemplateItems)
      .where(eq(taskTemplateItems.templateId, templateId))
    const nextSort = Number(agg?.m ?? -1) + 1

    const [row] = await tx
      .insert(taskTemplateItems)
      .values({
        templateId,
        label,
        sort: nextSort,
      })
      .returning()

    const api = templateItemRowToApi(row)
    await appendActivity(tx, {
      entityType: "task_template_item",
      entityId: api.id,
      actorEmail: actorEmail?.toLowerCase() ?? null,
      action: "create",
      after: api,
    })
    return api
  })
}

export async function updateTemplateItem(
  templateId: number,
  itemId: number,
  patch: UpdateTemplateItemInput,
  actorEmail: string | null,
  database: Db = db
): Promise<TaskTemplateItem | null> {
  return database.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(taskTemplateItems)
      .where(
        and(
          eq(taskTemplateItems.id, itemId),
          eq(taskTemplateItems.templateId, templateId)
        )
      )
      .limit(1)
    if (!before) return null

    const values: Partial<typeof taskTemplateItems.$inferInsert> = {}
    if (patch.label !== undefined) {
      const label = patch.label.trim()
      if (!label) return null
      values.label = label
    }
    if (Object.keys(values).length === 0) return templateItemRowToApi(before)

    const [row] = await tx
      .update(taskTemplateItems)
      .set(values)
      .where(
        and(
          eq(taskTemplateItems.id, itemId),
          eq(taskTemplateItems.templateId, templateId)
        )
      )
      .returning()
    if (!row) return null

    const api = templateItemRowToApi(row)
    await appendActivity(tx, {
      entityType: "task_template_item",
      entityId: itemId,
      actorEmail: actorEmail?.toLowerCase() ?? null,
      action: "update",
      before: templateItemRowToApi(before),
      after: api,
    })
    return api
  })
}

export async function deleteTemplateItem(
  templateId: number,
  itemId: number,
  actorEmail: string | null,
  database: Db = db
): Promise<boolean> {
  return database.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(taskTemplateItems)
      .where(
        and(
          eq(taskTemplateItems.id, itemId),
          eq(taskTemplateItems.templateId, templateId)
        )
      )
      .limit(1)
    if (!before) return false

    await tx
      .delete(taskTemplateItems)
      .where(
        and(
          eq(taskTemplateItems.id, itemId),
          eq(taskTemplateItems.templateId, templateId)
        )
      )

    await appendActivity(tx, {
      entityType: "task_template_item",
      entityId: itemId,
      actorEmail: actorEmail?.toLowerCase() ?? null,
      action: "delete",
      before: templateItemRowToApi(before),
    })
    return true
  })
}

export async function reorderTemplateItems(
  templateId: number,
  orderedIds: number[],
  actorEmail: string | null,
  database: Db = db
): Promise<TaskTemplateItem[] | null> {
  return database.transaction(async (tx) => {
    const [tpl] = await tx
      .select({ id: taskTemplates.id })
      .from(taskTemplates)
      .where(eq(taskTemplates.id, templateId))
      .limit(1)
    if (!tpl) return null

    const existing = await tx
      .select({ id: taskTemplateItems.id })
      .from(taskTemplateItems)
      .where(eq(taskTemplateItems.templateId, templateId))
    const existingIds = new Set(existing.map((r) => r.id))
    if (
      orderedIds.length !== existingIds.size ||
      orderedIds.some((id) => !existingIds.has(id))
    ) {
      throw new Error("ordered_ids must be a permutation of template item ids")
    }

    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(taskTemplateItems)
        .set({ sort: i })
        .where(
          and(
            eq(taskTemplateItems.id, orderedIds[i]!),
            eq(taskTemplateItems.templateId, templateId)
          )
        )
    }

    const items = await listTemplateItems(templateId, tx)
    await appendActivity(tx, {
      entityType: "task_template",
      entityId: templateId,
      actorEmail: actorEmail?.toLowerCase() ?? null,
      action: "reorder_items",
      after: { ordered_ids: orderedIds },
    })
    return items
  })
}

// ---------------------------------------------------------------------------
// Stage 1 step 5 — recurring generation helpers
// ---------------------------------------------------------------------------

export type RecurringSeedRow = {
  id: number
  title: string
  clientId: number
  templateId: number
  recurringRule: string
  description: string | null
  priority: string | null
  assigneeEmail: string | null
  assigneeName: string | null
  category: string | null
  createdByEmail: string | null
}

/** Live series seeds: non-null rule + template + client. */
export async function listRecurringSeeds(
  database: Db = db
): Promise<RecurringSeedRow[]> {
  const rows = await database
    .select({
      id: tasks.id,
      title: tasks.title,
      clientId: tasks.clientId,
      templateId: tasks.templateId,
      recurringRule: tasks.recurringRule,
      description: tasks.description,
      priority: tasks.priority,
      assigneeEmail: tasks.assigneeEmail,
      assigneeName: tasks.assigneeName,
      category: tasks.category,
      createdByEmail: tasks.createdByEmail,
    })
    .from(tasks)
    .where(
      and(
        isNull(tasks.deletedAt),
        isNotNull(tasks.recurringRule),
        isNotNull(tasks.templateId),
        isNotNull(tasks.clientId)
      )
    )

  return rows
    .filter(
      (r) =>
        r.recurringRule &&
        r.templateId != null &&
        r.clientId != null &&
        Number(r.clientId) > 0 &&
        Number(r.templateId) > 0
    )
    .map((r) => ({
      id: r.id,
      title: r.title,
      clientId: Number(r.clientId),
      templateId: Number(r.templateId),
      recurringRule: r.recurringRule!,
      description: r.description,
      priority: r.priority,
      assigneeEmail: r.assigneeEmail,
      assigneeName: r.assigneeName,
      category: r.category,
      createdByEmail: r.createdByEmail,
    }))
}

/**
 * Idempotency: live task with same (template_id, client_id, period marker).
 * Soft-deleted instances do not block regeneration.
 */
export async function findGeneratedRecurringTask(
  templateId: number,
  clientId: number,
  period: string,
  database: Db = db
): Promise<CodexTask | null> {
  const marker = formatPeriodMarker(period)
  const rows = await database
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.templateId, templateId),
        eq(tasks.clientId, clientId),
        eq(tasks.source, "recurring"),
        isNull(tasks.deletedAt),
        like(tasks.description, `${marker}%`)
      )
    )
    .limit(5)

  for (const row of rows) {
    if (descriptionHasPeriod(row.description, period)) {
      return taskRowToApi(row)
    }
  }
  return null
}

export type CreateGeneratedRecurringInput = {
  title: string
  clientId: number
  templateId: number
  period: string
  dueYmd: string
  description?: string | null
  priority?: string | null
  assigneeEmail?: string | null
  assigneeName?: string | null
  category?: string | null
  createdByEmail: string
}

/**
 * Create one period instance. Caller must check idempotency first.
 * Checklist copied from template; source=recurring; no recurring_rule on child.
 */
export async function createGeneratedRecurringTask(
  input: CreateGeneratedRecurringInput,
  database: Db = db
): Promise<CodexTask> {
  const description = descriptionWithPeriod(input.period, input.description)

  return database.transaction(async (tx) => {
    const now = new Date().toISOString()
    const [row] = await tx
      .insert(tasks)
      .values({
        title: input.title,
        clientId: input.clientId,
        description,
        status: "todo",
        priority: input.priority ?? "normal",
        assigneeEmail: input.assigneeEmail?.trim().toLowerCase() || null,
        assigneeName: input.assigneeName ?? null,
        dueDate: input.dueYmd,
        category: input.category ?? null,
        clientVisible: false,
        source: "recurring",
        templateId: input.templateId,
        recurringRule: null,
        createdByEmail: input.createdByEmail.trim().toLowerCase(),
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    await copyTemplateItemsToTask(tx, row.id, input.templateId, null)

    await appendActivity(tx, {
      entityType: "task",
      entityId: row.id,
      actorEmail: null,
      actorKind: "system",
      action: "create",
      after: {
        ...taskRowToApi(row),
        period: input.period,
      },
    })
    return taskRowToApi(row)
  })
}
