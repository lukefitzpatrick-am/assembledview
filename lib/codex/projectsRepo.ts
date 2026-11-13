/**
 * Codex projects and sections store (S1, B38). Every function reads or writes
 * the 0118 tables and tasks columns only once the marker 0118_codex_s1_projects
 * exists (C-76), and treats a missing table or column as "not applied" too, so
 * a route answers 503 migration_not_applied, never a 500.
 *
 * The new tasks columns (project_id, section_id, sort_order) are not in the
 * Drizzle tasks mirror until 0118 is applied (C-210), so this file reads and
 * writes them with raw SQL.
 *
 * Access (plan section 13, after the route's switch, session and staff
 * gates): a private project is visible to its owner, creator and members
 * only; to anyone else it is not found (existence not confirmed). Changing
 * private, owner or members is for the owner or creator. The rules live in
 * lib/codex/projects.ts.
 */
import "server-only"

import { and, asc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm"

import { db, schema, type Db } from "@/db"
import { codexClientExists } from "@/lib/codex/clientExists"
import { executeRows } from "@/lib/codex/estimatedMinutesColumn"
import {
  canSeeProject,
  checkDeleteSection,
  orderAfterPlacement,
  planStatusChangeInProject,
  statusForSectionCategory,
  checkRecategorise,
  checkReorder,
  initialSectionDrafts,
  isProjectOwner,
  isProjectKind,
  isProjectStatus,
  isSectionStatusCategory,
  normaliseEmail,
  planCompleteInProject,
  planSectionMove,
  sortSections,
  touchesProjectAccess,
  SECTIONS_PER_PROJECT_MAX,
  MEMBERS_PER_PROJECT_MAX,
  type CodexProject,
  type CodexSection,
  type CreateProjectInput,
  type CreateSectionInput,
  type MoveTaskInput,
  type ProjectStatus,
  type SectionMovePlan,
  type UpdateProjectInput,
  type UpdateSectionInput,
} from "@/lib/codex/projects"
import { projectBoardScope } from "@/lib/codex/projectBoard"
import {
  applyCustomValuesPatch,
  readCardFields,
  readStoredOptions,
  readStoredValues,
  isBuiltFieldType,
  type CardFieldSetting,
  type CodexCustomField,
  type CustomValues,
} from "@/lib/codex/customFields"
import { checkTaskDates, checkTaskTypeChange, type TaskDetailPatch } from "@/lib/codex/taskDetail"
import { forgetProjectsMarker, isProjectsMigrationApplied } from "@/lib/codex/projectsMarker"
import {
  bulkFailure,
  CodexBulkError,
  loadListTasksByIds,
  updateTask,
  updateTaskInTx,
  updateTaskStatusInTx,
  type DbExecutor,
  type UpdateTaskInput,
} from "@/lib/codex/repo"
import type { CodexTask } from "@/lib/codex/types"

const { codexProjects, codexProjectMembers, codexSections, codexActivity, codexBoardConfigs, codexCustomFields } = schema

export {
  PROJECTS_MARKER,
  PROJECTS_MARKER_RECHECK_MS,
  isProjectsMigrationApplied,
  resetProjectsMarkerCacheForTests,
} from "@/lib/codex/projectsMarker"

export class ProjectsUnavailableError extends Error {
  readonly code = "PROJECTS_UNAVAILABLE"
  constructor() {
    super("Codex projects are not set up yet (migration 0118 not applied)")
    this.name = "ProjectsUnavailableError"
  }
}

export type ProjectFailureReason =
  | "not_found"
  | "task_not_found"
  | "not_owner"
  | "unknown_client"
  | "mba_taken"
  | "invalid_order"
  | "too_many_sections"
  | "too_many_members"
  | "other_project"
  | "last_done_section"
  | "section_not_empty"
  | "no_done_section"
  | "no_section_for_status"
  | "anchor_not_in_section"
  | "task_changed"
  // B40
  | "subtask_not_on_board"
  | "start_after_due"
  | "task_type_fixed"
  | "not_in_project"
  | "unknown_field"
  | "invalid_value"
  | "nested_subtask"
  | "too_many_subtasks"
  | "option_in_use"
  | "field_has_values"
  | "unknown_option"
  | "invalid_done_option"
  | "too_many_fields"

export type ProjectFailure = { ok: false; reason: ProjectFailureReason; message: string }

const NOT_FOUND: ProjectFailure = { ok: false, reason: "not_found", message: "Project not found." }
const SECTION_NOT_FOUND: ProjectFailure = { ok: false, reason: "not_found", message: "Section not found." }
const TASK_NOT_FOUND: ProjectFailure = { ok: false, reason: "task_not_found", message: "Task not found." }
const NOT_OWNER: ProjectFailure = {
  ok: false,
  reason: "not_owner",
  message: "Only the project owner or the person who created it can change who sees it.",
}

type ProjectRow = typeof codexProjects.$inferSelect
type SectionRow = typeof codexSections.$inferSelect

function errorChain(err: unknown): unknown[] {
  const out: unknown[] = []
  let cur: unknown = err
  for (let i = 0; cur != null && i < 5; i += 1) {
    out.push(cur)
    cur = (cur as { cause?: unknown }).cause
  }
  return out
}

/** Postgres 42P01 (undefined table) or 42703 (undefined column). */
export function isMissingProjectsSchema(err: unknown): boolean {
  return errorChain(err).some((e) => {
    const code = (e as { code?: unknown })?.code
    return code === "42P01" || code === "42703"
  })
}

function isUniqueViolation(err: unknown, constraint: string): boolean {
  return errorChain(err).some((e) => {
    const rec = e as { code?: unknown; constraint_name?: unknown; constraint?: unknown; message?: unknown }
    if (rec?.code !== "23505") return false
    const name = String(rec.constraint_name ?? rec.constraint ?? rec.message ?? "")
    return name.includes(constraint)
  })
}

function isMissingColumnOnly(err: unknown): boolean {
  const codes = errorChain(err).map((e) => (e as { code?: unknown })?.code)
  return codes.includes("42703") && !codes.includes("42P01")
}

/**
 * Marker first, then the query. A missing table mid-query (42P01) is "not
 * applied" (503) and drops the cached marker, so the next call reads it
 * again. A missing column (42703) is "not applied" only while the marker is
 * missing on a fresh read (STACKfix, stack review N2): with the marker in
 * place it is a real bug (a column typo), so the error is thrown as it is
 * (500) and the marker stays cached.
 */
export async function guarded<T>(database: Db, run: () => Promise<T>): Promise<T> {
  if (!(await isProjectsMigrationApplied(database))) throw new ProjectsUnavailableError()
  try {
    return await run()
  } catch (err) {
    if (isMissingProjectsSchema(err)) {
      forgetProjectsMarker()
      if (isMissingColumnOnly(err) && (await isProjectsMigrationApplied(database))) throw err
      throw new ProjectsUnavailableError()
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// Row mapping and loading
// ---------------------------------------------------------------------------

export function projectRowToApi(row: ProjectRow, members: readonly string[]): CodexProject {
  return {
    id: Number(row.id),
    kind: isProjectKind(row.kind) ? row.kind : "internal",
    client_id: row.clientId == null ? null : Number(row.clientId),
    mba_number: row.mbaNumber ?? null,
    name: row.name,
    owner_email: row.ownerEmail ?? null,
    is_private: Boolean(row.isPrivate),
    status: isProjectStatus(row.status) ? row.status : "active",
    start_on: row.startOn ?? null,
    due_on: row.dueOn ?? null,
    created_by_email: row.createdByEmail,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    members: [...members].sort(),
  }
}

export function sectionRowToApi(row: SectionRow): CodexSection {
  return {
    id: Number(row.id),
    project_id: Number(row.projectId),
    name: row.name,
    sort_order: Number(row.sortOrder),
    collapsed_default: Boolean(row.collapsedDefault),
    status_category: isSectionStatusCategory(row.statusCategory) ? row.statusCategory : "todo",
  }
}

async function loadMembers(database: DbExecutor, projectId: number): Promise<string[]> {
  const rows = await database
    .select({ email: codexProjectMembers.email })
    .from(codexProjectMembers)
    .where(eq(codexProjectMembers.projectId, projectId))
  return rows.map((r) => normaliseEmail(r.email))
}

export type VisibleProject = { row: ProjectRow; members: string[] }

/**
 * A live project the viewer may see, or null (missing, deleted, or private
 * and not theirs). `lock` takes the project row FOR UPDATE, which serialises
 * section and membership changes per project.
 */
export async function loadVisibleProject(
  database: DbExecutor,
  id: number,
  viewerEmail: string,
  lock = false
): Promise<VisibleProject | null> {
  const query = database
    .select()
    .from(codexProjects)
    .where(and(eq(codexProjects.id, id), isNull(codexProjects.deletedAt)))
    .limit(1)
  const [row] = lock ? await query.for("update") : await query
  if (!row) return null
  const members = await loadMembers(database, id)
  const facts = {
    is_private: Boolean(row.isPrivate),
    owner_email: row.ownerEmail,
    created_by_email: row.createdByEmail,
    members,
  }
  return canSeeProject(facts, viewerEmail) ? { row, members } : null
}

function ownerFacts(p: VisibleProject) {
  return {
    is_private: Boolean(p.row.isPrivate),
    owner_email: p.row.ownerEmail,
    created_by_email: p.row.createdByEmail,
    members: p.members,
  }
}

export async function loadSections(database: DbExecutor, projectId: number): Promise<CodexSection[]> {
  const rows = await database
    .select()
    .from(codexSections)
    .where(eq(codexSections.projectId, projectId))
    .orderBy(asc(codexSections.sortOrder), asc(codexSections.id))
  return rows.map(sectionRowToApi)
}

export async function appendActivity(
  database: DbExecutor,
  args: { entityType: string; entityId: number; actorEmail: string; action: string; before?: unknown; after?: unknown }
): Promise<void> {
  await database.insert(codexActivity).values({
    entityType: args.entityType,
    entityId: args.entityId,
    actorEmail: normaliseEmail(args.actorEmail) || null,
    actorKind: "user",
    action: args.action,
    before: args.before ?? null,
    after: args.after ?? null,
  })
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

/** SQL: the viewer may see this project row (public, owner, creator or member). */
function visibleTo(viewerEmail: string): SQL {
  const viewer = normaliseEmail(viewerEmail)
  return or(
    eq(codexProjects.isPrivate, false),
    sql`lower(${codexProjects.ownerEmail}) = ${viewer}`,
    sql`lower(${codexProjects.createdByEmail}) = ${viewer}`,
    sql`exists (select 1 from ${codexProjectMembers} m where m.project_id = ${codexProjects.id} and lower(m.email) = ${viewer})`
  ) as SQL
}

/** Live projects the viewer may see, by name. `status` narrows to one status. */
export async function listProjects(
  viewerEmail: string,
  options: { status?: ProjectStatus } = {},
  database: Db = db
): Promise<CodexProject[]> {
  return guarded(database, async () => {
    const where = and(
      isNull(codexProjects.deletedAt),
      visibleTo(viewerEmail),
      options.status ? eq(codexProjects.status, options.status) : undefined
    )
    const rows = await database
      .select()
      .from(codexProjects)
      .where(where)
      .orderBy(asc(sql`lower(${codexProjects.name})`), asc(codexProjects.id))
    if (rows.length === 0) return []
    const memberRows = await database
      .select({ projectId: codexProjectMembers.projectId, email: codexProjectMembers.email })
      .from(codexProjectMembers)
      .where(inArray(codexProjectMembers.projectId, rows.map((r) => r.id)))
    const byProject = new Map<number, string[]>()
    for (const m of memberRows) {
      const list = byProject.get(Number(m.projectId)) ?? []
      list.push(normaliseEmail(m.email))
      byProject.set(Number(m.projectId), list)
    }
    return rows.map((row) => projectRowToApi(row, byProject.get(Number(row.id)) ?? []))
  })
}

export type ProjectWithSections = { ok: true; project: CodexProject; sections: CodexSection[] }

export async function getProject(
  id: number,
  viewerEmail: string,
  database: Db = db
): Promise<ProjectWithSections | ProjectFailure> {
  return guarded(database, async () => {
    const p = await loadVisibleProject(database, id, viewerEmail)
    if (!p) return NOT_FOUND
    return { ok: true, project: projectRowToApi(p.row, p.members), sections: await loadSections(database, id) }
  })
}

export async function createProject(
  viewerEmail: string,
  input: CreateProjectInput,
  database: Db = db
): Promise<ProjectWithSections | ProjectFailure> {
  return guarded(database, async () => {
    const creator = normaliseEmail(viewerEmail)
    if (input.client_id != null && !(await codexClientExists(input.client_id, database))) {
      return { ok: false, reason: "unknown_client", message: `Client ${input.client_id} does not exist.` }
    }
    try {
      return await database.transaction(async (tx) => {
        const [row] = await tx
          .insert(codexProjects)
          .values({
            kind: input.kind,
            clientId: input.client_id,
            mbaNumber: input.mba_number,
            name: input.name,
            ownerEmail: input.owner_email ?? creator,
            isPrivate: input.is_private,
            startOn: input.start_on,
            dueOn: input.due_on,
            createdByEmail: creator,
          })
          .returning()
        const projectId = Number(row.id)
        if (input.members.length > 0) {
          await tx.insert(codexProjectMembers).values(input.members.map((email) => ({ projectId, email })))
        }
        const drafts = initialSectionDrafts(input.sections)
        const sectionRows = await tx
          .insert(codexSections)
          .values(drafts.map((d, i) => ({ projectId, name: d.name, sortOrder: i, statusCategory: d.status_category })))
          .returning()
        const project = projectRowToApi(row, input.members)
        const sections = sortSections(sectionRows.map(sectionRowToApi))
        await appendActivity(tx, {
          entityType: "codex_project",
          entityId: projectId,
          actorEmail: creator,
          action: "create",
          after: { ...project, sections: sections.map((s) => ({ name: s.name, status_category: s.status_category })) },
        })
        return { ok: true as const, project, sections }
      })
    } catch (err) {
      if (isUniqueViolation(err, "uq_codex_projects_mba")) {
        return { ok: false, reason: "mba_taken", message: `Another project already uses MBA ${input.mba_number}.` }
      }
      throw err
    }
  })
}

export async function updateProject(
  id: number,
  viewerEmail: string,
  patch: UpdateProjectInput,
  database: Db = db
): Promise<{ ok: true; project: CodexProject } | ProjectFailure> {
  return guarded(database, () =>
    database.transaction(async (tx) => {
      const p = await loadVisibleProject(tx, id, viewerEmail, true)
      if (!p) return NOT_FOUND
      if (touchesProjectAccess(patch) && !isProjectOwner(ownerFacts(p), viewerEmail)) return NOT_OWNER
      const set: Partial<typeof codexProjects.$inferInsert> = { updatedAt: new Date().toISOString() }
      if (patch.name !== undefined) set.name = patch.name
      if (patch.status !== undefined) set.status = patch.status
      if (patch.is_private !== undefined) set.isPrivate = patch.is_private
      if (patch.owner_email !== undefined) set.ownerEmail = patch.owner_email
      const [row] = await tx.update(codexProjects).set(set).where(eq(codexProjects.id, id)).returning()
      const before = projectRowToApi(p.row, p.members)
      const after = projectRowToApi(row, p.members)
      await appendActivity(tx, { entityType: "codex_project", entityId: id, actorEmail: viewerEmail, action: "update", before, after })
      return { ok: true as const, project: after }
    })
  )
}

/** Add members (owner or creator only). Already-members are ignored. */
export async function addProjectMembers(
  id: number,
  viewerEmail: string,
  emails: readonly string[],
  database: Db = db
): Promise<{ ok: true; project: CodexProject } | ProjectFailure> {
  return guarded(database, () =>
    database.transaction(async (tx) => {
      const p = await loadVisibleProject(tx, id, viewerEmail, true)
      if (!p) return NOT_FOUND
      if (!isProjectOwner(ownerFacts(p), viewerEmail)) return NOT_OWNER
      const fresh = [...new Set(emails.map(normaliseEmail))].filter((e) => e && !p.members.includes(e))
      if (p.members.length + fresh.length > MEMBERS_PER_PROJECT_MAX) {
        return { ok: false, reason: "too_many_members", message: `A project can have up to ${MEMBERS_PER_PROJECT_MAX} members.` }
      }
      if (fresh.length > 0) {
        await tx
          .insert(codexProjectMembers)
          .values(fresh.map((email) => ({ projectId: id, email })))
          .onConflictDoNothing()
        await appendActivity(tx, { entityType: "codex_project", entityId: id, actorEmail: viewerEmail, action: "members_add", after: { members: fresh } })
      }
      return { ok: true as const, project: projectRowToApi(p.row, [...p.members, ...fresh]) }
    })
  )
}

/** Remove a member (owner or creator only). Removing a non-member is a no-op. */
export async function removeProjectMember(
  id: number,
  viewerEmail: string,
  email: string,
  database: Db = db
): Promise<{ ok: true; project: CodexProject } | ProjectFailure> {
  return guarded(database, () =>
    database.transaction(async (tx) => {
      const p = await loadVisibleProject(tx, id, viewerEmail, true)
      if (!p) return NOT_FOUND
      if (!isProjectOwner(ownerFacts(p), viewerEmail)) return NOT_OWNER
      const target = normaliseEmail(email)
      if (p.members.includes(target)) {
        await tx
          .delete(codexProjectMembers)
          .where(and(eq(codexProjectMembers.projectId, id), sql`lower(${codexProjectMembers.email}) = ${target}`))
        await appendActivity(tx, { entityType: "codex_project", entityId: id, actorEmail: viewerEmail, action: "members_remove", before: { members: [target] } })
      }
      return { ok: true as const, project: projectRowToApi(p.row, p.members.filter((m) => m !== target)) }
    })
  )
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export async function listSections(
  projectId: number,
  viewerEmail: string,
  database: Db = db
): Promise<{ ok: true; sections: CodexSection[] } | ProjectFailure> {
  return guarded(database, async () => {
    const p = await loadVisibleProject(database, projectId, viewerEmail)
    if (!p) return NOT_FOUND
    return { ok: true, sections: await loadSections(database, projectId) }
  })
}

/** A new section goes last. */
export async function createSection(
  projectId: number,
  viewerEmail: string,
  input: CreateSectionInput,
  database: Db = db
): Promise<{ ok: true; section: CodexSection } | ProjectFailure> {
  return guarded(database, () =>
    database.transaction(async (tx) => {
      const p = await loadVisibleProject(tx, projectId, viewerEmail, true)
      if (!p) return NOT_FOUND
      const sections = await loadSections(tx, projectId)
      if (sections.length >= SECTIONS_PER_PROJECT_MAX) {
        return { ok: false, reason: "too_many_sections", message: `A project can have up to ${SECTIONS_PER_PROJECT_MAX} sections.` }
      }
      const nextOrder = sections.reduce((m, s) => Math.max(m, s.sort_order), -1) + 1
      const [row] = await tx
        .insert(codexSections)
        .values({
          projectId,
          name: input.name,
          sortOrder: nextOrder,
          collapsedDefault: input.collapsed_default,
          statusCategory: input.status_category,
        })
        .returning()
      const section = sectionRowToApi(row)
      await appendActivity(tx, { entityType: "codex_section", entityId: section.id, actorEmail: viewerEmail, action: "create", after: section })
      return { ok: true as const, section }
    })
  )
}

/**
 * Rename, recategorise or set collapsed. Recategorising does not move or
 * re-status the tasks already in the section (they take the new category
 * the next time they move).
 */
export async function updateSection(
  projectId: number,
  sectionId: number,
  viewerEmail: string,
  patch: UpdateSectionInput,
  database: Db = db
): Promise<{ ok: true; section: CodexSection } | ProjectFailure> {
  return guarded(database, () =>
    database.transaction(async (tx) => {
      const p = await loadVisibleProject(tx, projectId, viewerEmail, true)
      if (!p) return NOT_FOUND
      const sections = await loadSections(tx, projectId)
      const before = sections.find((s) => s.id === sectionId)
      if (!before) return SECTION_NOT_FOUND
      if (patch.status_category !== undefined) {
        const rule = checkRecategorise(sections, sectionId, patch.status_category)
        if (!rule.ok) return rule
      }
      const set: Partial<typeof codexSections.$inferInsert> = {}
      if (patch.name !== undefined) set.name = patch.name
      if (patch.status_category !== undefined) set.statusCategory = patch.status_category
      if (patch.collapsed_default !== undefined) set.collapsedDefault = patch.collapsed_default
      const [row] = await tx
        .update(codexSections)
        .set(set)
        .where(and(eq(codexSections.id, sectionId), eq(codexSections.projectId, projectId)))
        .returning()
      const section = sectionRowToApi(row)
      await appendActivity(tx, { entityType: "codex_section", entityId: sectionId, actorEmail: viewerEmail, action: "update", before, after: section })
      return { ok: true as const, section }
    })
  )
}

async function countLiveTasksInSection(database: DbExecutor, sectionId: number): Promise<number> {
  const rows = executeRows(
    await database.execute(sql`
      SELECT count(*)::int AS n FROM public.tasks WHERE section_id = ${sectionId} AND deleted_at IS NULL
    `)
  )
  return Number(rows[0]?.n ?? 0) || 0
}

/** Only with no live tasks, and never the last done section. */
export async function deleteSection(
  projectId: number,
  sectionId: number,
  viewerEmail: string,
  database: Db = db
): Promise<{ ok: true } | ProjectFailure> {
  return guarded(database, () =>
    database.transaction(async (tx) => {
      const p = await loadVisibleProject(tx, projectId, viewerEmail, true)
      if (!p) return NOT_FOUND
      const sections = await loadSections(tx, projectId)
      const section = sections.find((s) => s.id === sectionId)
      if (!section) return SECTION_NOT_FOUND
      const rule = checkDeleteSection(sections, sectionId, await countLiveTasksInSection(tx, sectionId))
      if (!rule.ok) return rule
      await tx.delete(codexSections).where(and(eq(codexSections.id, sectionId), eq(codexSections.projectId, projectId)))
      await appendActivity(tx, { entityType: "codex_section", entityId: sectionId, actorEmail: viewerEmail, action: "delete", before: section })
      return { ok: true as const }
    })
  )
}

/** `orderedIds` names every section of the project once; sort_order becomes the index. */
export async function reorderSections(
  projectId: number,
  viewerEmail: string,
  orderedIds: readonly number[],
  database: Db = db
): Promise<{ ok: true; sections: CodexSection[] } | ProjectFailure> {
  return guarded(database, () =>
    database.transaction(async (tx) => {
      const p = await loadVisibleProject(tx, projectId, viewerEmail, true)
      if (!p) return NOT_FOUND
      const sections = await loadSections(tx, projectId)
      if (!checkReorder(sections.map((s) => s.id), orderedIds)) {
        return { ok: false, reason: "invalid_order", message: "ordered_ids must list every section of this project once." }
      }
      for (const [index, id] of orderedIds.entries()) {
        await tx
          .update(codexSections)
          .set({ sortOrder: index })
          .where(and(eq(codexSections.id, id), eq(codexSections.projectId, projectId)))
      }
      await appendActivity(tx, {
        entityType: "codex_project",
        entityId: projectId,
        actorEmail: viewerEmail,
        action: "sections_reorder",
        before: { ordered_ids: sections.map((s) => s.id) },
        after: { ordered_ids: orderedIds },
      })
      return { ok: true as const, sections: await loadSections(tx, projectId) }
    })
  )
}

// ---------------------------------------------------------------------------
// The section to status rule
// ---------------------------------------------------------------------------

type TaskPlacementRow = {
  id: number
  status: string
  project_id: number | null
  section_id: number | null
  sort_order: number | null
  task_type: string
  start_on: string | null
  due_on: string | null
  custom_values: CustomValues
}

async function lockLiveTask(database: DbExecutor, taskId: number): Promise<TaskPlacementRow | null> {
  const rows = executeRows(
    await database.execute(sql`
      SELECT id, status, project_id, section_id, sort_order, task_type,
             start_on::text AS start_on, due_on::text AS due_on, custom_values
        FROM public.tasks
       WHERE id = ${taskId} AND deleted_at IS NULL
       FOR UPDATE
    `)
  )
  const r = rows[0]
  if (!r) return null
  const num = (v: unknown) => (v == null ? null : Number(v))
  return {
    id: Number(r.id),
    status: String(r.status),
    project_id: num(r.project_id),
    section_id: num(r.section_id),
    sort_order: num(r.sort_order),
    task_type: typeof r.task_type === "string" ? r.task_type : "task",
    start_on: r.start_on == null ? null : String(r.start_on),
    due_on: r.due_on == null ? null : String(r.due_on),
    custom_values: readStoredValues(r.custom_values),
  }
}

const SUBTASK_NOT_ON_BOARD: ProjectFailure = {
  ok: false,
  reason: "subtask_not_on_board",
  message: "A subtask stays with its parent task and is not a card on the board.",
}

async function nextSortOrderInSection(database: DbExecutor, sectionId: number, taskId: number): Promise<number> {
  const rows = executeRows(
    await database.execute(sql`
      SELECT coalesce(max(sort_order), -1) + 1 AS n
        FROM public.tasks
       WHERE section_id = ${sectionId} AND deleted_at IS NULL AND id <> ${taskId}
    `)
  )
  return Number(rows[0]?.n ?? 0) || 0
}

export type TaskPlacementResult = {
  ok: true
  task: { id: number; status: string; project_id: number; section_id: number; sort_order: number }
}

/** Live task ids in a section, in board order (sort_order, then id). */
async function sectionTaskIds(database: DbExecutor, sectionId: number): Promise<number[]> {
  const rows = executeRows(
    await database.execute(sql`
      SELECT id FROM public.tasks
       WHERE section_id = ${sectionId} AND deleted_at IS NULL
       ORDER BY sort_order ASC NULLS LAST, id ASC
    `)
  )
  return rows.map((r) => Number(r.id))
}

/**
 * Write a section's card order as 0..n-1. Only rows whose order changes are
 * written; their updated_at is left alone (a reorder is not an edit).
 */
async function writeSectionOrder(database: DbExecutor, orderedIds: readonly number[], skipId: number): Promise<void> {
  const pairs = orderedIds.map((id, index) => ({ id, index })).filter((p) => p.id !== skipId)
  if (pairs.length === 0) return
  const values = sql.join(
    pairs.map((p) => sql`(${p.id}::bigint, ${p.index}::int)`),
    sql`, `
  )
  await database.execute(sql`
    UPDATE public.tasks t
       SET sort_order = v.ord
      FROM (VALUES ${values}) AS v(id, ord)
     WHERE t.id = v.id AND t.deleted_at IS NULL AND t.sort_order IS DISTINCT FROM v.ord
  `)
}

/** Where the task goes in the section: an anchor (renumbers the section), a sort_order, or last. */
type Placement = { kind: "end" } | { kind: "sort_order"; value: number } | { kind: "after"; taskId: number | null }

function placementFrom(input: Pick<MoveTaskInput, "sort_order" | "after_task_id">): Placement {
  if (input.after_task_id !== undefined) return { kind: "after", taskId: input.after_task_id }
  if (input.sort_order != null) return { kind: "sort_order", value: input.sort_order }
  return { kind: "end" }
}

const ANCHOR_GONE: ProjectFailure = {
  ok: false,
  reason: "anchor_not_in_section",
  message: "The board changed while you were dragging. Reload the board and try again.",
}

async function applyPlan(
  tx: DbExecutor,
  task: TaskPlacementRow,
  plan: Extract<SectionMovePlan, { ok: true }>,
  sections: readonly CodexSection[],
  placement: Placement,
  viewerEmail: string,
  isPrivate: boolean
): Promise<TaskPlacementResult | ProjectFailure> {
  let anchored: number[] | null = null
  if (placement.kind === "after") {
    anchored = orderAfterPlacement(await sectionTaskIds(tx, plan.section_id), task.id, placement.taskId)
    if (!anchored) return ANCHOR_GONE
  }
  if (plan.statusChanges) {
    // Same path as PATCH: activity row, help parent complete or re-wait.
    await updateTaskStatusInTx(tx, task.id, plan.status, normaliseEmail(viewerEmail))
  }
  return placeTask(tx, task, plan, sections, placement, anchored, viewerEmail, isPrivate)
}

/**
 * Set project, section and order (no status change here) and record a
 * section move. Task activity is readable by every staff member (C-211), so
 * for a private project the row keeps the ids and leaves the section names
 * out (`isPrivate`).
 */
async function placeTask(
  tx: DbExecutor,
  task: TaskPlacementRow,
  plan: Extract<SectionMovePlan, { ok: true }>,
  sections: readonly CodexSection[],
  placement: Placement,
  anchored: number[] | null,
  viewerEmail: string,
  isPrivate: boolean
): Promise<TaskPlacementResult> {
  const order =
    anchored != null
      ? anchored.indexOf(task.id)
      : placement.kind === "sort_order"
        ? placement.value
        : task.section_id === plan.section_id && task.sort_order != null
          ? task.sort_order
          : await nextSortOrderInSection(tx, plan.section_id, task.id)
  if (anchored != null) await writeSectionOrder(tx, anchored, task.id)
  await tx.execute(sql`
    UPDATE public.tasks
       SET project_id = ${plan.project_id},
           section_id = ${plan.section_id},
           sort_order = ${order},
           updated_at = now()
     WHERE id = ${task.id} AND deleted_at IS NULL
  `)
  if (task.project_id !== plan.project_id) {
    // B40: a subtask lives in its parent's project.
    await tx.execute(sql`
      UPDATE public.tasks SET project_id = ${plan.project_id}
       WHERE parent_task_id = ${task.id} AND task_type = 'subtask' AND deleted_at IS NULL
    `)
  }
  const sectionName = (id: number | null) => sections.find((s) => s.id === id)?.name ?? null
  const side = (projectId: number | null, sectionId: number | null) =>
    isPrivate ? { project_id: projectId, section_id: sectionId } : { project_id: projectId, section: sectionName(sectionId), section_id: sectionId }
  if (task.section_id !== plan.section_id || task.project_id !== plan.project_id) {
    await appendActivity(tx, {
      entityType: "task",
      entityId: task.id,
      actorEmail: viewerEmail,
      action: "move_section",
      before: side(task.project_id, task.section_id),
      after: side(plan.project_id, plan.section_id),
    })
  }
  return {
    ok: true,
    task: { id: task.id, status: plan.status, project_id: plan.project_id, section_id: plan.section_id, sort_order: order },
  }
}

/**
 * Move a task into a section of this project: it joins the project (from no
 * project only), takes the section's status category (through the PATCH path,
 * so help parents behave as before) and goes last unless `sort_order` is sent.
 */
export async function moveTaskToSection(
  projectId: number,
  sectionId: number,
  viewerEmail: string,
  input: MoveTaskInput,
  database: Db = db
): Promise<TaskPlacementResult | ProjectFailure> {
  return guarded(database, () =>
    database.transaction(async (tx) => {
      const p = await loadVisibleProject(tx, projectId, viewerEmail, true)
      if (!p) return NOT_FOUND
      const sections = await loadSections(tx, projectId)
      const section = sections.find((s) => s.id === sectionId)
      if (!section) return SECTION_NOT_FOUND
      const task = await lockLiveTask(tx, input.task_id)
      if (!task) return TASK_NOT_FOUND
      if (task.task_type === "subtask") return SUBTASK_NOT_ON_BOARD
      const plan = planSectionMove(task, section)
      if (!plan.ok) return plan
      return applyPlan(tx, task, plan, sections, placementFrom(input), viewerEmail, Boolean(p.row.isPrivate))
    })
  )
}

/** Complete a task of this project: it moves to the project's first done section. */
export async function completeProjectTask(
  projectId: number,
  taskId: number,
  viewerEmail: string,
  database: Db = db
): Promise<TaskPlacementResult | ProjectFailure> {
  return guarded(database, () =>
    database.transaction(async (tx) => {
      const p = await loadVisibleProject(tx, projectId, viewerEmail, true)
      if (!p) return NOT_FOUND
      const task = await lockLiveTask(tx, taskId)
      if (!task || task.project_id !== projectId) return TASK_NOT_FOUND
      if (task.task_type === "subtask") return SUBTASK_NOT_ON_BOARD
      const sections = await loadSections(tx, projectId)
      const plan = planCompleteInProject(task, sections)
      if (!plan.ok) return plan
      return applyPlan(tx, task, plan, sections, { kind: "end" }, viewerEmail, Boolean(p.row.isPrivate))
    })
  )
}

// ---------------------------------------------------------------------------
// B39: the project board
// ---------------------------------------------------------------------------

/** Cards per section on first load; the rest come by "Load more". */
export const BOARD_PAGE_SIZE = 50
const BOARD_PAGE_MAX = 200

export type BoardColumnPage = { items: CodexTask[]; total: number; completed: number }

export type ProjectBoard = {
  ok: true
  project: CodexProject
  sections: CodexSection[]
  /** Keyed by section id. `total` counts the cards shown with this setting; `completed` the done ones. */
  columns: Record<string, BoardColumnPage>
  /** Live tasks of the project with no section (should not happen; shown so nothing hides). */
  unsectioned: BoardColumnPage
  hide_completed: boolean
  hide_completed_source: "request" | "stored" | "default"
  /** B40: the project's custom fields and which show as chips on cards. */
  fields: CodexCustomField[]
  card_fields: CardFieldSetting[]
}

function idList(ids: readonly number[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}::bigint`),
    sql`, `
  )
}

/** Board cards: the list fields plus project placement, live subtasks and comments. */
async function loadBoardCards(database: DbExecutor, ids: readonly number[]): Promise<CodexTask[]> {
  if (ids.length === 0) return []
  const base = await loadListTasksByIds(database, ids)
  const placement = executeRows(
    await database.execute(sql`
      SELECT t.id, t.project_id, t.section_id, t.sort_order, t.task_type, t.start_on::text AS start_on,
             t.due_on::text AS due_on, t.assigned_by_email, t.custom_values,
             (SELECT count(*)::int FROM public.tasks c
               WHERE c.parent_task_id = t.id AND c.deleted_at IS NULL AND c.task_type = 'subtask') AS subtask_count,
             (SELECT count(*)::int FROM public.task_comments m WHERE m.task_id = t.id) AS comment_count
        FROM public.tasks t
       WHERE t.id IN (${idList(ids)})
    `)
  )
  const num = (v: unknown) => (v == null ? null : Number(v))
  const byId = new Map(placement.map((r) => [Number(r.id), r]))
  return base.map((t) => {
    const r = byId.get(Number(t.id))
    return {
      ...t,
      project_id: num(r?.project_id),
      section_id: num(r?.section_id),
      sort_order: num(r?.sort_order),
      subtask_count: Number(r?.subtask_count ?? 0) || 0,
      comment_count: Number(r?.comment_count ?? 0) || 0,
      ...s1FieldsFromRow(r),
    }
  })
}

/** B40 card and list fields from a raw tasks row. */
function s1FieldsFromRow(r: Record<string, unknown> | undefined) {
  return {
    task_type: typeof r?.task_type === "string" ? r.task_type : "task",
    start_on: r?.start_on == null ? null : String(r.start_on),
    due_on: r?.due_on == null ? null : String(r.due_on),
    assigned_by_email: r?.assigned_by_email == null ? null : String(r.assigned_by_email),
    custom_values: readStoredValues(r?.custom_values),
  }
}

/**
 * B40: the S1 fields (project, section, order, type, dates, assigned by,
 * values) for tasks read through the Drizzle mirror, which does not carry
 * them yet (C-210). Tasks list rows with codex_projects on. Empty before 0118.
 */
export async function attachTaskS1Fields(items: CodexTask[], database: Db = db): Promise<CodexTask[]> {
  const ids = items.map((t) => Number(t.id)).filter((id) => Number.isSafeInteger(id) && id > 0)
  if (ids.length === 0 || !(await isProjectsMigrationApplied(database))) return items
  try {
    const rows = executeRows(
      await database.execute(sql`
        SELECT id, project_id, section_id, sort_order, task_type, start_on::text AS start_on, due_on::text AS due_on,
               assigned_by_email, custom_values
          FROM public.tasks WHERE id IN (${idList(ids)})
      `)
    )
    const byId = new Map(rows.map((r) => [Number(r.id), r]))
    const num = (v: unknown) => (v == null ? null : Number(v))
    return items.map((t) => {
      const r = byId.get(Number(t.id))
      if (!r) return t
      return { ...t, project_id: num(r.project_id), section_id: num(r.section_id), sort_order: num(r.sort_order), ...s1FieldsFromRow(r) }
    })
  } catch (err) {
    if (isMissingProjectsSchema(err)) {
      forgetProjectsMarker()
      return items
    }
    throw err
  }
}

function fieldRowToApi(row: typeof codexCustomFields.$inferSelect): CodexCustomField | null {
  if (!isBuiltFieldType(row.fieldType)) return null
  return {
    id: Number(row.id),
    project_id: Number(row.projectId),
    name: row.name,
    field_type: row.fieldType,
    options: readStoredOptions(row.options),
    done_option: row.doneOption ?? null,
  }
}

/** B40: a project's custom fields (built types only), oldest first. */
export async function loadProjectFields(database: DbExecutor, projectId: number): Promise<CodexCustomField[]> {
  const rows = await database
    .select()
    .from(codexCustomFields)
    .where(eq(codexCustomFields.projectId, projectId))
    .orderBy(asc(codexCustomFields.id))
  return rows.map(fieldRowToApi).filter((f): f is CodexCustomField => f != null)
}

/** The project-wide board row (no owner) that holds the card chip settings. */
export function projectCardFieldsWhere(projectId: number): SQL {
  return and(eq(codexBoardConfigs.scope, projectBoardScope(projectId)), isNull(codexBoardConfigs.ownerEmail)) as SQL
}

/** B40: which field chips show on cards for this project (none listed: all show). */
export async function loadProjectCardFields(database: DbExecutor, projectId: number): Promise<CardFieldSetting[]> {
  const [row] = await database
    .select({ cardFields: codexBoardConfigs.cardFields })
    .from(codexBoardConfigs)
    .where(projectCardFieldsWhere(projectId))
    .orderBy(sql`${codexBoardConfigs.id} desc`)
    .limit(1)
  return row ? readCardFields(row.cardFields) : []
}

async function storedHideCompleted(database: DbExecutor, projectId: number, viewerEmail: string): Promise<boolean | null> {
  const [row] = await database
    .select({ hide: codexBoardConfigs.hideCompleted })
    .from(codexBoardConfigs)
    .where(
      and(
        eq(codexBoardConfigs.scope, projectBoardScope(projectId)),
        sql`lower(${codexBoardConfigs.ownerEmail}) = ${normaliseEmail(viewerEmail)}`
      )
    )
    .orderBy(sql`${codexBoardConfigs.id} desc`)
    .limit(1)
  return row ? Boolean(row.hide) : null
}

function clampPageSize(n: number | undefined): number {
  if (n == null || !Number.isFinite(n)) return BOARD_PAGE_SIZE
  return Math.min(BOARD_PAGE_MAX, Math.max(1, Math.trunc(n)))
}

/**
 * The project, its sections and the first page of cards in each section
 * (board order), with per-section counts. `hideCompleted` null uses the
 * viewer's stored setting, then hide.
 */
export async function loadProjectBoard(
  projectId: number,
  viewerEmail: string,
  options: { hideCompleted: boolean | null; perSection?: number },
  database: Db = db
): Promise<ProjectBoard | ProjectFailure> {
  return guarded(database, async () => {
    const p = await loadVisibleProject(database, projectId, viewerEmail)
    if (!p) return NOT_FOUND
    const sections = await loadSections(database, projectId)
    const stored = options.hideCompleted == null ? await storedHideCompleted(database, projectId, viewerEmail) : null
    const hide = options.hideCompleted ?? stored ?? true
    const source = options.hideCompleted != null ? "request" : stored != null ? "stored" : "default"
    const per = clampPageSize(options.perSection)
    const countRows = executeRows(
      await database.execute(sql`
        SELECT section_id,
               count(*) FILTER (WHERE status <> 'done')::int AS open,
               count(*) FILTER (WHERE status = 'done')::int AS done
          FROM public.tasks
         WHERE project_id = ${projectId} AND deleted_at IS NULL AND task_type <> 'subtask'
         GROUP BY section_id
      `)
    )
    const pickRows = executeRows(
      await database.execute(sql`
        SELECT id, section_id FROM (
          SELECT id, section_id,
                 row_number() OVER (PARTITION BY section_id ORDER BY sort_order ASC NULLS LAST, id ASC) AS rn
            FROM public.tasks
           WHERE project_id = ${projectId} AND deleted_at IS NULL AND task_type <> 'subtask'
             AND (${hide} = false OR status <> 'done')
        ) ranked
        WHERE rn <= ${per}
        ORDER BY section_id NULLS LAST, rn
      `)
    )
    const cards = await loadBoardCards(database, pickRows.map((r) => Number(r.id)))
    const known = new Set(sections.map((s) => s.id))
    const columns: Record<string, BoardColumnPage> = {}
    for (const s of sections) columns[String(s.id)] = { items: [], total: 0, completed: 0 }
    const unsectioned: BoardColumnPage = { items: [], total: 0, completed: 0 }
    const pageFor = (sectionId: unknown) => {
      const id = sectionId == null ? null : Number(sectionId)
      return id != null && known.has(id) ? columns[String(id)] : unsectioned
    }
    for (const r of countRows) {
      const page = pageFor(r.section_id)
      const open = Number(r.open ?? 0) || 0
      const done = Number(r.done ?? 0) || 0
      page.total += hide ? open : open + done
      page.completed += done
    }
    for (const card of cards) pageFor(card.section_id).items.push(card)
    return {
      ok: true as const,
      project: projectRowToApi(p.row, p.members),
      sections,
      columns,
      unsectioned,
      hide_completed: hide,
      hide_completed_source: source,
      fields: await loadProjectFields(database, projectId),
      card_fields: await loadProjectCardFields(database, projectId),
    }
  })
}

/** One more page of a section's cards ("Load more"). */
export async function listSectionTasks(
  projectId: number,
  sectionId: number,
  viewerEmail: string,
  options: { hideCompleted: boolean; offset: number; limit?: number },
  database: Db = db
): Promise<{ ok: true; items: CodexTask[]; total: number } | ProjectFailure> {
  return guarded(database, async () => {
    const p = await loadVisibleProject(database, projectId, viewerEmail)
    if (!p) return NOT_FOUND
    const sections = await loadSections(database, projectId)
    if (!sections.some((s) => s.id === sectionId)) return SECTION_NOT_FOUND
    const limit = clampPageSize(options.limit)
    const offset = Math.max(0, Math.trunc(options.offset) || 0)
    const where = sql`project_id = ${projectId} AND section_id = ${sectionId} AND deleted_at IS NULL
      AND (${options.hideCompleted} = false OR status <> 'done')`
    const [countRow] = executeRows(await database.execute(sql`SELECT count(*)::int AS n FROM public.tasks WHERE ${where}`))
    const rows = executeRows(
      await database.execute(sql`
        SELECT id FROM public.tasks WHERE ${where}
         ORDER BY sort_order ASC NULLS LAST, id ASC
         LIMIT ${limit} OFFSET ${offset}
      `)
    )
    return { ok: true as const, items: await loadBoardCards(database, rows.map((r) => Number(r.id))), total: Number(countRow?.n ?? 0) || 0 }
  })
}

/**
 * Inline add and bulk paste: new tasks at the end of a section, in the
 * order given. Each takes the section's status (a done section creates them
 * done), the project's client and MBA, and is created by the viewer,
 * unassigned, priority normal, source manual, with a create activity row.
 */
export async function createTasksInSection(
  projectId: number,
  sectionId: number,
  viewerEmail: string,
  titles: readonly string[],
  database: Db = db
): Promise<{ ok: true; tasks: CodexTask[] } | ProjectFailure> {
  return guarded(database, () =>
    database.transaction(async (tx) => {
      const p = await loadVisibleProject(tx, projectId, viewerEmail, true)
      if (!p) return NOT_FOUND
      const sections = await loadSections(tx, projectId)
      const section = sections.find((s) => s.id === sectionId)
      if (!section) return SECTION_NOT_FOUND
      const creator = normaliseEmail(viewerEmail)
      const status = statusForSectionCategory(section.status_category)
      const start = await nextSortOrderInSection(tx, sectionId, 0)
      const values = sql.join(
        titles.map(
          (title, i) => sql`(${title}, ${p.row.clientId ?? null}::bigint, ${p.row.mbaNumber ?? null}, ${status}, 'normal',
            ${creator}, 'manual', ${projectId}::bigint, ${sectionId}::bigint, ${start + i}::int, now(), now())`
        ),
        sql`, `
      )
      const inserted = executeRows(
        await tx.execute(sql`
          INSERT INTO public.tasks (title, client_id, mba_number, status, priority, created_by_email, source,
                                    project_id, section_id, sort_order, created_at, updated_at)
          VALUES ${values}
          RETURNING id
        `)
      )
      const ids = inserted.map((r) => Number(r.id))
      const created = await loadBoardCards(tx, ids)
      if (created.length > 0) {
        await tx.insert(codexActivity).values(
          created.map((t) => ({
            entityType: "task",
            entityId: Number(t.id),
            actorEmail: creator || null,
            actorKind: "user",
            action: "create",
            before: null,
            // Task activity is readable by all staff (C-211): no section name for a private project.
            after: p.row.isPrivate ? t : { ...t, section: section.name },
          }))
        )
      }
      return { ok: true as const, tasks: created }
    })
  )
}

/** Save the viewer's hide or show completed setting for this project board. */
export async function setBoardHideCompleted(
  projectId: number,
  viewerEmail: string,
  hideCompleted: boolean,
  database: Db = db
): Promise<{ ok: true; hide_completed: boolean } | ProjectFailure> {
  return guarded(database, () =>
    database.transaction(async (tx) => {
      const p = await loadVisibleProject(tx, projectId, viewerEmail)
      if (!p) return NOT_FOUND
      const scope = projectBoardScope(projectId)
      const owner = normaliseEmail(viewerEmail)
      // codex_board_configs has no unique key on (scope, owner): one writer at a time per board and person.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`codex_board_configs:${scope}:${owner}`}))`)
      const [row] = await tx
        .select({ id: codexBoardConfigs.id })
        .from(codexBoardConfigs)
        .where(and(eq(codexBoardConfigs.scope, scope), sql`lower(${codexBoardConfigs.ownerEmail}) = ${owner}`))
        .orderBy(sql`${codexBoardConfigs.id} desc`)
        .limit(1)
      if (row) {
        await tx.update(codexBoardConfigs).set({ hideCompleted }).where(eq(codexBoardConfigs.id, row.id))
      } else {
        await tx.insert(codexBoardConfigs).values({ scope, ownerEmail: owner, groupBy: "section", hideCompleted })
      }
      return { ok: true as const, hide_completed: hideCompleted }
    })
  )
}

// ---------------------------------------------------------------------------
// B39: PATCH, bulk and the Tasks board move a project task only by section
// ---------------------------------------------------------------------------

type StatusChangeOutcome = { ok: true; task: CodexTask | null } | ProjectFailure

const NOT_IN_PROJECT: ProjectFailure = {
  ok: false,
  reason: "not_in_project",
  message: "Custom fields belong to a project. Move the task into a project first.",
}

/** Keys of a Drizzle-side update other than the assigned-by flag. */
function hasBaseChanges(patch: UpdateTaskInput): boolean {
  return Object.entries(patch).some(([k, v]) => k !== "trackAssignedBy" && v !== undefined)
}

function hasDetails(details: TaskDetailPatch): boolean {
  return Object.values(details).some((v) => v !== undefined)
}

/** Write the B40 columns sent (raw SQL until C-210) and record them as one activity row. */
async function writeTaskDetails(
  tx: DbExecutor,
  task: TaskPlacementRow,
  details: TaskDetailPatch,
  values: CustomValues | null,
  actorEmail: string | null
): Promise<void> {
  const sets: SQL[] = []
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  if (details.start_on !== undefined) {
    sets.push(sql`start_on = ${details.start_on}::date`)
    before.start_on = task.start_on
    after.start_on = details.start_on
  }
  if (details.due_on !== undefined) {
    // One due column per write: the 0118 trigger sets due_date from it (stack review L4).
    sets.push(sql`due_on = ${details.due_on}::date`)
    before.due_on = task.due_on
    after.due_on = details.due_on
  }
  if (details.task_type !== undefined) {
    sets.push(sql`task_type = ${details.task_type}`)
    before.task_type = task.task_type
    after.task_type = details.task_type
  }
  if (values != null) {
    sets.push(sql`custom_values = ${JSON.stringify(values)}::jsonb`)
    before.custom_values = task.custom_values
    after.custom_values = values
  }
  if (sets.length === 0) return
  sets.push(sql`updated_at = now()`)
  await tx.execute(sql`UPDATE public.tasks SET ${sql.join(sets, sql`, `)} WHERE id = ${task.id} AND deleted_at IS NULL`)
  await appendActivity(tx, { entityType: "task", entityId: task.id, actorEmail: actorEmail ?? "", action: "update", before, after })
}

/**
 * One task's PATCH-shaped update inside the caller's transaction, with the
 * B40 detail columns. Locks the project row, then the task (the order every
 * projects write uses). Checks before any write, so a refusal changes
 * nothing:
 * - type: task and milestone switch, a subtask stays one (B40);
 * - dates: start on or before due, against what is stored for the one not sent;
 * - custom values: the task's project (visible to the viewer) and its fields' options;
 * - status (B39): a task in a project moves to the section the status names,
 *   or is refused. A subtask has no section: its status changes alone.
 */
async function writeTaskInTx(
  tx: DbExecutor,
  id: number,
  patch: UpdateTaskInput,
  actorEmail: string | null,
  details: TaskDetailPatch
): Promise<StatusChangeOutcome> {
  const peek = executeRows(
    await tx.execute(sql`SELECT project_id FROM public.tasks WHERE id = ${id} AND deleted_at IS NULL`)
  )[0]
  if (!peek) return { ok: true, task: null }
  const projectId = peek.project_id == null ? null : Number(peek.project_id)
  let isPrivate = false
  if (projectId != null) {
    const locked = executeRows(
      await tx.execute(sql`SELECT id, is_private FROM public.codex_projects WHERE id = ${projectId} FOR UPDATE`)
    )[0]
    // Unknown counts as private: the safe side for what the activity row names.
    isPrivate = locked?.is_private !== false
  }
  const task = await lockLiveTask(tx, id)
  if (!task) return { ok: true, task: null }
  if (task.project_id !== projectId) {
    return { ok: false, reason: "task_changed", message: "The task moved project while saving. Reload and try again." }
  }

  if (details.task_type !== undefined) {
    const typeRule = checkTaskTypeChange(task.task_type, details.task_type)
    if (!typeRule.ok) return typeRule
  }
  if (details.start_on !== undefined || details.due_on !== undefined || patch.dueDate !== undefined) {
    const start = details.start_on !== undefined ? details.start_on : task.start_on
    const due =
      details.due_on !== undefined ? details.due_on : patch.dueDate !== undefined ? (patch.dueDate?.slice(0, 10) ?? null) : task.due_on
    const dates = checkTaskDates(start, due)
    if (!dates.ok) return dates
  }
  let values: CustomValues | null = null
  if (details.custom_values !== undefined) {
    if (task.project_id == null) return NOT_IN_PROJECT
    if (!(await loadVisibleProject(tx, task.project_id, actorEmail ?? ""))) return NOT_FOUND
    const applied = applyCustomValuesPatch(task.custom_values, details.custom_values, await loadProjectFields(tx, task.project_id))
    if (!applied.ok) return applied
    values = applied.values
  }
  let plan: Extract<ReturnType<typeof planStatusChangeInProject>, { inProject: true }> | null = null
  let sections: CodexSection[] = []
  if (hasStatus(patch) && task.project_id != null && task.task_type !== "subtask") {
    sections = await loadSections(tx, task.project_id)
    const planned = planStatusChangeInProject(task, sections, patch.status)
    if (!planned.ok) return planned
    if (planned.inProject) plan = planned
  }

  await writeTaskDetails(tx, task, details, values, actorEmail)
  let updated: CodexTask | null = null
  if (hasBaseChanges(patch)) {
    updated = await updateTaskInTx(tx, id, patch, actorEmail)
    if (!updated) return { ok: true, task: null }
  }
  if (plan) await placeTask(tx, task, plan, sections, { kind: "end" }, null, actorEmail ?? "", isPrivate)
  const [fresh] = await loadBoardCards(tx, [id])
  return { ok: true, task: fresh ?? updated }
}

function hasStatus(patch: UpdateTaskInput): patch is UpdateTaskInput & { status: string } {
  return typeof patch.status === "string"
}

/**
 * PATCH /api/codex/tasks/[id] with codex_projects on. Without a status,
 * due date, detail columns or asap, or before 0118 without detail columns
 * or asap, this is the plain update. Detail columns or asap before 0118: ProjectsUnavailableError
 * (503). A refusal is a failure (409 or 400); a missing task is `task: null`.
 */
export async function updateTaskThroughSections(
  id: number,
  patch: UpdateTaskInput,
  actorEmail: string | null,
  database: Db = db,
  details: TaskDetailPatch = {}
): Promise<StatusChangeOutcome> {
  const withDetails = hasDetails(details)
  const asap = patch.priority === "asap"
  // A due date change is checked against the stored start date (B40).
  if (!hasStatus(patch) && !withDetails && !asap && patch.dueDate === undefined) {
    return { ok: true, task: await updateTask(id, patch, actorEmail, database) }
  }
  if (!(await isProjectsMigrationApplied(database))) {
    if (withDetails || asap) throw new ProjectsUnavailableError()
    return { ok: true, task: await updateTask(id, patch, actorEmail, database) }
  }
  return guarded(database, () => database.transaction((tx) => writeTaskInTx(tx, id, patch, actorEmail, details)))
}

/**
 * POST /api/codex/tasks/bulk with codex_projects on: one transaction, every
 * task or none. A project task with no section for the status throws
 * CodexBulkError 409 naming that task; any other failure is CodexBulkError
 * 400 naming the task (bulkFailure, as the plain bulk path).
 */
export async function bulkUpdateTasksThroughSections(
  ids: readonly number[],
  patch: UpdateTaskInput,
  actorEmail: string | null,
  database: Db = db
): Promise<CodexTask[] | null> {
  // A due date change is checked against each task's start date too (B40).
  if ((!hasStatus(patch) && patch.dueDate === undefined) || !(await isProjectsMigrationApplied(database))) return null
  return database.transaction(async (tx) => {
    // Lock every project in the batch first, in id order, so two bulk edits
    // over the same projects queue instead of deadlocking.
    if (ids.length > 0) {
      await tx.execute(sql`
        SELECT p.id FROM public.codex_projects p
         WHERE p.id IN (SELECT DISTINCT t.project_id FROM public.tasks t WHERE t.id IN (${idList(ids)}) AND t.project_id IS NOT NULL)
         ORDER BY p.id
         FOR UPDATE OF p
      `)
    }
    const updated: CodexTask[] = []
    for (const id of ids) {
      let outcome: StatusChangeOutcome
      try {
        outcome = await writeTaskInTx(tx, id, patch, actorEmail, {})
      } catch (error) {
        // As the plain bulk path: a failure that is not a refusal is 400 naming the task.
        throw bulkFailure(id, error)
      }
      if (!outcome.ok) throw new CodexBulkError(id, 409, `Task ${id}: ${outcome.message}`)
      if (!outcome.task) throw new CodexBulkError(id, 409, `Task ${id} was not found.`)
      updated.push(outcome.task)
    }
    return updated
  })
}
