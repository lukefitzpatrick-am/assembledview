/**
 * Codex task detail store for project tasks (S1, B40): the detail panel's
 * read (project, section, type, dates, assigned by, field values, subtasks)
 * and subtask create and reorder. Subtask edit, complete and delete are the
 * ordinary task PATCH and DELETE on the subtask's id.
 *
 * Behind codex_projects (routes) and the 0118 marker (ProjectsUnavailableError,
 * routes 503). The new tasks columns are raw SQL until mirrored (C-210).
 *
 * Lock order is the projects one: the project row, then the task row.
 */
import "server-only"

import { sql } from "drizzle-orm"

import { db, type Db } from "@/db"
import type { CodexCustomField, CustomValues } from "@/lib/codex/customFields"
import { readStoredValues } from "@/lib/codex/customFields"
import { executeRows } from "@/lib/codex/estimatedMinutesColumn"
import { assigneeNoAccessMessage, type CodexProject, type CodexSection } from "@/lib/codex/projects"
import {
  appendActivity,
  guarded,
  loadProjectFields,
  loadSections,
  loadVisibleProject,
  projectRowToApi,
  type ProjectFailure,
} from "@/lib/codex/projectsRepo"
import type { DbExecutor } from "@/lib/codex/repo"
import {
  assignedByAfterAssign,
  checkSubtaskOrder,
  checkSubtaskParent,
  type CreateSubtaskInput,
} from "@/lib/codex/taskDetail"
import { emailsWithoutProjectAccess } from "@/lib/codex/taskVisibility"
import { normaliseEmail } from "@/lib/email/address"

const TASK_NOT_FOUND: ProjectFailure = { ok: false, reason: "task_not_found", message: "Task not found." }

export type SubtaskSummary = {
  id: number
  title: string
  status: string
  assignee_email: string | null
  assignee_name: string | null
  start_on: string | null
  due_on: string | null
  sort_order: number | null
}

export type TaskS1Detail = {
  id: number
  task_type: string
  parent_task_id: number | null
  project_id: number | null
  section_id: number | null
  assigned_by_email: string | null
  start_on: string | null
  due_on: string | null
  custom_values: CustomValues
}

export type TaskProjectDetail = {
  ok: true
  task: TaskS1Detail
  /** Null when the task is in no project, or in a private one the viewer cannot see. */
  project: CodexProject | null
  project_hidden: boolean
  sections: CodexSection[]
  fields: CodexCustomField[]
  subtasks: SubtaskSummary[]
  /** A subtask's parent. */
  parent: { id: number; title: string } | null
}

const text = (v: unknown) => (v == null ? null : String(v))
const num = (v: unknown) => (v == null ? null : Number(v))

function subtaskFromRow(r: Record<string, unknown>): SubtaskSummary {
  return {
    id: Number(r.id),
    title: String(r.title ?? ""),
    status: String(r.status ?? "todo"),
    assignee_email: text(r.assignee_email),
    assignee_name: text(r.assignee_name),
    start_on: text(r.start_on),
    due_on: text(r.due_on),
    sort_order: num(r.sort_order),
  }
}

async function loadSubtasks(database: DbExecutor, parentId: number): Promise<SubtaskSummary[]> {
  const rows = executeRows(
    await database.execute(sql`
      SELECT id, title, status, assignee_email, assignee_name, start_on::text AS start_on, due_on::text AS due_on, sort_order
        FROM public.tasks
       WHERE parent_task_id = ${parentId} AND task_type = 'subtask' AND deleted_at IS NULL
       ORDER BY sort_order ASC NULLS LAST, id ASC
    `)
  )
  return rows.map(subtaskFromRow)
}

async function loadTaskS1(database: DbExecutor, taskId: number, lock = false): Promise<TaskS1Detail | null> {
  const rows = executeRows(
    await database.execute(sql`
      SELECT id, task_type, parent_task_id, project_id, section_id, assigned_by_email,
             start_on::text AS start_on, due_on::text AS due_on, custom_values
        FROM public.tasks
       WHERE id = ${taskId} AND deleted_at IS NULL
       ${lock ? sql`FOR UPDATE` : sql.empty()}
    `)
  )
  const r = rows[0]
  if (!r) return null
  return {
    id: Number(r.id),
    task_type: typeof r.task_type === "string" ? r.task_type : "task",
    parent_task_id: num(r.parent_task_id),
    project_id: num(r.project_id),
    section_id: num(r.section_id),
    assigned_by_email: text(r.assigned_by_email),
    start_on: text(r.start_on),
    due_on: text(r.due_on),
    custom_values: readStoredValues(r.custom_values),
  }
}

/** The detail panel's project part. A private project the viewer cannot see hides its project data and subtasks. */
export async function getTaskProjectDetail(
  taskId: number,
  viewerEmail: string,
  database: Db = db
): Promise<TaskProjectDetail | ProjectFailure> {
  return guarded(database, async () => {
    const task = await loadTaskS1(database, taskId)
    if (!task) return TASK_NOT_FOUND
    const visible = task.project_id != null ? await loadVisibleProject(database, task.project_id, viewerEmail) : null
    const hidden = task.project_id != null && !visible
    let parent: TaskProjectDetail["parent"] = null
    if (task.task_type === "subtask" && task.parent_task_id != null) {
      const [p] = executeRows(
        await database.execute(sql`SELECT id, title FROM public.tasks WHERE id = ${task.parent_task_id} AND deleted_at IS NULL`)
      )
      if (p) parent = { id: Number(p.id), title: String(p.title ?? "") }
    }
    return {
      ok: true as const,
      task: hidden ? { ...task, custom_values: {} } : task,
      project: visible ? projectRowToApi(visible.row, visible.members) : null,
      project_hidden: hidden,
      sections: visible ? await loadSections(database, task.project_id!) : [],
      fields: visible ? await loadProjectFields(database, task.project_id!) : [],
      subtasks: hidden ? [] : await loadSubtasks(database, taskId),
      parent,
    }
  })
}

