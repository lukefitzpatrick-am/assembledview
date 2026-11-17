/**
 * Private projects stay private everywhere (B42, C-211).
 *
 * One rule, two forms:
 * - TS: `canSeeProject` (`lib/codex/projects.ts`): a public project is
 *   visible to every staff member; a private one to its owner, its creator
 *   and its members only. `canSeeTask` (`notify.ts`) applies it to a task.
 * - SQL: `taskVisibleSql` below, the same rule over `tasks.project_id`. A
 *   task in no project is visible to all staff. A task whose project row is
 *   missing counts as hidden (the TS side treats an unknown project as
 *   private too).
 *
 * Every task read outside a project screen goes through these: the Tasks
 * list, its counts, MBA counts, search, the single-task routes, My Work,
 * the workload, the bell and digest, and the read-only panels outside
 * /tasks. `taskVisibility.db.test.ts` pins that the SQL and the TS agree.
 *
 * B42fix (F4): the viewer and every stored owner, creator and member address
 * compare as their roster primary email (`AccessIdentity`, the B36 resolver)
 * when `codex_roster_aliases` is on, so an alias never costs access. Off,
 * addresses compare as stored, as before.
 *
 * The 0118 columns exist only after marker `0118_codex_s1_projects`, so the
 * helpers that touch the database add nothing before it (no private project
 * can exist before 0118). After it they filter with `codex_projects` on or
 * off: a project made private stays private if the switch goes off.
 */
import "server-only"

import { sql, type SQL } from "drizzle-orm"

import { isMarkerApplied } from "@/lib/db/markers"
import { PROJECTS_MARKER } from "@/lib/codex/projects"
import { executeRows } from "@/lib/codex/estimatedMinutesColumn"
import { isFeatureOn } from "@/lib/features/server"
import {
  AssigneeNoAccessError,
  buildAccessIdentity,
  canonicalEmail,
  NO_ALIASES,
  TaskJoinedProjectError,
  type AccessIdentity,
} from "@/lib/codex/projects"
import type { DbExecutor } from "@/lib/codex/repo"
import { loadRosterPeople } from "@/lib/codex/rosterRead"

/** The tasks list's own column (Drizzle selects from "tasks"). */
export const TASKS_PROJECT_ID: SQL = sql`"tasks"."project_id"`

/**
 * The alias map access checks use (F4): empty with `codex_roster_aliases`
 * off (addresses compare as stored), else every unambiguous alias of an
 * active member to their primary email. `aliases` overrides the switch read
 * (tests, and callers that already read it). A failed switch read counts as
 * off (the switch's own default).
 */
export async function loadAccessIdentity(database: DbExecutor, aliases?: boolean): Promise<AccessIdentity> {
  let on = aliases
  if (on === undefined) {
    try {
      on = await isFeatureOn("codex_roster_aliases")
    } catch {
      on = false
    }
  }
  if (!on) return NO_ALIASES
  return buildAccessIdentity(await loadRosterPeople(database), true)
}

/** SQL: an address column or expression as its primary email (lower case) under `identity`. */
export function canonicalEmailSql(address: SQL, identity: AccessIdentity = NO_ALIASES): SQL {
  if (identity.size === 0) return sql`lower(${address})`
  const pairs = sql.join(
    [...identity].map(([alias, primary]) => sql`(${alias}::text, ${primary}::text)`),
    sql`, `
  )
  return sql`coalesce((SELECT ai.p FROM (VALUES ${pairs}) AS ai(a, p) WHERE ai.a = lower(${address})), lower(${address}))`
}

/**
 * SQL: the project `projectId` names is visible to the viewer (or there is
 * no project). The viewer is an email (empty sees public projects only) or
 * an SQL expression, such as `n.recipient_email` for the digest. With an
 * identity (F4) the viewer and the stored addresses compare as primaries.
 */
export function taskVisibleSql(
  projectId: SQL,
  viewerEmail: string | null | undefined | SQL,
  identity: AccessIdentity = NO_ALIASES
): SQL {
  const viewer: SQL | null =
    viewerEmail != null && typeof viewerEmail === "object"
      ? canonicalEmailSql(viewerEmail, identity)
      : canonicalEmail(viewerEmail, identity)
        ? sql`${canonicalEmail(viewerEmail, identity)}`
        : null
  const as = (address: SQL) => canonicalEmailSql(address, identity)
  const viewerCanSee = viewer
    ? sql` OR ${as(sql`vp.owner_email`)} = ${viewer} OR ${as(sql`vp.created_by_email`)} = ${viewer}
        OR EXISTS (SELECT 1 FROM public.codex_project_members vm WHERE vm.project_id = vp.id AND ${as(sql`vm.email`)} = ${viewer})`
    : sql``
  return sql`(${projectId} IS NULL OR EXISTS (
    SELECT 1 FROM public.codex_projects vp WHERE vp.id = ${projectId} AND (vp.is_private = false${viewerCanSee})))`
}

