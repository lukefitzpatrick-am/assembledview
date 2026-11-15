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
  ilike,
  like,
  lt,
  lte,
  max,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm"
import { db, schema, type Db } from "@/db"
import type { CodexActorKind } from "@/db/schema/codex"
import {
  applyEstimatedMinutes,
  estimatedMinutesByTaskId,
  executeRows,
  writeTaskEstimatedMinutes,
} from "@/lib/codex/estimatedMinutesColumn"
import {
  clampPage,
  clampPerPage,
  parseStatusFilter,
  parseTaskPriorityFilter,
  parseTaskSort,
  parseTaskSourceFilter,
  type MyWorkTab,
  type TaskSortKey,
} from "@/lib/codex/queryHelpers"
import { sydneyTodayYmd, toSydneyCivilYmd } from "@/lib/codex/dueDate"
import { sydneyCivilParts } from "@/lib/codex/quickAddParse"
import {
  descriptionHasPeriod,
  descriptionHasSeed,
  descriptionWithPeriod,
  formatPeriodMarker,
  formatSeedMarker,
  normaliseRecurringRule,
} from "@/lib/codex/recurringRule"
import { CodexHelpError, isOpenHelpChildStatus } from "@/lib/codex/helpRoster"
import { isProjectsMigrationApplied } from "@/lib/codex/projectsMarker"
import { activityActor, isSystemActor, SYSTEM_ACTORS } from "@/lib/codex/systemActors"
import { AssigneeNoAccessError } from "@/lib/codex/projects"
import {
  assertAssigneeCanSeeTask,
  emailsWithoutProjectAccess,
  hiddenTaskIds,
  taskVisibilityCondition,
} from "@/lib/codex/taskVisibility"
import { followSectionRule, lockTaskAndProject, lockTaskProject, TaskProjectChangedError } from "@/lib/codex/sectionSync"
import { assignedByAfterAssign, assigneeChanged } from "@/lib/codex/taskDetail"
import type {
  ChecklistItem,
  CodexActivity,
  CodexPagedResponse,
  CodexTask,
  HelpChildSummary,
  HelpParentSummary,
  TaskComment,
  TaskTemplate,
  TaskTemplateItem,
  TeamMember,
} from "@/lib/codex/types"
import {
  ASK_HELP_MAX_CHARS,
  FIRST_OPEN_TASK_STATUS,
  TASK_STATUSES,
  isTaskStatus,
  type TaskStatus,
} from "@/lib/codex/types"
import {
  assertNewAliasesAvailable,
  listAliasCollisions,
  type AliasCollision,
  type AliasRosterRow,
} from "@/lib/codex/rosterAliasGuard"

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
export type DbExecutor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0]

// ---------------------------------------------------------------------------
// B40: subtasks share parent_task_id with help children
// ---------------------------------------------------------------------------

/**
 * Once 0118 exists a child row with `task_type = 'subtask'` (B40) is a
 * subtask, never a help child: it is not listed as "Waiting on", completing
 * or reopening it never moves the parent, and it never holds a help parent
 * in waiting. Before 0118 there are no subtasks, so nothing is read. This
 * holds with codex_projects off too (subtasks made while it was on stay
 * subtasks). task_type is not in the Drizzle mirror yet (C-210): raw SQL.
 */
async function helpChildCondition(database: DbExecutor): Promise<SQL | undefined> {
  if (!(await isProjectsMigrationApplied(database))) return undefined
  return sql`coalesce("tasks"."task_type", 'task') <> 'subtask'`
}

async function isSubtaskRow(database: DbExecutor, id: number): Promise<boolean> {
  if (!(await isProjectsMigrationApplied(database))) return false
  const rows = executeRows(await database.execute(sql`SELECT task_type FROM public.tasks WHERE id = ${id}`))
  return rows[0]?.task_type === "subtask"
}

/** B40: assigned by after an assignee write. Null when 0118 is missing (nothing written). */
async function writeAssignedBy(
  database: DbExecutor,
  id: number,
  assignee: string | null | undefined,
  actorEmail: string | null
): Promise<string | null | undefined> {
  if (!(await isProjectsMigrationApplied(database))) return undefined
  const assignedBy = assignedByAfterAssign(assignee, actorEmail)
  await database.execute(sql`UPDATE public.tasks SET assigned_by_email = ${assignedBy} WHERE id = ${id}`)
  return assignedBy
}

/** Canonical sorts, plus the three values the tasks API accepted before `sort` was a URL param. */
export type TaskSort =
  | TaskSortKey
  | "due_date_asc"
  | "due_date_desc"
  | "created_at_desc"

function taskListOrder(sort: TaskSortKey): SQL[] {
  const id = desc(tasks.id)
  if (sort === "due_desc") return [sql`${tasks.dueDate} desc nulls last`, id]
  if (sort === "created_desc") return [desc(tasks.createdAt), id]
  if (sort === "updated_desc") {
    return [sql`coalesce(${tasks.updatedAt}, ${tasks.createdAt}) desc`, id]
  }
  if (sort === "priority_desc") {
    return [
      sql`case ${tasks.priority} when 'asap' then 0 when 'high' then 1 when 'normal' then 2 when 'low' then 3 else 4 end`,
      sql`${tasks.dueDate} asc nulls last`,
      id,
    ]
  }
  return [sql`${tasks.dueDate} asc nulls last`, id]
}

export type ListTasksFilters = {
  clientId?: number
  /** Exact assignee match (All-tasks filter). Null assignees excluded. */
  assigneeEmail?: string
  /** assignee_email IS NULL. Wins over mine and assignee_email. */
  unassigned?: boolean
  /**
   * My-tasks scope: assignee_email = email OR created_by_email = email.
   * Includes unassigned tasks created by this user.
   */
  mineForEmail?: string
  status?: string[]
  mbaNumber?: string
  dueBefore?: string
  dueAfter?: string
  /** `none` matches category IS NULL. */
  category?: string
  /** CSV. `profile` matches source LIKE 'profile:%'. */
  source?: string
  /** CSV of high, normal, low. */
  priority?: string
  overdue?: boolean
  /** client_id IS NULL. Wins over clientId. */
  noClient?: boolean
  createdByEmail?: string
  /** Clock for the overdue bound. Defaults to now. */
  now?: Date
  autoCreated?: boolean
  /** Title, description, or MBA contains this text (case-insensitive). */
  q?: string
  includeDeleted?: boolean
  sort?: TaskSort
  page?: number
  perPage?: number
  /**
   * B42 (C-211): the person reading. After 0118 tasks in a private project
   * they cannot see are left out. Unset counts as nobody (public projects
   * only), so a caller that forgets it hides too much, never too little.
   */
  viewerEmail?: string | null
  /**
   * B42 My Work tab (switch `codex_my_work`, the route sets it): assigned to
   * `myWorkEmail`, assigned by them (`assigned_by_email`), or followed by
   * them (B41's rule: a follow row that is not `unfollowed`, or creator or
   * assignee without an `unfollowed` row). The last two read 0118 columns:
   * before 0118 they match nothing. `myWorkEmail` is the primary email.
   */
  myWork?: MyWorkTab
  myWorkEmail?: string
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
  estimatedMinutes?: number | null
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
  autoCreated?: boolean
  avaAutoKey?: string | null
  createdByEmail: string
  /** B40, codex_projects on: assigned by the creator when the task goes to someone else (after 0118). */
  trackAssignedBy?: boolean
}

