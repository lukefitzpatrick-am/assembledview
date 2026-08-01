import "server-only"

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  or,
  type SQL,
} from "drizzle-orm"
import { db, schema, type Db } from "@/db"
import { clampPage, clampPerPage, parseStatusFilter } from "@/lib/codex/queryHelpers"
import type {
  CodexPagedResponse,
  CodexTask,
  TeamMember,
} from "@/lib/codex/types"

export { clampPerPage, parseStatusFilter } from "@/lib/codex/queryHelpers"

const { tasks, clientNotes, teamMembers, codexActivity } = schema

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
    deleted_at: row.deletedAt,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}

async function appendActivity(
  database: Db,
  args: {
    entityType: string
    entityId: number
    actorEmail: string | null
    action: string
    before?: unknown
    after?: unknown
  }
): Promise<void> {
  await database.insert(codexActivity).values({
    entityType: args.entityType,
    entityId: args.entityId,
    actorEmail: args.actorEmail,
    actorKind: "user",
    action: args.action,
    before: args.before ?? null,
    after: args.after ?? null,
  })
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

  return pagedEnvelope(rows.map(taskRowToApi), itemsTotal, page, perPage)
}

export async function getTask(
  id: number,
  database: Db = db
): Promise<CodexTask | null> {
  const [row] = await database.select().from(tasks).where(eq(tasks.id, id)).limit(1)
  if (!row || row.deletedAt) return null
  return taskRowToApi(row)
}

export async function createTask(
  input: CreateTaskInput,
  actorEmail: string | null = input.createdByEmail,
  database: Db = db
): Promise<CodexTask> {
  const now = new Date().toISOString()
  const [row] = await database
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
      source: input.source?.trim() || "manual",
      createdByEmail: input.createdByEmail.trim().toLowerCase(),
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  await appendActivity(database, {
    entityType: "task",
    entityId: row.id,
    actorEmail: actorEmail?.toLowerCase() ?? null,
    action: "create",
    after: taskRowToApi(row),
  })
  return taskRowToApi(row)
}

export async function updateTask(
  id: number,
  patch: UpdateTaskInput,
  actorEmail: string | null,
  database: Db = db
): Promise<CodexTask | null> {
  const [before] = await database.select().from(tasks).where(eq(tasks.id, id)).limit(1)
  if (!before || before.deletedAt) return null

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

  const [row] = await database
    .update(tasks)
    .set(values)
    .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
    .returning()
  if (!row) return null

  await appendActivity(database, {
    entityType: "task",
    entityId: id,
    actorEmail: actorEmail?.toLowerCase() ?? null,
    action: "update",
    before: taskRowToApi(before),
    after: taskRowToApi(row),
  })
  return taskRowToApi(row)
}

export async function softDeleteTask(
  id: number,
  actorEmail: string | null,
  database: Db = db
): Promise<boolean> {
  const [before] = await database.select().from(tasks).where(eq(tasks.id, id)).limit(1)
  if (!before || before.deletedAt) return false

  const deletedAt = new Date().toISOString()
  const [row] = await database
    .update(tasks)
    .set({ deletedAt, updatedAt: deletedAt })
    .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
    .returning()
  if (!row) return false

  await appendActivity(database, {
    entityType: "task",
    entityId: id,
    actorEmail: actorEmail?.toLowerCase() ?? null,
    action: "soft_delete",
    before: taskRowToApi(before),
    after: { ...taskRowToApi(row), deleted_at: deletedAt },
  })
  return true
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

export async function createTeamMember(
  input: CreateTeamMemberInput,
  actorEmail: string | null,
  database: Db = db
): Promise<TeamMember> {
  const now = new Date().toISOString()
  const email = input.email.trim().toLowerCase()
  const [row] = await database
    .insert(teamMembers)
    .values({
      email,
      name: input.name.trim(),
      roleTitle: input.roleTitle ?? null,
      active: input.active ?? true,
      capacityNotes: input.capacityNotes ?? null,
      workingStyle: input.workingStyle ?? null,
      defaultClientIds: input.defaultClientIds ?? [],
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  await appendActivity(database, {
    entityType: "team_member",
    entityId: row.id,
    actorEmail: actorEmail?.toLowerCase() ?? null,
    action: "create",
    after: teamRowToApi(row),
  })
  return teamRowToApi(row)
}

export async function updateTeamMember(
  id: number,
  patch: UpdateTeamMemberInput,
  actorEmail: string | null,
  database: Db = db
): Promise<TeamMember | null> {
  const [before] = await database
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

  const [row] = await database
    .update(teamMembers)
    .set(values)
    .where(eq(teamMembers.id, id))
    .returning()
  if (!row) return null

  await appendActivity(database, {
    entityType: "team_member",
    entityId: id,
    actorEmail: actorEmail?.toLowerCase() ?? null,
    action: "update",
    before: teamRowToApi(before),
    after: teamRowToApi(row),
  })
  return teamRowToApi(row)
}

