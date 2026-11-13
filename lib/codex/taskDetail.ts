/**
 * Codex task detail for project tasks (S1, B40, plan 4.2, 4.4 steps 2 to 4,
 * 10): pure rules. No database, no server-only.
 *
 * - Assigned by: set by the server, never sent by the client. When an
 *   assignee change gives the task to someone other than the person saving,
 *   assigned by is that person; giving it to yourself or to no one clears it.
 * - Dates: `start_on` and `due_on` are Sydney civil dates. A start after the
 *   due date is refused. `due_on` and `due_date` are never both sent in one
 *   change (the 0118 trigger keeps them in step from whichever one changes;
 *   both changing at once could leave them apart, stack review L4).
 * - Type: a task or a milestone can switch between the two. A subtask stays
 *   a subtask, and nothing becomes a subtask except by being made under a
 *   parent. Help and approval are not set here.
 * - Subtasks (`task_type = 'subtask'`, `parent_task_id`): one level only. A
 *   subtask lives in its parent's project and has no section, so it is never
 *   a card on the project board; the board shows a count on the parent.
 *   Its own assignee, dates and status. Up to 100 per task.
 */
import { isCivilYmd, normaliseEmail, type ParseResult } from "@/lib/codex/projects"
import { TASK_TITLE_MAX } from "@/lib/codex/types"
import { parseCustomValuesPatch, type CustomValuesPatch } from "@/lib/codex/customFields"

export const TASK_TYPES = ["task", "subtask", "help", "milestone", "approval"] as const
export type TaskType = (typeof TASK_TYPES)[number]

/** Types a PATCH may set. */
export const EDITABLE_TASK_TYPES = ["task", "milestone"] as const
export type EditableTaskType = (typeof EDITABLE_TASK_TYPES)[number]

export const SUBTASKS_PER_TASK_MAX = 100

/** Priorities once 0118 widens the check. `asap` is refused before it. */
export const S1_PRIORITIES = ["low", "normal", "high", "asap"] as const

export function isTaskType(value: unknown): value is TaskType {
  return typeof value === "string" && (TASK_TYPES as readonly string[]).includes(value)
}

function fail(error: string, message: string): { ok: false; error: string; message: string } {
  return { ok: false, error, message }
}

/**
 * Assigned by after an assignee change. `null` assignee (unassigned) or the
 * actor themselves: null. Anyone else: the actor. Emails compared lower case.
 */
export function assignedByAfterAssign(newAssignee: string | null | undefined, actorEmail: string | null | undefined): string | null {
  const assignee = normaliseEmail(newAssignee)
  const actor = normaliseEmail(actorEmail)
  if (!assignee || !actor || assignee === actor) return null
  return actor
}

/** Did the assignee change (lower case, blank is none)? */
export function assigneeChanged(before: string | null | undefined, after: string | null | undefined): boolean {
  return normaliseEmail(before) !== normaliseEmail(after)
}

/** Start on or before due. Either may be empty. */
export function checkTaskDates(startOn: string | null, dueOn: string | null): { ok: true } | { ok: false; reason: "start_after_due"; message: string } {
  if (startOn && dueOn && startOn > dueOn) {
    return { ok: false, reason: "start_after_due", message: "The start date is after the due date." }
  }
  return { ok: true }
}

export type TypeChangeFailure = { ok: false; reason: "task_type_fixed"; message: string }

/** Task to milestone and back. A subtask, help or approval task keeps its type. */
export function checkTaskTypeChange(current: string, next: EditableTaskType): { ok: true } | TypeChangeFailure {
  if (current === next) return { ok: true }
  if (current === "task" || current === "milestone") return { ok: true }
  return {
    ok: false,
    reason: "task_type_fixed",
    message: current === "subtask" ? "A subtask cannot become a task or a milestone." : "This task's type cannot change.",
  }
}

/**
 * The S1 part of a PATCH body (B40). Only the keys present are returned.
 * `due_on` with `due_date` in the same body is refused.
 */
export type TaskDetailPatch = {
  start_on?: string | null
  due_on?: string | null
  task_type?: EditableTaskType
  custom_values?: CustomValuesPatch
}

export const TASK_DETAIL_KEYS = ["start_on", "due_on", "task_type", "custom_values"] as const

export function hasTaskDetailKeys(raw: Record<string, unknown>): boolean {
  return TASK_DETAIL_KEYS.some((k) => k in raw)
}