export type UpdateTaskInput = {
  title?: string
  description?: string | null
  status?: string
  priority?: string | null
  assigneeEmail?: string | null
  assigneeName?: string | null
  dueDate?: string | null
  estimatedMinutes?: number | null
  mbaNumber?: string | null
  category?: string | null
  clientVisible?: boolean | null
  /** App-level exists-check required at the route when set (no DB FK until T6). */
  clientId?: number
  templateId?: number | null
  recurringRule?: string | null
  /**
   * B40, codex_projects on: when the assignee changes, set
   * `assigned_by_email` (the saver when someone else gets the task, else
   * null). Written only once 0118 exists; never from the client.
   */
  trackAssignedBy?: boolean
}

export const TEMPLATE_LABEL_MAX = 200

export class TemplateLabelError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TemplateLabelError"
  }
}

export type TemplateItemWrite = {
  id?: number | null
  label: string
}

export type CreateTemplateInput = {
  name: string
  description?: string | null
  items?: Array<{ label: string }>
}

export type UpdateTemplateInput = {
  name?: string
  description?: string | null
  /** When set, replaces the checklist in one transaction. */
  items?: TemplateItemWrite[]
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
  emailAliases?: string[]
}

export type UpdateTeamMemberInput = {
  name?: string
  roleTitle?: string | null
  active?: boolean
  capacityNotes?: string | null
  workingStyle?: string | null
  defaultClientIds?: number[]
  email?: string
  emailAliases?: string[]
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
    due_date: toSydneyCivilYmd(row.dueDate),
    estimated_minutes: null,
    mba_number: row.mbaNumber,
    description: row.description,
    client_visible: row.clientVisible,
    created_by: row.createdByEmail,
    created_by_email: row.createdByEmail,
    category: row.category,
    source: row.source,
    source_note_id: row.sourceNoteId ?? null,
    auto_created: Boolean(row.autoCreated),
    ava_auto_key: row.avaAutoKey ?? null,
    recurring_rule: row.recurringRule ?? null,
    template_id: row.templateId ?? null,
    deleted_at: row.deletedAt,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    parent_task_id: row.parentTaskId ?? null,
    help_requested_by_email: row.helpRequestedByEmail ?? null,
    help_prior_status: row.helpPriorStatus ?? null,
  }
}

function helpChildSummary(row: typeof tasks.$inferSelect): HelpChildSummary {
  return {
    id: Number(row.id),
    title: row.title,
    assignee_email: row.assigneeEmail ?? null,
    assignee_name: row.assigneeName ?? null,
    status: row.status,
  }
}

function helpParentSummary(row: typeof tasks.$inferSelect): HelpParentSummary {
  return {
    id: Number(row.id),
    title: row.title,
    assignee_email: row.assigneeEmail ?? null,
    assignee_name: row.assigneeName ?? null,
    status: row.status,
    description: row.description ?? null,
  }
}

async function listHelpChildren(
  database: DbExecutor,
  parentId: number
): Promise<HelpChildSummary[]> {
  const rows = await database
    .select()
    .from(tasks)
    .where(and(eq(tasks.parentTaskId, parentId), isNull(tasks.deletedAt), await helpChildCondition(database)))
    .orderBy(asc(tasks.createdAt), asc(tasks.id))
  return rows.map(helpChildSummary)
}

async function attachHelpGraph(
  database: DbExecutor,
  api: CodexTask,
  viewerEmail: string | null | undefined
): Promise<CodexTask> {
  const id = Number(api.id)
  const allChildren = await listHelpChildren(database, id)
  // B42 (C-211): a help child or parent in a private project the viewer
  // cannot see is not shown (no title, no snapshot of its description).
  const hidden = await hiddenTaskIds(
    database,
    [...allChildren.map((c) => c.id), ...(api.parent_task_id != null ? [api.parent_task_id] : [])],
    viewerEmail
  )
  const children = allChildren.filter((c) => !hidden.has(c.id))
  let parent: HelpParentSummary | null = null
  let parentTitle: string | null = api.parent_title ?? null
  // P2 (PACK3fix): the read below takes only an id that passed the rule.
  const visibleParentId =
    api.parent_task_id != null && !hidden.has(api.parent_task_id) ? api.parent_task_id : null
  if (api.parent_task_id != null && visibleParentId == null) {
    parentTitle = null
  } else if (visibleParentId != null && !(await isSubtaskRow(database, id))) {
    const [row] = await database
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, visibleParentId), isNull(tasks.deletedAt)))
      .limit(1)
    if (row) {
      parent = helpParentSummary(row)
      parentTitle = row.title
    }
  }
  return {
    ...api,
    children,
    parent,
    parent_title: parentTitle,
  }
}

async function attachParentTitles(
  database: DbExecutor,
  items: CodexTask[],
  viewerEmail: string | null | undefined
): Promise<CodexTask[]> {
  const parentIds = [
    ...new Set(
      items
        .map((t) => t.parent_task_id)
        .filter((id): id is number => id != null && Number.isFinite(id) && id > 0)
    ),
  ]
  if (parentIds.length === 0) return items
  // B42: a parent in a private project the viewer cannot see lends no title (never read).
  const hidden = await hiddenTaskIds(database, parentIds, viewerEmail)
  const shown = parentIds.filter((id) => !hidden.has(id))
  const rows = shown.length === 0 ? [] : await database
    .select({ id: tasks.id, title: tasks.title })
    .from(tasks)
    .where(inArray(tasks.id, shown))
  const titleById = new Map(rows.map((r) => [Number(r.id), r.title]))
  const subtasks = await subtaskIdsAmong(
    database,
    items.filter((t) => t.parent_task_id != null && t.task_type == null).map((t) => Number(t.id))
  )
  return items.map((t) =>
    t.parent_task_id != null
      ? {
          ...t,
          parent_title: titleById.get(t.parent_task_id) ?? null,
          ...(subtasks.has(Number(t.id)) ? { task_type: "subtask" } : {}),
        }
      : t
  )
}

/**
 * B40fix: which of these child rows are subtasks, so a list row or card
 * says "Subtask of" and not "Help for" with codex_projects off too (the
 * B40 enrichment runs only with it on). Nothing is read before 0118.
 */
