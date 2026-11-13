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

import { executeRows } from "@/lib/codex/estimatedMinutesColumn"
import { isCodexRosterAliasesEnabled } from "@/lib/codex/flag"
import { AssigneeNoAccessError, buildAccessIdentity, canonicalEmail, NO_ALIASES, type AccessIdentity } from "@/lib/codex/projects"
import { isProjectsMigrationApplied } from "@/lib/codex/projectsMarker"
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
      on = await isCodexRosterAliasesEnabled()
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
  if (!(await isProjectsMigrationApplied(database))) return undefined
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
  if (clean.length === 0 || !(await isProjectsMigrationApplied(database))) return new Set()
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
  if (projectId == null || clean.length === 0 || !(await isProjectsMigrationApplied(database))) return []
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

/** F5: throw AssigneeNoAccessError when `email` cannot see the project task `taskId` is in. */
export async function assertAssigneeCanSeeTask(database: DbExecutor, taskId: number, email: string | null | undefined): Promise<void> {
  if (!(email ?? "").trim() || !(await isProjectsMigrationApplied(database))) return
  const [peek] = executeRows(await database.execute(sql`SELECT project_id FROM public.tasks WHERE id = ${taskId}`))
  const projectId = peek?.project_id == null ? null : Number(peek.project_id)
  const [refused] = await emailsWithoutProjectAccess(database, projectId, [email])
  if (refused) throw new AssigneeNoAccessError(refused)
}
