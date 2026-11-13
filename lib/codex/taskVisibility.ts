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
 * The 0118 columns exist only after marker `0118_codex_s1_projects`, so the
 * helpers that touch the database add nothing before it (no private project
 * can exist before 0118). After it they filter with `codex_projects` on or
 * off: a project made private stays private if the switch goes off.
 */
import "server-only"

import { sql, type SQL } from "drizzle-orm"

import { executeRows } from "@/lib/codex/estimatedMinutesColumn"
import { normaliseEmail } from "@/lib/codex/projects"
import { isProjectsMigrationApplied } from "@/lib/codex/projectsMarker"
import type { DbExecutor } from "@/lib/codex/repo"

/** The tasks list's own column (Drizzle selects from "tasks"). */
export const TASKS_PROJECT_ID: SQL = sql`"tasks"."project_id"`

/**
 * SQL: the project `projectId` names is visible to the viewer (or there is
 * no project). The viewer is an email (normalised here; empty sees public
 * projects only) or an SQL expression already lower case, such as
 * `n.recipient_email` for the digest.
 */
export function taskVisibleSql(projectId: SQL, viewerEmail: string | null | undefined | SQL): SQL {
  const viewer: SQL | null =
    viewerEmail != null && typeof viewerEmail === "object"
      ? viewerEmail
      : normaliseEmail(viewerEmail)
        ? sql`${normaliseEmail(viewerEmail)}`
        : null
  const viewerCanSee = viewer
    ? sql` OR lower(vp.owner_email) = ${viewer} OR lower(vp.created_by_email) = ${viewer}
        OR EXISTS (SELECT 1 FROM public.codex_project_members vm WHERE vm.project_id = vp.id AND lower(vm.email) = ${viewer})`
    : sql``
  return sql`(${projectId} IS NULL OR EXISTS (
    SELECT 1 FROM public.codex_projects vp WHERE vp.id = ${projectId} AND (vp.is_private = false${viewerCanSee})))`
}

/** The visibility condition for a tasks query, or undefined before 0118 (nothing to hide). */
export async function taskVisibilityCondition(
  database: DbExecutor,
  viewerEmail: string | null | undefined,
  projectId: SQL = TASKS_PROJECT_ID
): Promise<SQL | undefined> {
  if (!(await isProjectsMigrationApplied(database))) return undefined
  return taskVisibleSql(projectId, viewerEmail)
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
  if (clean.length === 0 || !(await isProjectsMigrationApplied(database))) return new Set()
  const rows = executeRows(
    await database.execute(sql`
      SELECT t.id FROM public.tasks t
       WHERE t.id IN (${sql.join(clean.map((id) => sql`${id}::bigint`), sql`, `)})
         AND NOT ${taskVisibleSql(sql`t.project_id`, viewerEmail)}
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
