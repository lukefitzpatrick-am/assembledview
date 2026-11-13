/**
 * Workload store (B42, plan 5.5, `codex_projects`). One grouped read of open
 * tasks by assignee and `due_on`, through the private-project rule with the
 * viewer's email, then bucketed by `buildWorkload`. Needs 0118 (`due_on`):
 * before it ProjectsUnavailableError (503).
 */
import "server-only"

import { asc, eq, sql } from "drizzle-orm"

import { db, schema, type Db } from "@/db"
import { executeRows } from "@/lib/codex/estimatedMinutesColumn"
import { isProjectsMigrationApplied } from "@/lib/codex/projectsMarker"
import { ProjectsUnavailableError } from "@/lib/codex/projectsRepo"
import { rosterDisplayName } from "@/lib/codex/rosterResolve"
import { loadAccessIdentity, taskVisibleSql } from "@/lib/codex/taskVisibility"
import { buildWorkload, workloadWeeks, type Workload } from "@/lib/codex/workload"

export async function loadWorkload(viewerEmail: string, weeks: number, now: Date = new Date(), database: Db = db): Promise<Workload> {
  if (!(await isProjectsMigrationApplied(database))) throw new ProjectsUnavailableError()
  const range = workloadWeeks(now, weeks)
  const people = await database
    .select({ email: schema.teamMembers.email, name: schema.teamMembers.name })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.active, true))
    .orderBy(asc(schema.teamMembers.name))
  const rows = executeRows(
    await database.execute(sql`
      SELECT lower(t.assignee_email) AS email, t.due_on::text AS due_on, count(*)::int AS n
        FROM public.tasks t
       WHERE t.deleted_at IS NULL AND t.status <> 'done' AND t.assignee_email IS NOT NULL
         AND ${taskVisibleSql(sql`t.project_id`, viewerEmail, await loadAccessIdentity(database))}
       GROUP BY 1, 2
    `)
  ).map((r) => ({ email: String(r.email), due_on: r.due_on == null ? null : String(r.due_on), n: Number(r.n) || 0 }))
  return {
    today: range.today,
    weeks: range.weeks,
    people: buildWorkload(
      people.map((p) => ({ email: p.email, name: rosterDisplayName(p) })),
      rows,
      range.today,
      range.weeks
    ),
  }
}