async function subtaskIdsAmong(database: DbExecutor, ids: readonly number[]): Promise<Set<number>> {
  const valid = ids.filter((id) => Number.isSafeInteger(id) && id > 0)
  if (valid.length === 0 || !(await isProjectsMigrationApplied(database))) return new Set()
  const rows = executeRows(
    await database.execute(
      sql`SELECT id FROM public.tasks WHERE id IN (${sql.join(valid.map((id) => sql`${id}`), sql`, `)}) AND task_type = 'subtask'`
    )
  )
  return new Set(rows.map((r) => Number(r.id)))
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
  // C-264 (B43): a named system actor (`system:relabel`, ...) is stored as itself with kind system.
  const who = isSystemActor(args.actorEmail)
    ? activityActor(args.actorEmail)
    : { actorEmail: args.actorEmail, actorKind: args.actorKind ?? "user" }
  await database.insert(codexActivity).values({
    entityType: args.entityType,
    entityId: args.entityId,
    actorEmail: who.actorEmail,
    actorKind: who.actorKind,
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

/** ILIKE pattern with `\`, `%`, and `_` treated as literals. */
function taskSearchCondition(raw: string | undefined): SQL | undefined {
  const q = raw?.trim()
  if (!q) return undefined
  const escaped = q.replace(/[\\%_]/g, (ch) => `\\${ch}`)
  const pattern = `%${escaped}%`
  return or(
    ilike(tasks.title, pattern),
    ilike(tasks.description, pattern),
    ilike(tasks.mbaNumber, pattern)
  )
}

/** Exact source tokens, plus `profile` as source LIKE 'profile:%'. */
function taskSourceCondition(raw: string | undefined): SQL | undefined {
  const tokens = parseTaskSourceFilter(raw)
  if (tokens.length === 0) return undefined
  const exact = tokens.filter((token) => token !== "profile")
  const parts: SQL[] = []
  if (exact.length > 0) parts.push(inArray(tasks.source, exact))
  if (tokens.includes("profile")) parts.push(like(tasks.source, "profile:%"))
  if (parts.length === 1) return parts[0]
  return or(...parts)
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

function knownStatusSqlList() {
  return sql.join(
    TASK_STATUSES.map((status) => sql`${status}`),
    sql`, `
  )
}

/**
 * Status filter shared by the list and the board counts.
 * A filter that includes `todo` also matches values outside the five columns,
 * so those rows travel with To do.
 */
function taskStatusCondition(statuses: string[] | undefined): SQL | undefined {
  if (!statuses?.length) return undefined
  const selected = inArray(tasks.status, statuses)
  if (!statuses.includes("todo")) return selected
  const unknown = sql`${tasks.status} not in (${knownStatusSqlList()})`
  return or(selected, unknown)
}

function taskListWhere(filters: ListTasksFilters): SQL | undefined {
  const conds: SQL[] = []
  if (!filters.includeDeleted) conds.push(isNull(tasks.deletedAt))
  if (filters.noClient) conds.push(isNull(tasks.clientId))
  else if (filters.clientId != null) conds.push(eq(tasks.clientId, filters.clientId))
  if (filters.unassigned) conds.push(isNull(tasks.assigneeEmail))
  else if (filters.mineForEmail) {
    const email = filters.mineForEmail.trim().toLowerCase()
    const mineScope = or(
      eq(tasks.assigneeEmail, email),
      eq(tasks.createdByEmail, email)
    )
    if (mineScope) conds.push(mineScope)
  } else if (filters.assigneeEmail) {
    conds.push(eq(tasks.assigneeEmail, filters.assigneeEmail.trim().toLowerCase()))
  }
  if (filters.createdByEmail?.trim()) {
    conds.push(
      sql`lower(${tasks.createdByEmail}) = ${filters.createdByEmail.trim().toLowerCase()}`
    )
  }
  const statusCond = taskStatusCondition(filters.status)
  if (statusCond) conds.push(statusCond)
  if (filters.mbaNumber?.trim()) {
    conds.push(
      sql`lower(${tasks.mbaNumber}) = ${filters.mbaNumber.trim().toLowerCase()}`
    )
  }
  if (filters.dueBefore) conds.push(lte(tasks.dueDate, filters.dueBefore))
  if (filters.dueAfter) conds.push(gte(tasks.dueDate, filters.dueAfter))
  if (filters.overdue) {
    conds.push(lt(tasks.dueDate, sydneyTodayYmd(filters.now)))
    conds.push(ne(tasks.status, "done"))
  }
  if (filters.category === "none") conds.push(isNull(tasks.category))
  else if (filters.category) conds.push(eq(tasks.category, filters.category))
  const priorities = parseTaskPriorityFilter(filters.priority)
  if (priorities.length > 0) conds.push(inArray(tasks.priority, priorities))
  const sourceCond = taskSourceCondition(filters.source)
  if (sourceCond) conds.push(sourceCond)
  if (filters.autoCreated === true) conds.push(eq(tasks.autoCreated, true))
  const search = taskSearchCondition(filters.q)
  if (search) conds.push(search)

  return conds.length > 0 ? and(...conds) : undefined
}

/** `taskListWhere` plus the private-project rule (B42) once 0118 exists, and the My Work tab. */
async function taskListWhereVisible(database: DbExecutor, filters: ListTasksFilters): Promise<SQL | undefined> {
  return and(
    taskListWhere(filters),
    await myWorkCondition(database, filters.myWork, filters.myWorkEmail),
    await taskVisibilityCondition(database, filters.viewerEmail)
  )
}

/** B42: the My Work tab's condition (see ListTasksFilters.myWork). */
async function myWorkCondition(database: DbExecutor, tab: MyWorkTab | undefined, rawEmail: string | undefined): Promise<SQL | undefined> {
  if (!tab) return undefined
  const me = (rawEmail ?? "").trim().toLowerCase()
  if (!me) return sql`false`
  if (tab === "assigned") return sql`lower(${tasks.assigneeEmail}) = ${me}`
  if (!(await isProjectsMigrationApplied(database))) return sql`false`
  if (tab === "assigned_by") return sql`lower("tasks"."assigned_by_email") = ${me}`
  return sql`(
    EXISTS (SELECT 1 FROM public.task_followers mf WHERE mf.task_id = "tasks"."id" AND lower(mf.email) = ${me} AND mf.reason <> 'unfollowed')
    OR ((lower(${tasks.createdByEmail}) = ${me} OR lower(${tasks.assigneeEmail}) = ${me})
        AND NOT EXISTS (SELECT 1 FROM public.task_followers mu WHERE mu.task_id = "tasks"."id" AND lower(mu.email) = ${me} AND mu.reason = 'unfollowed'))
  )`
}

export async function listTasks(
  filters: ListTasksFilters = {},
  database: Db = db
): Promise<CodexPagedResponse<CodexTask>> {
  const page = clampPage(filters.page)
  const perPage = clampPerPage(filters.perPage)
  const offset = (page - 1) * perPage
  const where = await taskListWhereVisible(database, filters)

  const [totalRow] = await database
    .select({ c: count() })
    .from(tasks)
    .where(where)
  const itemsTotal = Number(totalRow?.c ?? 0)

  const rows = await database
    .select()
    .from(tasks)
    .where(where)
    .orderBy(...taskListOrder(parseTaskSort(filters.sort)))
    .limit(perPage)
    .offset(offset)

  const apiTasks = rows.map(taskRowToApi)
  return pagedEnvelope(await enrichListTasks(database, apiTasks, filters.viewerEmail), itemsTotal, page, perPage)
}

/**
 * Live tasks by id with the list's card fields (checklist progress,
 * estimate, help parent title), in the order of `ids`. Used by the project
 * board (B39), which picks and orders the ids itself.
 */
export async function loadListTasksByIds(
  database: DbExecutor,
  ids: readonly number[],
  viewerEmail?: string | null
): Promise<CodexTask[]> {
  if (ids.length === 0) return []
  const rows = await database
    .select()
    .from(tasks)
    .where(and(inArray(tasks.id, [...ids]), isNull(tasks.deletedAt)))
  const byId = new Map(rows.map((r) => [Number(r.id), taskRowToApi(r)]))
  const ordered = ids.map((id) => byId.get(id)).filter((t): t is CodexTask => t != null)
  return enrichListTasks(database, ordered, viewerEmail)
}

/** Checklist progress, estimates and help parent titles for list rows and board cards. */
async function enrichListTasks(
  database: DbExecutor,
  apiTasks: CodexTask[],
  viewerEmail: string | null | undefined
): Promise<CodexTask[]> {
  const ids = apiTasks.map((t) => Number(t.id)).filter((id) => Number.isFinite(id) && id > 0)
  if (ids.length === 0) return apiTasks

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

  const withEstimates = await applyEstimatedMinutes(database, withProgress)
  return attachParentTitles(database, withEstimates, viewerEmail)
}

export type TaskStatusCounts = Record<TaskStatus, number>

function emptyStatusCounts(): TaskStatusCounts {
  return {
    backlog: 0,
    todo: 0,
    in_progress: 0,
    waiting: 0,
    done: 0,
  }
}

/** One GROUP BY over the same WHERE as `listTasks`. Unknown statuses fold into `todo`. */
export async function countTasksByStatus(
  filters: ListTasksFilters = {},
  database: Db = db
): Promise<TaskStatusCounts> {
  const where = await taskListWhereVisible(database, filters)
  // Group by the raw column and fold unknown statuses into `todo` here.
  // A parameterised CASE in both SELECT and GROUP BY fails in Postgres (42803):
  // the two copies get different $n placeholders, so they are not the same expression.
  const rows = await database
    .select({
      status: tasks.status,
      c: count(),
    })
    .from(tasks)
    .where(where)
    .groupBy(tasks.status)

  const counts = emptyStatusCounts()
  for (const row of rows) {
    const raw = String(row.status ?? "")
    const key = isTaskStatus(raw) ? raw : "todo"
    counts[key] += Number(row.c ?? 0)
  }
  return counts
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
  now: Date = new Date(),
  viewerEmail?: string | null
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
  // B42: tasks in a private project the viewer cannot see are not counted.
  const visible = await taskVisibilityCondition(database, viewerEmail)

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
        ne(tasks.status, "done"),
        visible
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
        lt(tasks.dueDate, sydneyToday),
        visible
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
  database: Db = db,
  viewerEmail?: string | null
): Promise<CodexTask | null> {
  const [row] = await database.select().from(tasks).where(eq(tasks.id, id)).limit(1)
  if (!row || row.deletedAt) return null
  const [api] = await applyEstimatedMinutes(database, [taskRowToApi(row)])
  if (!api) return null
  return attachHelpGraph(database, api, viewerEmail)
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
        autoCreated: Boolean(input.autoCreated),
        avaAutoKey: input.avaAutoKey?.trim() || null,
        createdByEmail: input.createdByEmail.trim().toLowerCase(),
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    if (templateId != null) {
      await copyTemplateItemsToTask(tx, row.id, templateId, actorEmail)
    }

    const api = taskRowToApi(row)
    if (input.trackAssignedBy && row.assigneeEmail) {
      const by = await writeAssignedBy(tx, row.id, row.assigneeEmail, actorEmail)
      if (by !== undefined) api.assigned_by_email = by
    }
    if (
      input.estimatedMinutes != null &&
      Number.isFinite(input.estimatedMinutes)
    ) {
      const minutes = Math.round(input.estimatedMinutes)
      const wrote = await writeTaskEstimatedMinutes(tx, row.id, minutes)
      if (wrote) api.estimated_minutes = minutes
    }

    await appendActivity(tx, {
      entityType: "task",
      entityId: row.id,
      actorEmail: actorEmail?.toLowerCase() ?? null,
      actorKind: input.actorKind ?? "user",
      action: "create",
      after: api,
    })
    return api
  })
}

export class CodexBulkError extends Error {
  readonly taskId: number
  readonly statusCode: 400 | 409

  constructor(taskId: number, statusCode: 400 | 409, message: string) {
    super(message)
    this.name = "CodexBulkError"
    this.taskId = taskId
    this.statusCode = statusCode
  }
}

async function updateLiveTask(
  tx: DbExecutor,
  id: number,
  patch: UpdateTaskInput,
  actorEmail: string | null
): Promise<CodexTask | null> {
  if (patch.recurringRule !== undefined && patch.recurringRule != null && patch.recurringRule.trim() !== "") {
    if (!normaliseRecurringRule(patch.recurringRule)) {
      throw new Error("Invalid recurring_rule")
    }
  }

  {
    const [before] = await tx.select().from(tasks).where(eq(tasks.id, id)).limit(1)
    if (!before || before.deletedAt) return null
    // F5 (B42fix): a task in a private project goes only to someone who can see the project.
    if (patch.assigneeEmail !== undefined) {
      const next = patch.assigneeEmail?.trim().toLowerCase() || null
      if (next && assigneeChanged(before.assigneeEmail, next)) await assertAssigneeCanSeeTask(tx, id, next)
    }

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

    const after = taskRowToApi(row)
    if (patch.trackAssignedBy && patch.assigneeEmail !== undefined && assigneeChanged(before.assigneeEmail, row.assigneeEmail)) {
      const by = await writeAssignedBy(tx, id, row.assigneeEmail, actorEmail)
      if (by !== undefined) after.assigned_by_email = by
    }
    if (patch.estimatedMinutes !== undefined) {
      const minutes =
        patch.estimatedMinutes == null || !Number.isFinite(patch.estimatedMinutes)
          ? null
          : Math.round(patch.estimatedMinutes)
      const wrote = await writeTaskEstimatedMinutes(tx, id, minutes)
      if (wrote) after.estimated_minutes = minutes
    } else {
      const [withEst] = await applyEstimatedMinutes(tx, [after])
      if (withEst) after.estimated_minutes = withEst.estimated_minutes ?? null
    }
    const [beforeWithEst] = await applyEstimatedMinutes(tx, [taskRowToApi(before)])

    await appendActivity(tx, {
      entityType: "task",
      entityId: id,
      actorEmail: actorEmail?.toLowerCase() ?? null,
      action: "update",
      before: beforeWithEst ?? taskRowToApi(before),
      after,
    })

    const statusMoved = before.status !== row.status
    if (statusMoved && row.parentTaskId && !(await isSubtaskRow(tx, id))) {
      if (before.status !== "done" && row.status === "done") {
        await maybeCompleteHelpParent(tx, row, actorEmail)
      } else if (before.status === "done" && isOpenHelpChildStatus(row.status)) {
        await maybeRewaitHelpParent(tx, row, actorEmail)
      }
    }

    return after
  }
}

/**
 * A status change inside the caller's transaction, through the same path as
 * PATCH (activity row, help parent complete and re-wait). Used by the
 * project section rule (`lib/codex/projectsRepo.ts`). Null when the task is
 * missing or soft-deleted.
 */
export async function updateTaskStatusInTx(
  tx: DbExecutor,
  id: number,
  status: TaskStatus,
  actorEmail: string | null
): Promise<CodexTask | null> {
  return updateLiveTask(tx, id, { status }, actorEmail)
}

/**
 * Any PATCH-shaped update inside the caller's transaction, through the same
 * path as PATCH. Used by the project section rule (B39: PATCH and bulk status
 * changes on a project task). Null when the task is missing or soft-deleted.
 */
export async function updateTaskInTx(
  tx: DbExecutor,
  id: number,
  patch: UpdateTaskInput,
  actorEmail: string | null
): Promise<CodexTask | null> {
  return updateLiveTask(tx, id, patch, actorEmail)
}

export async function updateTask(
  id: number,
  patch: UpdateTaskInput,
  actorEmail: string | null,
  database: Db = db
): Promise<CodexTask | null> {
  return database.transaction((tx) => updateLiveTask(tx, id, patch, actorEmail))
}

/**
 * C-220 (B42): a system writer's update (the relabel auto-close) that also
 * follows the section rule for a project task: the project is locked first,
 * then the plain update, then the task moves to the section its new status
 * names (never refused; no such section keeps it where it is).
 */
export async function updateTaskFollowingSections(
  id: number,
  patch: UpdateTaskInput,
  actorEmail: string | null,
  database: Db = db
): Promise<CodexTask | null> {
  return database.transaction(async (tx) => {
    if (typeof patch.status === "string") await lockTaskProject(tx, id)
    const updated = await updateLiveTask(tx, id, patch, actorEmail)
    if (updated && typeof patch.status === "string") await followSectionRule(tx, id, patch.status, actorEmail)
    return updated
  })
}

export const HELP_ON_DONE_MESSAGE = "Reopen the task before asking for help"

/** F1 (B42fix): Ask for help on a private project's task, to someone outside it. */
export function helpNoAccessMessage(helper: string): string {
  return `${helper} is not a member of this private project. Add them to the project first, or ask someone who is.`
}

export type RequestHelpInput = {
  assigneeEmail: string
  ask: string
}

export type RequestHelpActor = {
  email: string
  name?: string | null
}

export type RequestHelpResult = {
  parent: CodexTask
  child: CodexTask
}

export async function requestHelp(
  parentId: number,
  input: RequestHelpInput,
  actor: RequestHelpActor,
  database: Db = db,
  /** B42 (C-230): with codex_projects on the helper's task records the asker as assigned by (My Work). */
  opts: { trackAssignedBy?: boolean } = {}
): Promise<RequestHelpResult> {
  const actorEmail = actor.email.trim().toLowerCase()
  if (!actorEmail) {
    throw new CodexHelpError("Could not resolve the caller email.")
  }
  const ask = input.ask.trim()
  if (!ask) {
    throw new CodexHelpError("ask is required.")
  }
  if (ask.length > ASK_HELP_MAX_CHARS) {
    throw new CodexHelpError(`ask must be ${ASK_HELP_MAX_CHARS} characters or fewer.`)
  }
  const assigneeEmail = input.assigneeEmail.trim().toLowerCase()
  if (!assigneeEmail) {
    throw new CodexHelpError("assignee_email is required.")
  }
  if (assigneeEmail === actorEmail) {
    throw new CodexHelpError("Cannot ask yourself for help.")
  }

  return database.transaction(async (tx) => {
    // C-220 (B42): the parent's project first, as every section writer. P3
    // (PACK3fix): then the parent row, re-reading its project, so a board move
    // committing in between cannot leave the help task outside the project.
    const locked = await lockTaskAndProject(tx, parentId).catch((err: unknown) => {
      if (err instanceof TaskProjectChangedError) throw new CodexHelpError(err.message, 409, "task_changed")
      throw err
    })
    const [parent] = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, parentId), isNull(tasks.deletedAt)))
      .limit(1)
    if (!parent) {
      throw new CodexHelpError("Task not found.", 404)
    }
    if (parent.parentTaskId != null) {
      throw new CodexHelpError("Cannot ask for help on a help request.")
    }
    if (parent.status === "done") {
      throw new CodexHelpError(HELP_ON_DONE_MESSAGE)
    }

    const [member] = await tx
      .select()
      .from(teamMembers)
      .where(
        and(eq(teamMembers.email, assigneeEmail), eq(teamMembers.active, true))
      )
      .limit(1)
    if (!member) {
      throw new CodexHelpError("Team member not found or inactive.")
    }

    // F1 (B42fix): the help task lives in the parent's project, so a private
    // project's privacy covers its title and the ask. The helper must be able
    // to see that project (membership is the access rule, F5).
    const projectId = locked.projectId
    if (projectId != null) {
      const [refused] = await emailsWithoutProjectAccess(tx, projectId, [assigneeEmail])
      if (refused) throw new CodexHelpError(helpNoAccessMessage(member.name || assigneeEmail), 409)
    }

    const helperName = member.name
    const now = new Date().toISOString()
    const [child] = await tx
      .insert(tasks)
      .values({
        title: `Help: ${parent.title}`,
        clientId: parent.clientId,
        description: null,
        status: FIRST_OPEN_TASK_STATUS,
        priority: parent.priority ?? "normal",
        assigneeEmail,
        assigneeName: helperName,
        dueDate: parent.dueDate ?? null,
        mbaNumber: parent.mbaNumber ?? null,
        category: parent.category ?? null,
        clientVisible: parent.clientVisible ?? false,
        source: "manual",
        parentTaskId: parent.id,
        createdByEmail: actorEmail,
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    if (projectId != null) {
      // In no section: a help task starts in backlog, which no section category names,
      // so it shows under "No section" on the board until someone moves it.
      await tx.execute(sql`UPDATE public.tasks SET project_id = ${projectId} WHERE id = ${child.id}`)
    }
    if (opts.trackAssignedBy) await writeAssignedBy(tx, child.id, assigneeEmail, actorEmail)

    const [comment] = await tx
      .insert(taskComments)
      .values({
        taskId: child.id,
        body: ask,
        authorEmail: actorEmail,
        authorName: actor.name ?? null,
        authorKind: "user",
      })
      .returning()

    await appendActivity(tx, {
      entityType: "task_comment",
      entityId: comment.id,
      actorEmail,
      action: "create",
      after: commentRowToApi(comment),
    })

    const parentValues: Partial<typeof tasks.$inferInsert> = {
      status: "waiting",
      helpRequestedByEmail: actorEmail,
      updatedAt: now,
    }
    if (parent.status !== "waiting") {
      parentValues.helpPriorStatus = parent.status
    }

    const [updatedParent] = await tx
      .update(tasks)
      .set(parentValues)
      .where(and(eq(tasks.id, parent.id), isNull(tasks.deletedAt)))
      .returning()
    // C-220 (B42): a project task moves to a Waiting section when its project has one.
    await followSectionRule(tx, parent.id, "waiting", actorEmail)

    const childApi = taskRowToApi(child)
    await appendActivity(tx, {
      entityType: "task",
      entityId: child.id,
      actorEmail,
      action: "create",
      after: childApi,
    })
    await appendActivity(tx, {
      entityType: "task",
      entityId: parent.id,
      actorEmail,
      action: `asked ${helperName} for help`,
    })

    const parentApi = taskRowToApi(updatedParent ?? parent)
    return {
      parent: await attachHelpGraph(tx, parentApi, actorEmail),
      child: await attachHelpGraph(tx, childApi, actorEmail),
    }
  })
}

async function maybeCompleteHelpParent(
  tx: DbExecutor,
  child: typeof tasks.$inferSelect,
  actorEmail: string | null,
  options?: { onlyWhenParentWaiting?: boolean }
): Promise<void> {
  const parentId = child.parentTaskId
  if (parentId == null) return

  const [parent] = await tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, parentId), isNull(tasks.deletedAt)))
    .limit(1)
  if (!parent) return
  if (options?.onlyWhenParentWaiting && parent.status !== "waiting") return

  const siblings = await tx
    .select({ id: tasks.id, status: tasks.status })
    .from(tasks)
    .where(
      and(
        eq(tasks.parentTaskId, parentId),
        isNull(tasks.deletedAt),
        ne(tasks.id, child.id),
        await helpChildCondition(tx)
      )
    )
  const otherOpen = siblings.some((row) => isOpenHelpChildStatus(row.status))
  if (otherOpen) return

  const restoreStatus =
    parent.helpPriorStatus?.trim() || "in_progress"
  const now = new Date().toISOString()
  await tx
    .update(tasks)
    .set({
      status: restoreStatus,
      helpPriorStatus: null,
      updatedAt: now,
    })
    .where(and(eq(tasks.id, parentId), isNull(tasks.deletedAt)))
  // C-220 (B42): a project parent follows its status to a section (NOWAIT: we
  // are inside the child's write, see sectionSync.ts).
  await followSectionRule(tx, parentId, restoreStatus, actorEmail, { nowait: true })

  const [lastComment] = await tx
    .select()
    .from(taskComments)
    .where(eq(taskComments.taskId, child.id))
    .orderBy(desc(taskComments.createdAt), desc(taskComments.id))
    .limit(1)

  const helperName =
    child.assigneeName?.trim() || child.assigneeEmail?.trim() || "someone"
  if (lastComment?.body?.trim()) {
    const [copied] = await tx
      .insert(taskComments)
      .values({
        taskId: parentId,
        body: `${helperName}: ${lastComment.body.trim()}`,
        authorEmail: child.assigneeEmail?.trim().toLowerCase() || null,
        authorName: child.assigneeName ?? null,
        authorKind: "user",
      })
      .returning()
    await appendActivity(tx, {
      entityType: "task_comment",
      entityId: copied.id,
      actorEmail: actorEmail?.toLowerCase() ?? null,
      action: "create",
      after: commentRowToApi(copied),
    })
  }

  await appendActivity(tx, {
    entityType: "task",
    entityId: parentId,
    actorEmail: actorEmail?.toLowerCase() ?? null,
    action: `help from ${helperName} done`,
  })
}