/** Lock the parent's project (if any) then the parent; null when missing or hidden. */
async function lockParent(tx: DbExecutor, parentId: number, viewerEmail: string): Promise<TaskS1Detail | null> {
  const [peek] = executeRows(
    await tx.execute(sql`SELECT project_id FROM public.tasks WHERE id = ${parentId} AND deleted_at IS NULL`)
  )
  if (!peek) return null
  const projectId = num(peek.project_id)
  if (projectId != null && !(await loadVisibleProject(tx, projectId, viewerEmail, true))) return null
  const parent = await loadTaskS1(tx, parentId, true)
  if (!parent || parent.project_id !== projectId) return null
  return parent
}

/**
 * A new subtask, last under its parent: in the parent's project (no
 * section), client and MBA, to do, normal priority, created by the viewer.
 * Assigned by the viewer when it goes to someone else and `trackAssignedBy`.
 */
export async function createSubtask(
  parentId: number,
  viewerEmail: string,
  input: CreateSubtaskInput & { assignee_name?: string | null },
  database: Db = db
): Promise<{ ok: true; subtask: SubtaskSummary } | ProjectFailure> {
  return guarded(database, () =>
    database.transaction(async (tx) => {
      const parent = await lockParent(tx, parentId, viewerEmail)
      if (!parent) return TASK_NOT_FOUND
      const [countRow] = executeRows(
        await tx.execute(sql`
          SELECT count(*)::int AS n, coalesce(max(sort_order), -1) + 1 AS next
            FROM public.tasks
           WHERE parent_task_id = ${parentId} AND task_type = 'subtask' AND deleted_at IS NULL
        `)
      )
      const rule = checkSubtaskParent({ ...parent, subtask_count: Number(countRow?.n ?? 0) || 0 })
      if (!rule.ok) return rule
      // F5 (B42fix): a subtask of a private project's task goes only to someone who can see the project.
      const [refused] = await emailsWithoutProjectAccess(tx, parent.project_id, [input.assignee_email])
      if (refused) return { ok: false as const, reason: "assignee_no_access" as const, message: assigneeNoAccessMessage(refused) }
      const creator = normaliseEmail(viewerEmail)
      const assignedBy = assignedByAfterAssign(input.assignee_email, creator)
      const [inserted] = executeRows(
        await tx.execute(sql`
          INSERT INTO public.tasks (title, client_id, mba_number, status, priority, assignee_email, assignee_name,
                                    created_by_email, source, parent_task_id, task_type, project_id, sort_order,
                                    start_on, due_on, assigned_by_email, created_at, updated_at)
          SELECT ${input.title}, p.client_id, p.mba_number, 'todo', 'normal', ${input.assignee_email}, ${input.assignee_name ?? null},
                 ${creator}, 'manual', p.id, 'subtask', p.project_id, ${Number(countRow?.next ?? 0) || 0}::int,
                 ${input.start_on}::date, ${input.due_on}::date, ${assignedBy}, now(), now()
            FROM public.tasks p WHERE p.id = ${parentId}
          RETURNING id, title, status, assignee_email, assignee_name, start_on::text AS start_on, due_on::text AS due_on, sort_order
        `)
      )
      const subtask = subtaskFromRow(inserted)
      await appendActivity(tx, {
        entityType: "task",
        entityId: subtask.id,
        actorEmail: creator,
        action: "create",
        after: { ...subtask, task_type: "subtask", parent_task_id: parentId, assigned_by_email: assignedBy },
      })
      return { ok: true as const, subtask }
    })
  )
}

/** `orderedIds` names every live subtask of the parent once; sort_order becomes the index. */
export async function reorderSubtasks(
  parentId: number,
  viewerEmail: string,
  orderedIds: readonly number[],
  database: Db = db
): Promise<{ ok: true; subtasks: SubtaskSummary[] } | ProjectFailure> {
  return guarded(database, () =>
    database.transaction(async (tx) => {
      const parent = await lockParent(tx, parentId, viewerEmail)
      if (!parent) return TASK_NOT_FOUND
      const current = await loadSubtasks(tx, parentId)
      if (!checkSubtaskOrder(current.map((s) => s.id), orderedIds)) {
        return { ok: false, reason: "invalid_order", message: "ordered_ids must list every subtask of this task once." }
      }
      const values = sql.join(
        orderedIds.map((id, index) => sql`(${id}::bigint, ${index}::int)`),
        sql`, `
      )
      await tx.execute(sql`
        UPDATE public.tasks t SET sort_order = v.ord
          FROM (VALUES ${values}) AS v(id, ord)
         WHERE t.id = v.id AND t.parent_task_id = ${parentId} AND t.sort_order IS DISTINCT FROM v.ord
      `)
      await appendActivity(tx, {
        entityType: "task",
        entityId: parentId,
        actorEmail: viewerEmail,
        action: "subtasks_reorder",
        before: { ordered_ids: current.map((s) => s.id) },
        after: { ordered_ids: orderedIds },
      })
      return { ok: true as const, subtasks: await loadSubtasks(tx, parentId) }
    })
  )
}