/** The visibility condition for a tasks query, or undefined before 0118 (nothing to hide). */
export async function taskVisibilityCondition(
  database: DbExecutor,
  viewerEmail: string | null | undefined,
  projectId: SQL = TASKS_PROJECT_ID,
  identity?: AccessIdentity
): Promise<SQL | undefined> {
  if (!(await isMarkerApplied(PROJECTS_MARKER, database))) return undefined
  return taskVisibleSql(projectId, viewerEmail, identity ?? (viewerEmail ? await loadAccessIdentity(database) : NO_ALIASES))
}

/**
 * The ids among `ids` that exist and sit in a project the viewer cannot
 * see. A missing or deleted task is not "hidden" here, so callers keep
 * answering it as they did; a hidden task is answered as missing (404).
 */
export async function hiddenTaskIds(
  database: DbExecutor,
  ids: readonly number[],
  viewerEmail: string | null | undefined
): Promise<Set<number>> {
  const clean = [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))]
  if (clean.length === 0 || !(await isMarkerApplied(PROJECTS_MARKER, database))) return new Set()
  const identity = viewerEmail ? await loadAccessIdentity(database) : NO_ALIASES
  const rows = executeRows(
    await database.execute(sql`
      SELECT t.id FROM public.tasks t
       WHERE t.id IN (${sql.join(clean.map((id) => sql`${id}::bigint`), sql`, `)})
         AND NOT ${taskVisibleSql(sql`t.project_id`, viewerEmail, identity)}
    `)
  )
  return new Set(rows.map((r) => Number(r.id)))
}

/** True when the task exists and its project is hidden from the viewer. */
export async function isTaskHiddenFrom(
  database: DbExecutor,
  id: number,
  viewerEmail: string | null | undefined
): Promise<boolean> {
  return (await hiddenTaskIds(database, [id], viewerEmail)).has(id)
}

/**
 * F5 (B42fix): the emails among `emails` who cannot see project `projectId`
 * (a private project they are not owner, creator or member of, aliases
 * resolved as for any viewer). No project, or before 0118: none.
 */
export async function emailsWithoutProjectAccess(
  database: DbExecutor,
  projectId: number | null,
  emails: readonly (string | null | undefined)[],
  identity?: AccessIdentity
): Promise<string[]> {
  const clean = [...new Set(emails.map((e) => (e ?? "").trim().toLowerCase()).filter(Boolean))]
  if (projectId == null || clean.length === 0 || !(await isMarkerApplied(PROJECTS_MARKER, database))) return []
  const ids = identity ?? (await loadAccessIdentity(database))
  const out: string[] = []
  for (const email of clean) {
    const [row] = executeRows(
      await database.execute(sql`SELECT ${taskVisibleSql(sql`${projectId}::bigint`, email, ids)} AS ok`)
    )
    if (row?.ok !== true && row?.ok !== "t") out.push(email)
  }
  return out
}

/**
 * F5: throw AssigneeNoAccessError when `email` cannot see the project task
 * `taskId` is in. `batchLocked` (R1, B43fix): the projects a bulk edit locked
 * first (`shareBatchProjects`); a task now in a project outside them is
 * refused (TaskJoinedBatchProjectError) before that project is locked.
 */
export async function assertAssigneeCanSeeTask(
  database: DbExecutor,
  taskId: number,
  email: string | null | undefined,
  batchLocked?: ReadonlySet<number>
): Promise<void> {
  if (!(email ?? "").trim() || !(await isMarkerApplied(PROJECTS_MARKER, database))) return
  const projectId = batchLocked ? await batchTaskProject(database, taskId, batchLocked) : await shareTaskProject(database, taskId)
  const [refused] = await emailsWithoutProjectAccess(database, projectId, [email])
  if (refused) throw new AssigneeNoAccessError(refused)
}

/**
 * C-258 (B43): take the task's project row FOR SHARE and return its id (null
 * when the task is in no project). A member removal, a switch to private and
 * an owner change hold the row FOR UPDATE, so an assignment and those changes
 * wait for each other and each check reads the other's committed rows.
 * R2 (PACK4fix): the task's project is then read with the task row FOR
 * UPDATE (project, then task: the order a board move takes), so a move into
 * a project that is still in flight is waited on and its result read. A task
 * found in another project than the one locked is refused
 * (TaskJoinedProjectError, 409 `task_changed`); its project is never locked
 * after the task row.
 */