/** Done help child moved back to an open status: parent returns to waiting. */
async function maybeRewaitHelpParent(
  tx: DbExecutor,
  child: typeof tasks.$inferSelect,
  actorEmail: string | null
): Promise<void> {
  const parentId = child.parentTaskId
  if (parentId == null) return

  const [parent] = await tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, parentId), isNull(tasks.deletedAt)))
    .limit(1)
  if (!parent || parent.status === "waiting") return

  const now = new Date().toISOString()
  await tx
    .update(tasks)
    .set({
      status: "waiting",
      helpPriorStatus: parent.status,
      updatedAt: now,
    })
    .where(and(eq(tasks.id, parentId), isNull(tasks.deletedAt)))
  await followSectionRule(tx, parentId, "waiting", actorEmail, { nowait: true })

  const helperName =
    child.assigneeName?.trim() || child.assigneeEmail?.trim() || "someone"
  await appendActivity(tx, {
    entityType: "task",
    entityId: parentId,
    actorEmail: actorEmail?.toLowerCase() ?? null,
    action: `help from ${helperName} reopened`,
  })
}

async function softDeleteLiveTask(
  tx: DbExecutor,
  id: number,
  actorEmail: string | null
): Promise<boolean> {
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

    if (
      before.parentTaskId != null &&
      isOpenHelpChildStatus(before.status) &&
      !(await isSubtaskRow(tx, id))
    ) {
      await maybeCompleteHelpParent(tx, before, actorEmail, {
        onlyWhenParentWaiting: true,
      })
    }
    await softDeleteSubtasksOf(tx, id, deletedAt, actorEmail)
    return true
}