function readDate(raw: unknown, field: string): ParseResult<string | null> {
  if (raw === null || raw === "") return { ok: true, value: null }
  if (!isCivilYmd(raw)) return fail(`invalid_${field}`, `${field} must be a date (YYYY-MM-DD) or null.`)
  return { ok: true, value: raw }
}

export function parseTaskDetailPatch(raw: Record<string, unknown>): ParseResult<TaskDetailPatch> {
  const out: TaskDetailPatch = {}
  if ("due_on" in raw && "due_date" in raw) {
    return fail("invalid_due_on", "Send due_on or due_date, not both.")
  }
  if ("start_on" in raw) {
    const d = readDate(raw.start_on, "start_on")
    if (!d.ok) return d
    out.start_on = d.value
  }
  if ("due_on" in raw) {
    const d = readDate(raw.due_on, "due_on")
    if (!d.ok) return d
    out.due_on = d.value
  }
  if (out.start_on !== undefined && out.due_on !== undefined) {
    const dates = checkTaskDates(out.start_on, out.due_on)
    if (!dates.ok) return fail(dates.reason, dates.message)
  }
  if ("task_type" in raw) {
    if (raw.task_type !== "task" && raw.task_type !== "milestone") {
      return fail("invalid_task_type", "task_type must be task or milestone.")
    }
    out.task_type = raw.task_type
  }
  if ("custom_values" in raw) {
    const v = parseCustomValuesPatch(raw.custom_values)
    if (!v.ok) return v
    out.custom_values = v.value
  }
  return { ok: true, value: out }
}

export type CreateSubtaskInput = {
  title: string
  assignee_email: string | null
  start_on: string | null
  due_on: string | null
}

/** `{ title, assignee_email?, start_on?, due_on? }` for a new subtask. */
export function parseCreateSubtaskInput(body: unknown): ParseResult<CreateSubtaskInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("invalid_body", "Send a JSON object.")
  const b = body as Record<string, unknown>
  const title = typeof b.title === "string" ? b.title.trim().replace(/\s+/g, " ") : ""
  if (!title) return fail("invalid_title", "The subtask needs a title.")
  if (title.length > TASK_TITLE_MAX) return fail("invalid_title", `Titles are ${TASK_TITLE_MAX} characters or fewer.`)
  let assignee: string | null = null
  if (b.assignee_email !== undefined && b.assignee_email !== null && b.assignee_email !== "") {
    const email = typeof b.assignee_email === "string" ? normaliseEmail(b.assignee_email) : ""
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
      return fail("invalid_assignee_email", "assignee_email must be an email address.")
    }
    assignee = email
  }
  const start = b.start_on === undefined ? { ok: true as const, value: null } : readDate(b.start_on, "start_on")
  if (!start.ok) return start
  const due = b.due_on === undefined ? { ok: true as const, value: null } : readDate(b.due_on, "due_on")
  if (!due.ok) return due
  const dates = checkTaskDates(start.value, due.value)
  if (!dates.ok) return fail(dates.reason, dates.message)
  return { ok: true, value: { title, assignee_email: assignee, start_on: start.value, due_on: due.value } }
}

export type SubtaskParentFacts = { task_type: string; parent_task_id: number | null; subtask_count: number }

export type SubtaskRuleFailure = {
  ok: false
  reason: "nested_subtask" | "too_many_subtasks"
  message: string
}

/** One level: a subtask or a help child cannot have subtasks. */
export function checkSubtaskParent(parent: SubtaskParentFacts): { ok: true } | SubtaskRuleFailure {
  if (parent.task_type === "subtask" || parent.parent_task_id != null) {
    return { ok: false, reason: "nested_subtask", message: "Subtasks go one level deep. Add it to the parent task instead." }
  }
  if (parent.subtask_count >= SUBTASKS_PER_TASK_MAX) {
    return { ok: false, reason: "too_many_subtasks", message: `A task can have up to ${SUBTASKS_PER_TASK_MAX} subtasks.` }
  }
  return { ok: true }
}

/** `{ ordered_ids }` names every live subtask of the parent once. */
export function checkSubtaskOrder(current: readonly number[], ordered: readonly number[]): boolean {
  if (current.length !== ordered.length) return false
  const want = new Set(current)
  const seen = new Set<number>()
  for (const id of ordered) {
    if (!want.has(id) || seen.has(id)) return false
    seen.add(id)
  }
  return true
}

/** Card and list marker for a task's type. */
export function taskTypeBadge(taskType: string | null | undefined): string | null {
  if (taskType === "milestone") return "Milestone"
  if (taskType === "subtask") return "Subtask"
  return null
}
