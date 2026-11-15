/**
 * The progress field rule (B42, plan 4.2, the SEO rule), one fixed
 * behaviour behind `codex_progress_field`:
 * - completing a task in a project whose progress field is linked sets that
 *   field to its done option (`markProgressDone`), from every completing
 *   path: PATCH and bulk (`writeTaskInTx`), board moves and Mark complete
 *   (`placeTask`), paste into a done section, and the writers in
 *   `sectionSync.ts` (Ask for help restore, relabel auto-close);
 * - setting the field to the done option completes the task (`writeTaskInTx`
 *   adds status done, so it moves to the first done section);
 * - linking the field sets it to the done option on the project's tasks
 *   already done (`markDoneTasksOnLink`, C-263, B43), in the link's
 *   transaction.
 *
 * Raw SQL only (C-210) and no import of repo.ts or projectsRepo.ts, so
 * sectionSync.ts can use it. The pure parts are in `customFields.ts`.
 */
import "server-only"

import { sql } from "drizzle-orm"

import { progressRuleFromField, readStoredValues, valuesOnComplete, type ProgressRule } from "@/lib/codex/customFields"
import { executeRows } from "@/lib/codex/estimatedMinutesColumn"
import { isCodexProgressFieldEnabled } from "@/lib/codex/flag"
import type { DbExecutor } from "@/lib/codex/repo"

/** The project's rule, or null (switch off, no link, or a field without a live done option). */
export async function loadProgressRule(tx: DbExecutor, projectId: number | null): Promise<ProgressRule | null> {
  if (projectId == null || !(await isCodexProgressFieldEnabled())) return null
  const row = executeRows(
    await tx.execute(sql`
      SELECT f.id, f.field_type, f.options, f.done_option
        FROM public.codex_projects p
        JOIN public.codex_custom_fields f ON f.id = p.progress_field_id AND f.project_id = p.id
       WHERE p.id = ${projectId}
    `)
  )[0]
  if (!row) return null
  return progressRuleFromField({
    id: Number(row.id),
    field_type: String(row.field_type),
    options: row.options,
    done_option: row.done_option == null ? null : String(row.done_option),
  })
}

/**
 * The task just became done: set its progress field to the done option
 * (with an activity row), unless it already holds it. Reads the task's
 * project itself; a task in no project, or a project without a rule, is left.
 */
export async function markProgressDone(tx: DbExecutor, taskId: number, actorEmail: string | null): Promise<boolean> {
  const task = executeRows(
    await tx.execute(sql`SELECT project_id, custom_values FROM public.tasks WHERE id = ${taskId} AND deleted_at IS NULL`)
  )[0]
  if (!task || task.project_id == null) return false
  const rule = await loadProgressRule(tx, Number(task.project_id))
  if (!rule) return false
  const before = readStoredValues(task.custom_values)
  const after = valuesOnComplete(rule, before)
  if (!after) return false
  await tx.execute(sql`UPDATE public.tasks SET custom_values = ${JSON.stringify(after)}::jsonb, updated_at = now() WHERE id = ${taskId}`)
  await tx.execute(sql`
    INSERT INTO public.codex_activity (entity_type, entity_id, actor_email, actor_kind, action, before, after)
    VALUES ('task', ${taskId}, ${actorEmail?.toLowerCase() ?? null}, ${actorEmail ? "user" : "system"}, 'update',
            ${JSON.stringify({ custom_values: before })}::jsonb, ${JSON.stringify({ custom_values: after })}::jsonb)
  `)
  return true
}

/**
 * C-263 (B43): the project's progress field was just linked: set it to the
 * done option on every live task in the project that is already done and
 * does not hold it, each with an activity row by the person who linked it.
 * Same transaction as the link (the caller holds the project row), task rows
 * locked in id order. Switch off, no rule, or no such task: nothing. Returns
 * how many tasks changed.
 */
export async function markDoneTasksOnLink(tx: DbExecutor, projectId: number, actorEmail: string | null): Promise<number> {
  const rule = await loadProgressRule(tx, projectId)
  if (!rule) return 0
  const rows = executeRows(
    await tx.execute(sql`
      SELECT id, custom_values FROM public.tasks
       WHERE project_id = ${projectId} AND status = 'done' AND deleted_at IS NULL
       ORDER BY id
         FOR UPDATE
    `)
  )
  let changed = 0
  for (const row of rows) {
    const before = readStoredValues(row.custom_values)
    const after = valuesOnComplete(rule, before)
    if (!after) continue
    const taskId = Number(row.id)
    await tx.execute(sql`UPDATE public.tasks SET custom_values = ${JSON.stringify(after)}::jsonb, updated_at = now() WHERE id = ${taskId}`)
    await tx.execute(sql`
      INSERT INTO public.codex_activity (entity_type, entity_id, actor_email, actor_kind, action, before, after)
      VALUES ('task', ${taskId}, ${actorEmail?.toLowerCase() ?? null}, ${actorEmail ? "user" : "system"}, 'update',
              ${JSON.stringify({ custom_values: before })}::jsonb, ${JSON.stringify({ custom_values: after })}::jsonb)
    `)
    changed += 1
  }
  return changed
}