/** B40: a task's live subtasks go with it (after 0118; before it there are none). */
async function softDeleteSubtasksOf(
  tx: DbExecutor,
  parentId: number,
  deletedAt: string,
  actorEmail: string | null
): Promise<void> {
  if (!(await isProjectsMigrationApplied(tx))) return
  const rows = executeRows(
    await tx.execute(sql`
      UPDATE public.tasks SET deleted_at = ${deletedAt}, updated_at = ${deletedAt}
       WHERE parent_task_id = ${parentId} AND task_type = 'subtask' AND deleted_at IS NULL
       RETURNING id
    `)
  )
  for (const r of rows) {
    await appendActivity(tx, {
      entityType: "task",
      entityId: Number(r.id),
      actorEmail: actorEmail?.toLowerCase() ?? null,
      action: "soft_delete",
      after: { deleted_at: deletedAt, with_parent: parentId },
    })
  }
}

export async function softDeleteTask(
  id: number,
  actorEmail: string | null,
  database: Db = db
): Promise<boolean> {
  return database.transaction((tx) => softDeleteLiveTask(tx, id, actorEmail))
}

/**
 * A bulk task's failure as CodexBulkError: a CodexBulkError stays as it is;
 * anything else is 400 naming the task. Also used by the projects store's
 * bulk path (`bulkUpdateTasksThroughSections`).
 */