async function shareTaskProject(database: DbExecutor, taskId: number): Promise<number | null> {
  const locked = executeRows(
    await database.execute(sql`
      SELECT p.id FROM public.codex_projects p
       WHERE p.id = (SELECT t.project_id FROM public.tasks t WHERE t.id = ${taskId})
         FOR SHARE OF p
    `)
  )[0]
  const projectId = await lockedTaskProject(database, taskId)
  if (projectId !== (locked == null ? null : Number(locked.id))) throw new TaskJoinedProjectError(taskId)
  return projectId
}

/**
 * R2 (PACK4fix): the task's `project_id` read with its row FOR UPDATE. Under
 * READ COMMITTED a plain read skips a move that is not committed yet; the
 * row lock waits for it and reads the row as it then stands. Null when the
 * task is in no project (or missing).
 */
async function lockedTaskProject(database: DbExecutor, taskId: number): Promise<number | null> {
  const [peek] = executeRows(
    await database.execute(sql`SELECT project_id FROM public.tasks WHERE id = ${taskId} FOR UPDATE`)
  )
  return peek?.project_id == null ? null : Number(peek.project_id)
}

/**
 * R1 (B43fix): a plain bulk edit that changes an assignee takes FOR SHARE on
 * every batch task's project, in project id order, before it writes any
 * task. A board move (or any section writer) holds its project FOR UPDATE
 * and then writes tasks, so taking a project lock after a task row was
 * written could deadlock with it. Returns the ids locked. Before 0118: an
 * empty set (nothing to lock; the check returns before it locks).
 */
export async function shareBatchProjects(database: DbExecutor, ids: readonly number[]): Promise<Set<number>> {
  const locked = new Set<number>()
  const clean = [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))]
  if (clean.length === 0 || !(await isMarkerApplied(PROJECTS_MARKER, database))) return locked
  const rows = executeRows(
    await database.execute(sql`
      SELECT p.id FROM public.codex_projects p
       WHERE p.id IN (SELECT DISTINCT t.project_id FROM public.tasks t
                       WHERE t.id IN (${sql.join(clean.map((id) => sql`${id}::bigint`), sql`, `)}) AND t.project_id IS NOT NULL)
       ORDER BY p.id
         FOR SHARE OF p
    `)
  )
  for (const r of rows) locked.add(Number(r.id))
  return locked
}

/** R1 (B43fix): a bulk task joined a project the batch did not lock (bulkFailure: 409 `task_changed`). */
export class TaskJoinedBatchProjectError extends TaskJoinedProjectError {
  constructor(taskId: number) {
    super(taskId)
    this.name = "TaskJoinedBatchProjectError"
  }
}

/**
 * R1 (B43fix): the task's project inside a bulk edit whose projects are
 * already held (`shareBatchProjects`). A task now in a project outside that
 * set joined it mid-batch: refused (409 `task_changed`) and never locked
 * late, so the batch never takes a project lock out of id order (as C-222
 * does for the section path). The task row is read FOR UPDATE (R2,
 * PACK4fix): the batch writes it next anyway, after every project lock.
 */
async function batchTaskProject(database: DbExecutor, taskId: number, batchLocked: ReadonlySet<number>): Promise<number | null> {
  // R2 (PACK4fix): with the row lock, a move still in flight is waited on, then read.
  const projectId = await lockedTaskProject(database, taskId)
  if (projectId != null && !batchLocked.has(projectId)) throw new TaskJoinedBatchProjectError(taskId)
  return projectId
}

/**
 * C-258 (B43): the live open tasks (not done) in project `projectId` whose
 * assignee cannot see the project, read as the rows stand in this
 * transaction. The assignee is the viewer of the shared rule, aliases
 * resolved through `identity`. Subtasks and help tasks count (they carry the
 * project). Before 0118: none.
 */
export async function openTasksHiddenFromAssignee(
  database: DbExecutor,
  projectId: number,
  identity: AccessIdentity
): Promise<number[]> {
  if (!(await isMarkerApplied(PROJECTS_MARKER, database))) return []
  const rows = executeRows(
    await database.execute(sql`
      SELECT t.id FROM public.tasks t
       WHERE t.project_id = ${projectId}
         AND t.deleted_at IS NULL
         AND t.status <> 'done'
         AND nullif(btrim(t.assignee_email), '') IS NOT NULL
         AND NOT ${taskVisibleSql(sql`t.project_id`, sql`btrim(t.assignee_email)`, identity)}
       ORDER BY t.id
    `)
  )
  return rows.map((r) => Number(r.id))
}
