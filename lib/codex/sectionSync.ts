/**
 * C-220 (B42): the status writers outside PATCH, bulk and the boards follow
 * the section rule for a task in a project.
 *
 * Ask for help (the parent goes to waiting), a help child done (the parent
 * goes back to its prior status), a done help child reopened (the parent
 * waits again) and the relabel auto-close (done) set `tasks.status` inside
 * their own transaction. Right after that write they call
 * `followSectionRule`, which moves a project task to the section its new
 * status names, by the same plan PATCH uses (`planStatusChangeInProject`):
 * its own section when that already has the status, the first done section
 * for done, else the first section with that category. It goes last in the
 * section, with the usual `move_section` activity row (ids only for a private
 * project).
 *
 * These writers never refuse: when the project has no section with that
 * status (a project without a Waiting section and Ask for help), the task
 * keeps its section and the new status, as before. Done always has a section
 * (a project keeps at least one). A subtask has no section and is left
 * alone. Before 0118 nothing is read.
 *
 * Lock order: the project row, then the task row (as every section writer).
 * A top-level writer (Ask for help, auto-close) locks the project first
 * (`lockTaskProject`) and waits for it. A help parent changed inside its
 * child's write is already behind the child's row lock, so there the project
 * is tried with NOWAIT in a savepoint: when it is busy the parent keeps its
 * section (as before C-220) rather than risk a deadlock.
 *
 * Raw SQL only (the 0118 columns are not mirrored, C-210), and no import of
 * repo.ts or projectsRepo.ts, so repo.ts can call it without a cycle.
 */
import "server-only"

import { sql } from "drizzle-orm"

import { executeRows } from "@/lib/codex/estimatedMinutesColumn"
import { planStatusChangeInProject, type CodexSection } from "@/lib/codex/projects"
import { isProjectsMigrationApplied } from "@/lib/codex/projectsMarker"
import type { DbExecutor } from "@/lib/codex/repo"

export type SectionRuleOutcome = "not_in_project" | "stayed" | "moved" | "no_section_for_status" | "project_busy"

/** Lock the project of task `taskId` (if any) before the task is written: the section writers' order. */
export async function lockTaskProject(tx: DbExecutor, taskId: number): Promise<void> {
  if (!(await isProjectsMigrationApplied(tx))) return
  await tx.execute(sql`
    SELECT p.id FROM public.codex_projects p
     WHERE p.id = (SELECT t.project_id FROM public.tasks t WHERE t.id = ${taskId})
       FOR UPDATE OF p
  `)
}

/** After `status` was written to task `taskId` in this transaction: move it by the section rule. */
export async function followSectionRule(
  tx: DbExecutor,
  taskId: number,
  status: string,
  actorEmail: string | null,
  opts: { nowait?: boolean } = {}
): Promise<SectionRuleOutcome> {
  if (!(await isProjectsMigrationApplied(tx))) return "not_in_project"
  const peek = executeRows(
    await tx.execute(sql`SELECT project_id FROM public.tasks WHERE id = ${taskId} AND deleted_at IS NULL`)
  )[0]
  if (!peek || peek.project_id == null) return "not_in_project"
  const projectId = Number(peek.project_id)
  let project: Record<string, unknown> | undefined
  if (opts.nowait) {
    try {
      project = await tx.transaction(async (sp) =>
        executeRows(await sp.execute(sql`SELECT id, is_private FROM public.codex_projects WHERE id = ${projectId} FOR UPDATE NOWAIT`))[0]
      )
    } catch (err) {
      // 55P03 lock_not_available (Drizzle wraps it: the code is on the cause).
      const e = err as { code?: string; cause?: { code?: string } }
      if (e?.code === "55P03" || e?.cause?.code === "55P03") return "project_busy"
      throw err
    }
  } else {
    project = executeRows(
      await tx.execute(sql`SELECT id, is_private FROM public.codex_projects WHERE id = ${projectId} FOR UPDATE`)
    )[0]
  }
  const isPrivate = project?.is_private !== false
  const task = executeRows(
    await tx.execute(sql`
      SELECT id, project_id, section_id, sort_order, coalesce(task_type, 'task') AS task_type
        FROM public.tasks WHERE id = ${taskId} AND deleted_at IS NULL FOR UPDATE
    `)
  )[0]
  if (!task || task.project_id == null || Number(task.project_id) !== projectId) return "not_in_project"
  if (task.task_type === "subtask") return "not_in_project"
  const sections = executeRows(
    await tx.execute(sql`
      SELECT id, project_id, name, sort_order, status_category
        FROM public.codex_sections WHERE project_id = ${projectId} ORDER BY sort_order, id
    `)
  ).map((r) => ({
    id: Number(r.id),
    project_id: Number(r.project_id),
    name: String(r.name ?? ""),
    sort_order: Number(r.sort_order ?? 0),
    status_category: String(r.status_category) as CodexSection["status_category"],
  }))
  const sectionId = task.section_id == null ? null : Number(task.section_id)
  const plan = planStatusChangeInProject({ project_id: projectId, section_id: sectionId, status }, sections, status)
  if (!plan.ok) return "no_section_for_status"
  if (!plan.inProject || plan.section_id === sectionId) return "stayed"
  const next = executeRows(
    await tx.execute(sql`
      SELECT coalesce(max(sort_order), -1) + 1 AS n FROM public.tasks
       WHERE section_id = ${plan.section_id} AND deleted_at IS NULL AND id <> ${taskId}
    `)
  )[0]
  await tx.execute(sql`
    UPDATE public.tasks SET section_id = ${plan.section_id}, sort_order = ${Number(next?.n ?? 0) || 0}, updated_at = now()
     WHERE id = ${taskId} AND deleted_at IS NULL
  `)
  const name = (id: number | null) => sections.find((s) => s.id === id)?.name ?? null
  const side = (id: number | null) =>
    isPrivate ? { project_id: projectId, section_id: id } : { project_id: projectId, section: name(id), section_id: id }
  await tx.execute(sql`
    INSERT INTO public.codex_activity (entity_type, entity_id, actor_email, actor_kind, action, before, after)
    VALUES ('task', ${taskId}, ${actorEmail?.toLowerCase() ?? null}, ${actorEmail ? "user" : "system"}, 'move_section',
            ${JSON.stringify(side(sectionId))}::jsonb, ${JSON.stringify(side(plan.section_id))}::jsonb)
  `)
  return "moved"
}