export function bulkFailure(id: number, error: unknown): CodexBulkError {
  if (error instanceof CodexBulkError) return error
  // F5 (B42fix): a refusal, not a bad request.
  if (error instanceof AssigneeNoAccessError) return new CodexBulkError(id, 409, `Task ${id}: ${error.message}`)
  const message = error instanceof Error ? error.message : String(error)
  return new CodexBulkError(id, 400, message)
}

/** One transaction: every update and its activity row, or nothing. */
export async function bulkUpdateTasks(
  ids: number[],
  patch: UpdateTaskInput,
  actorEmail: string | null,
  database: Db = db
): Promise<CodexTask[]> {
  return database.transaction(async (tx) => {
    const updated: CodexTask[] = []
    for (const id of ids) {
      try {
        const task = await updateLiveTask(tx, id, patch, actorEmail)
        if (!task) {
          throw new CodexBulkError(id, 409, `Task ${id} was not found.`)
        }
        updated.push(task)
      } catch (error) {
        throw bulkFailure(id, error)
      }
    }
    return updated
  })
}

/** One transaction: every soft delete and its activity row, or nothing. */
export async function bulkSoftDeleteTasks(
  ids: number[],
  actorEmail: string | null,
  database: Db = db
): Promise<number[]> {
  return database.transaction(async (tx) => {
    for (const id of ids) {
      try {
        const ok = await softDeleteLiveTask(tx, id, actorEmail)
        if (!ok) {
          throw new CodexBulkError(id, 409, `Task ${id} was not found.`)
        }
      } catch (error) {
        throw bulkFailure(id, error)
      }
    }
    return ids
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

function aliasesFromJson(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

function toAliasRosterRow(row: {
  email: string
  name: string
  emailAliases: unknown
  active: boolean
}): AliasRosterRow {
  return {
    email: row.email,
    name: row.name,
    aliases: aliasesFromJson(row.emailAliases),
    active: row.active,
  }
}

async function loadAliasRoster(
  database: Pick<Db, "select">
): Promise<AliasRosterRow[]> {
  const rows = await database
    .select({
      email: teamMembers.email,
      name: teamMembers.name,
      emailAliases: teamMembers.emailAliases,
      active: teamMembers.active,
    })
    .from(teamMembers)
  return rows.map(toAliasRosterRow)
}

export async function listEmailAliasCollisions(
  database: Db = db
): Promise<AliasCollision[]> {
  const roster = await loadAliasRoster(database)
  return listAliasCollisions(roster)
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
    const aliases = (input.emailAliases ?? [])
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean)
    if (aliases.length > 0) {
      const roster = await loadAliasRoster(tx as unknown as Db)
      assertNewAliasesAvailable(aliases, roster, email)
    }
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
        emailAliases: aliases,
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
    if (patch.emailAliases !== undefined) {
      const aliases = patch.emailAliases
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean)
      const ownerEmail = (
        patch.email !== undefined ? patch.email : before.email
      )
        .trim()
        .toLowerCase()
      const roster = await loadAliasRoster(tx as unknown as Db)
      assertNewAliasesAvailable(aliases, roster, ownerEmail)
      values.emailAliases = aliases
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

function normaliseTemplateLabel(label: unknown): string {
  if (typeof label !== "string" || label.trim().length === 0) {
    throw new TemplateLabelError("Checklist labels cannot be empty.")
  }
  const trimmed = label.trim()
  if (trimmed.length > TEMPLATE_LABEL_MAX) {
    throw new TemplateLabelError(
      `Checklist labels must be ${TEMPLATE_LABEL_MAX} characters or fewer.`
    )
  }
  return trimmed
}

function normaliseTemplateItemWrites(
  items: TemplateItemWrite[]
): Array<{ id: number | null; label: string }> {
  const seen = new Set<number>()
  return items.map((item, index) => {
    const label = normaliseTemplateLabel(item?.label)
    if (item?.id == null) {
      return { id: null, label }
    }
    const id = Number(item.id)
    if (!Number.isInteger(id) || id < 1) {
      throw new TemplateLabelError(
        `items[${index}].id must be a positive integer.`
      )
    }
    if (seen.has(id)) {
      throw new TemplateLabelError(`Duplicate checklist item id ${id}.`)
    }
    seen.add(id)
    return { id, label }
  })
}

export async function createTemplate(
  input: CreateTemplateInput,
  actorEmail: string | null,
  database: Db = db
): Promise<TaskTemplate | null> {
  const name = input.name.trim()
  if (!name) return null
  const labels = (input.items ?? []).map((item) =>
    normaliseTemplateLabel(item?.label)
  )

  return database.transaction(async (tx) => {
    const [row] = await tx
      .insert(taskTemplates)
      .values({
        name,
        description: input.description?.trim() || null,
      })
      .returning()
    const api = templateRowToApi(row)
    const actor = actorEmail?.toLowerCase() ?? null
    await appendActivity(tx, {
      entityType: "task_template",
      entityId: api.id,
      actorEmail: actor,
      action: "create",
      after: api,
    })
    const items: TaskTemplateItem[] = []
    for (let index = 0; index < labels.length; index += 1) {
      const [itemRow] = await tx
        .insert(taskTemplateItems)
        .values({
          templateId: api.id,
          label: labels[index]!,
          sort: index,
        })
        .returning()
      const item = templateItemRowToApi(itemRow)
      items.push(item)
      await appendActivity(tx, {
        entityType: "task_template_item",
        entityId: item.id,
        actorEmail: actor,
        action: "create",
        after: item,
      })
    }
    return { ...api, items }
  })
}

export async function updateTemplate(
  id: number,
  patch: UpdateTemplateInput,
  actorEmail: string | null,
  database: Db = db
): Promise<TaskTemplate | null> {
  const name = patch.name !== undefined ? patch.name.trim() : undefined
  if (name !== undefined && !name) return null
  const nextItems =
    patch.items !== undefined
      ? normaliseTemplateItemWrites(patch.items)
      : undefined

  if (nextItems) {
    const [existingTemplate] = await database
      .select({ id: taskTemplates.id })
      .from(taskTemplates)
      .where(eq(taskTemplates.id, id))
      .limit(1)
    if (!existingTemplate) return null
    const existingIds = new Set(
      (
        await database
          .select({ id: taskTemplateItems.id })
          .from(taskTemplateItems)
          .where(eq(taskTemplateItems.templateId, id))
      ).map((row) => row.id)
    )
    for (const item of nextItems) {
      if (item.id != null && !existingIds.has(item.id)) {
        throw new TemplateLabelError(
          `Checklist item ${item.id} does not belong to this template.`
        )
      }
    }
  }

  return database.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(taskTemplates)
      .where(eq(taskTemplates.id, id))
      .limit(1)
    if (!before) return null

    const actor = actorEmail?.toLowerCase() ?? null
    const values: Partial<typeof taskTemplates.$inferInsert> = {}
    if (name !== undefined) values.name = name
    if (patch.description !== undefined) {
      values.description = patch.description?.trim() || null
    }

    let templateRow = before
    if (Object.keys(values).length > 0) {
      const [row] = await tx
        .update(taskTemplates)
        .set(values)
        .where(eq(taskTemplates.id, id))
        .returning()
      if (!row) return null
      templateRow = row
      await appendActivity(tx, {
        entityType: "task_template",
        entityId: id,
        actorEmail: actor,
        action: "update",
        before: templateRowToApi(before),
        after: templateRowToApi(row),
      })
    }

    if (nextItems) {
      const existing = await tx
        .select()
        .from(taskTemplateItems)
        .where(eq(taskTemplateItems.templateId, id))
        .orderBy(asc(taskTemplateItems.sort), asc(taskTemplateItems.id))
      const byId = new Map(existing.map((row) => [row.id, row]))
      const kept = new Set<number>()
      const orderedIds: number[] = []

      for (let index = 0; index < nextItems.length; index += 1) {
        const item = nextItems[index]!
        if (item.id != null) {
          const prior = byId.get(item.id)
          if (!prior) {
            throw new TemplateLabelError(
              `Checklist item ${item.id} does not belong to this template.`
            )
          }
          kept.add(item.id)
          orderedIds.push(item.id)
          const labelChanged = (prior.label ?? "") !== item.label
          const sortChanged = Number(prior.sort ?? 0) !== index
          if (labelChanged || sortChanged) {
            const [row] = await tx
              .update(taskTemplateItems)
              .set({ label: item.label, sort: index })
              .where(
                and(
                  eq(taskTemplateItems.id, item.id),
                  eq(taskTemplateItems.templateId, id)
                )
              )
              .returning()
            if (labelChanged && row) {
              await appendActivity(tx, {
                entityType: "task_template_item",
                entityId: item.id,
                actorEmail: actor,
                action: "update",
                before: templateItemRowToApi(prior),
                after: templateItemRowToApi(row),
              })
            }
          }
        } else {
          const [row] = await tx
            .insert(taskTemplateItems)
            .values({ templateId: id, label: item.label, sort: index })
            .returning()
          const created = templateItemRowToApi(row)
          orderedIds.push(created.id)
          await appendActivity(tx, {
            entityType: "task_template_item",
            entityId: created.id,
            actorEmail: actor,
            action: "create",
            after: created,
          })
        }
      }

      for (const prior of existing) {
        if (kept.has(prior.id)) continue
        await tx
          .delete(taskTemplateItems)
          .where(
            and(
              eq(taskTemplateItems.id, prior.id),
              eq(taskTemplateItems.templateId, id)
            )
          )
        await appendActivity(tx, {
          entityType: "task_template_item",
          entityId: prior.id,
          actorEmail: actor,
          action: "delete",
          before: templateItemRowToApi(prior),
        })
      }

      const previousIds = existing.map((row) => row.id)
      if (previousIds.join(",") !== orderedIds.join(",")) {
        await appendActivity(tx, {
          entityType: "task_template",
          entityId: id,
          actorEmail: actor,
          action: "reorder_items",
          after: { ordered_ids: orderedIds },
        })
      }
    }

    const api = templateRowToApi(templateRow)
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
  mbaNumber: string | null
  estimatedMinutes: number | null
  createdAt: string
  createdByEmail: string | null
}

/** Live series seeds: open (not done), not soft-deleted, rule + template + client. */
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
      mbaNumber: tasks.mbaNumber,
      createdAt: tasks.createdAt,
      createdByEmail: tasks.createdByEmail,
    })
    .from(tasks)
    .where(
      and(
        isNull(tasks.deletedAt),
        ne(tasks.status, "done"),
        isNotNull(tasks.recurringRule),
        isNotNull(tasks.templateId),
        isNotNull(tasks.clientId)
      )
    )

  const eligible = rows.filter(
    (r) =>
      r.recurringRule &&
      r.templateId != null &&
      r.clientId != null &&
      Number(r.clientId) > 0 &&
      Number(r.templateId) > 0
  )
  const minutes = await estimatedMinutesByTaskId(
    database,
    eligible.map((r) => r.id)
  )

  return eligible.map((r) => ({
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
    mbaNumber: r.mbaNumber,
    estimatedMinutes: minutes.get(r.id) ?? null,
    createdAt: r.createdAt,
    createdByEmail: r.createdByEmail,
  }))
}

/**
 * Idempotency: live instance with the same (seed task id, period).
 * Soft-deleted instances do not block regeneration.
 */
export async function findGeneratedRecurringTask(
  seedId: number,
  period: string,
  database: Db = db
): Promise<CodexTask | null> {
  const seedIdNum = Math.trunc(Number(seedId))
  if (!Number.isFinite(seedIdNum) || seedIdNum < 1) return null
  const marker = formatPeriodMarker(period)
  const needle = formatSeedMarker(seedIdNum)
  const rows = await database
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.source, "recurring"),
        isNull(tasks.deletedAt),
        like(tasks.description, `${marker}%`),
        like(tasks.description, `%${needle}%`)
      )
    )
    .limit(20)

  for (const row of rows) {
    if (
      descriptionHasPeriod(row.description, period) &&
      descriptionHasSeed(row.description, seedIdNum)
    ) {
      const api = taskRowToApi(row)
      const [withEst] = await applyEstimatedMinutes(database, [api])
      return withEst ?? api
    }
  }
  return null
}

