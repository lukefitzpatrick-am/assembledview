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
import { updateTaskStatusInTx, type DbExecutor } from "@/lib/codex/repo"

const { codexProjects, codexProjectMembers, codexSections, codexActivity, migrationMarkers } = schema

export const PROJECTS_MARKER = "0118_codex_s1_projects"

/** How long a "not applied" answer is kept before the marker is read again. */
export const PROJECTS_MARKER_RECHECK_MS = 60_000

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

// ---------------------------------------------------------------------------
// Marker guard
// ---------------------------------------------------------------------------

let markerSeen = false
let missingUntil = 0

/** Test hook. */
export function resetProjectsMarkerCacheForTests(): void {
  markerSeen = false
  missingUntil = 0
}

/**
 * Once seen, the marker is cached for the process. A "not there" answer is
 * cached for PROJECTS_MARKER_RECHECK_MS so a missing migration costs one
 * query a minute, not one per request. A failed read is not cached.
 */
export async function isProjectsMigrationApplied(database: Db = db, now = Date.now()): Promise<boolean> {
  if (markerSeen) return true
  if (now < missingUntil) return false
  try {
    const rows = await database
      .select({ key: migrationMarkers.key })
      .from(migrationMarkers)
      .where(eq(migrationMarkers.key, PROJECTS_MARKER))
      .limit(1)
    markerSeen = rows.length > 0
    if (!markerSeen) missingUntil = now + PROJECTS_MARKER_RECHECK_MS
    return markerSeen
  } catch (err) {
    console.warn("[codex-projects] marker read failed", err)
    return false
  }
}

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
async function guarded<T>(database: Db, run: () => Promise<T>): Promise<T> {
  if (!(await isProjectsMigrationApplied(database))) throw new ProjectsUnavailableError()
  try {
    return await run()
  } catch (err) {
    if (isMissingProjectsSchema(err)) {
      markerSeen = false
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

type VisibleProject = { row: ProjectRow; members: string[] }

/**
 * A live project the viewer may see, or null (missing, deleted, or private
 * and not theirs). `lock` takes the project row FOR UPDATE, which serialises
 * section and membership changes per project.
 */
async function loadVisibleProject(
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

async function loadSections(database: DbExecutor, projectId: number): Promise<CodexSection[]> {
  const rows = await database
    .select()
    .from(codexSections)
    .where(eq(codexSections.projectId, projectId))
    .orderBy(asc(codexSections.sortOrder), asc(codexSections.id))
  return rows.map(sectionRowToApi)
}

async function appendActivity(
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
}

async function lockLiveTask(database: DbExecutor, taskId: number): Promise<TaskPlacementRow | null> {
  const rows = executeRows(
    await database.execute(sql`
      SELECT id, status, project_id, section_id, sort_order
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
  }
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

async function applyPlan(
  tx: DbExecutor,
  task: TaskPlacementRow,
  plan: Extract<SectionMovePlan, { ok: true }>,
  sections: readonly CodexSection[],
  sortOrder: number | null,
  viewerEmail: string
): Promise<TaskPlacementResult> {
  if (plan.statusChanges) {
    // Same path as PATCH: activity row, help parent complete or re-wait.
    await updateTaskStatusInTx(tx, task.id, plan.status, normaliseEmail(viewerEmail))
  }
  const order =
    sortOrder ??
    (task.section_id === plan.section_id && task.sort_order != null
      ? task.sort_order
      : await nextSortOrderInSection(tx, plan.section_id, task.id))
  await tx.execute(sql`
    UPDATE public.tasks
       SET project_id = ${plan.project_id},
           section_id = ${plan.section_id},
           sort_order = ${order},
           updated_at = now()
     WHERE id = ${task.id} AND deleted_at IS NULL
  `)
  const sectionName = (id: number | null) => sections.find((s) => s.id === id)?.name ?? null
  if (task.section_id !== plan.section_id || task.project_id !== plan.project_id) {
    await appendActivity(tx, {
      entityType: "task",
      entityId: task.id,
      actorEmail: viewerEmail,
      action: "move_section",
      before: { project_id: task.project_id, section: sectionName(task.section_id), section_id: task.section_id },
      after: { project_id: plan.project_id, section: sectionName(plan.section_id), section_id: plan.section_id },
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
      const plan = planSectionMove(task, section)
      if (!plan.ok) return plan
      return applyPlan(tx, task, plan, sections, input.sort_order, viewerEmail)
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
      const sections = await loadSections(tx, projectId)
      const plan = planCompleteInProject(task, sections)
      if (!plan.ok) return plan
      return applyPlan(tx, task, plan, sections, null, viewerEmail)
    })
  )
}