/** Latest live instance due date for a seed, or null when none exist. */
export async function latestRecurringInstanceDueYmd(
  seedId: number,
  database: Db = db
): Promise<string | null> {
  const seedIdNum = Math.trunc(Number(seedId))
  if (!Number.isFinite(seedIdNum) || seedIdNum < 1) return null
  const needle = formatSeedMarker(seedIdNum)
  const rows = await database
    .select({ dueDate: tasks.dueDate, description: tasks.description })
    .from(tasks)
    .where(
      and(
        eq(tasks.source, "recurring"),
        isNull(tasks.deletedAt),
        like(tasks.description, `%${needle}%`)
      )
    )

  let latest: string | null = null
  for (const row of rows) {
    if (!descriptionHasSeed(row.description, seedIdNum)) continue
    const ymd = toSydneyCivilYmd(row.dueDate)
    if (!ymd) continue
    if (!latest || ymd > latest) latest = ymd
  }
  return latest
}

export type CreateGeneratedRecurringInput = {
  seedTaskId: number
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
  mbaNumber?: string | null
  estimatedMinutes?: number | null
  createdByEmail: string
}

/** P1 (PACK3fix): why a period instance was not made (nothing was written). */
export type RecurringSkipReason = "seed_gone" | "assignee_no_access"

export class RecurringCopySkipped extends Error {
  constructor(
    readonly seedTaskId: number,
    readonly reason: RecurringSkipReason
  ) {
    super(`recurring seed ${seedTaskId}: ${reason}`)
    this.name = "RecurringCopySkipped"
  }
}

/**
 * Create one period instance. Caller must check idempotency first.
 * Checklist copied from template; source=recurring; no recurring_rule on child.
 *
 * P1 (PACK3fix): the instance copies the seed's title and description, so it
 * lives in the seed's project (and so has its privacy), placed by the section
 * rule for to do (the first To do section, else "No section"). The seed's
 * project and row are locked first (`lockTaskAndProject`), so a board move
 * cannot slip in between. A seed in a private project whose assignee can no
 * longer see it makes nothing (`assignee_no_access`, F5: a private task goes
 * only to someone who can see it); a seed deleted since it was listed makes
 * nothing (`seed_gone`). Both throw `RecurringCopySkipped`, the transaction
 * rolls back, and the next run catches the period up once fixed.
 */
export async function createGeneratedRecurringTask(
  input: CreateGeneratedRecurringInput,
  database: Db = db
): Promise<CodexTask> {
  const description = descriptionWithPeriod(
    input.period,
    input.description,
    input.seedTaskId
  )

  return database.transaction(async (tx) => {
    const seed = await lockTaskAndProject(tx, input.seedTaskId)
    if (!seed.found) throw new RecurringCopySkipped(input.seedTaskId, "seed_gone")
    const assigneeEmail = input.assigneeEmail?.trim().toLowerCase() || null
    if (seed.projectId != null && assigneeEmail) {
      const [refused] = await emailsWithoutProjectAccess(tx, seed.projectId, [assigneeEmail])
      if (refused) throw new RecurringCopySkipped(input.seedTaskId, "assignee_no_access")
    }
    const now = new Date().toISOString()
    const [row] = await tx
      .insert(tasks)
      .values({
        title: input.title,
        clientId: input.clientId,
        description,
        status: "todo",
        priority: input.priority ?? "normal",
        assigneeEmail,
        assigneeName: input.assigneeName ?? null,
        dueDate: input.dueYmd,
        mbaNumber: input.mbaNumber ?? null,
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

    if (seed.projectId != null) {
      // Raw SQL: project_id is not mirrored (C-210). In no section, then the section rule for to do.
      await tx.execute(sql`UPDATE public.tasks SET project_id = ${seed.projectId} WHERE id = ${row.id}`)
      await followSectionRule(tx, row.id, "todo", SYSTEM_ACTORS.recurring)
    }

    const api = taskRowToApi(row)
    if (
      input.estimatedMinutes != null &&
      Number.isFinite(input.estimatedMinutes)
    ) {
      const minutes = Math.round(input.estimatedMinutes)
      const wrote = await writeTaskEstimatedMinutes(tx, row.id, minutes)
      if (wrote) api.estimated_minutes = minutes
    }

    await copyTemplateItemsToTask(tx, row.id, input.templateId, null)

    await appendActivity(tx, {
      entityType: "task",
      entityId: row.id,
      actorEmail: SYSTEM_ACTORS.recurring,
      actorKind: "system",
      action: "create",
      after: {
        ...api,
        period: input.period,
      },
    })
    return api
  })
}
