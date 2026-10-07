import type { BadgeProps } from "@/components/ui/badge"
import { CODEX_TASK_STATUS } from "@/lib/design/status"

export const TASK_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "waiting",
  "done",
] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

/** First board column that is not done — help children land here. */
export const FIRST_OPEN_TASK_STATUS: TaskStatus = TASK_STATUSES[0]

export const ASK_HELP_MAX_CHARS = 280

/** Alias used by Tasks page / form — single source of truth. */
export const STATUSES = [
  { value: "backlog" as const, label: "Backlog", badgeVariant: CODEX_TASK_STATUS.backlog.tone },
  { value: "todo" as const, label: "To do", badgeVariant: CODEX_TASK_STATUS.todo.tone },
  {
    value: "in_progress" as const,
    label: "In progress",
    badgeVariant: CODEX_TASK_STATUS.in_progress.tone,
  },
  { value: "waiting" as const, label: "Waiting", badgeVariant: CODEX_TASK_STATUS.waiting.tone },
  { value: "done" as const, label: "Done", badgeVariant: CODEX_TASK_STATUS.done.tone },
] satisfies ReadonlyArray<{
  value: TaskStatus
  label: string
  badgeVariant: NonNullable<BadgeProps["variant"]>
}>

export type TaskPriority = "low" | "normal" | "high"

export const TASK_PRIORITIES = [
  { value: "low" as const, label: "Low" },
  { value: "normal" as const, label: "Normal" },
  { value: "high" as const, label: "High" },
]

export const TASK_CATEGORIES = [
  "reporting",
  "pacing",
  "creative",
  "finance",
  "admin",
  "meeting_followup",
  "other",
] as const

export type TaskCategory = (typeof TASK_CATEGORIES)[number]

export const TASK_CATEGORY_OPTIONS = [
  { value: "reporting" as const, label: "Reporting" },
  { value: "pacing" as const, label: "Pacing" },
  { value: "creative" as const, label: "Creative" },
  { value: "finance" as const, label: "Finance" },
  { value: "admin" as const, label: "Admin" },
  { value: "meeting_followup" as const, label: "Meeting follow-up" },
  { value: "other" as const, label: "Other" },
] satisfies ReadonlyArray<{ value: TaskCategory; label: string }>

export const TASK_SOURCES = ["manual", "ava", "template", "recurring"] as const

export type TaskSource = (typeof TASK_SOURCES)[number] | `profile:${string}`

export type CodexTask = {
  id: number | string
  title: string
  client_id: number
  status: TaskStatus | string
  priority?: TaskPriority | string | null
  assignee_email?: string | null
  assignee_name?: string | null
  due_date?: string | null
  /** Planner estimate in minutes. Null until set. */
  estimated_minutes?: number | null
  mba_number?: string | null
  description?: string | null
  client_visible?: boolean | null
  /** @deprecated prefer created_by_email — kept for TasksPageClient compat */
  created_by?: string | null
  created_by_email?: string | null
  category?: TaskCategory | string | null
  source?: TaskSource | string | null
  source_note_id?: number | null
  /** Fireflies unique-roster auto-create (distinct from Inbox accept, also source=ava). */
  auto_created?: boolean
  ava_auto_key?: string | null
  /** Retainer series: boring text rule — see docs/brain/modules/codex.md */
  recurring_rule?: string | null
  /** When set, create/apply copies template checklist items onto the task. */
  template_id?: number | null
  deleted_at?: string | null
  updated_at?: string | null
  created_at?: string | null
  /** Present on list responses — checklist progress for board cards. */
  checklist_done?: number
  checklist_total?: number
  /** Help-request child → parent. Null on ordinary tasks. */
  parent_task_id?: number | null
  help_requested_by_email?: string | null
  help_prior_status?: string | null
  /** List/card: parent title when this row is a help child. */
  parent_title?: string | null
  /** Detail: help children of this parent (open and done). */
  children?: HelpChildSummary[]
  /** Detail: parent snapshot when this row is a help child. */
  parent?: HelpParentSummary | null
}

export type HelpChildSummary = {
  id: number
  title: string
  assignee_email: string | null
  assignee_name: string | null
  status: string
}

export type HelpParentSummary = {
  id: number
  title: string
  assignee_email: string | null
  assignee_name: string | null
  status: string
  description: string | null
}

/** Checklist blueprint — name + ordered labels. */
export type TaskTemplate = {
  id: number
  name: string
  description: string | null
  created_at: string
  /** Present on get/list-with-items responses. */
  items?: TaskTemplateItem[]
}

export type TaskTemplateItem = {
  id: number
  template_id: number
  label: string
  sort: number
}

export type TeamMember = {
  id: number
  email: string
  name: string
  role_title: string | null
  active: boolean
  capacity_notes: string | null
  working_style: string | null
  default_client_ids: number[]
  created_at: string
  updated_at: string
  email_aliases?: string[]
  auth0_user_id?: string | null
  roster_source?: string | null
  last_login_at?: string | null
}

/** Stage 1 detail panel — checklist row (snake_case API). */
export type ChecklistItem = {
  id: number
  task_id: number
  label: string
  done: boolean
  sort: number
}

/**
 * Stage 1 detail panel — comment row.
 * `author_kind` is `user` | `ava` (AVA comments arrive Stage 4; keep the column open).
 */
export type TaskComment = {
  id: number
  task_id: number
  body: string
  created_at: string
  author_email: string | null
  author_name: string | null
  author_kind: "user" | "ava"
}

/** Append-only activity row (snake_case API). */
export type CodexActivity = {
  id: number
  entity_type: string
  entity_id: number
  actor_email: string | null
  actor_kind: string
  action: string
  before: unknown
  after: unknown
  created_at: string
}

export type CodexPagedResponse<T> = {
  items: T[]
  itemsTotal: number
  curPage?: number
  nextPage?: number | null
  prevPage?: number | null
  pageTotal?: number
}

export function statusMeta(status: string) {
  return (
    STATUSES.find((s) => s.value === status) ?? {
      value: status as TaskStatus,
      label: status,
      badgeVariant: "neutral" as const,
    }
  )
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return (
    typeof value === "string" &&
    (TASK_STATUSES as readonly string[]).includes(value)
  )
}

export function isTaskCategory(value: unknown): value is TaskCategory {
  return (
    typeof value === "string" &&
    (TASK_CATEGORIES as readonly string[]).includes(value)
  )
}

export const TASK_TITLE_MAX = 300
/** One week of minutes. */
export const TASK_ESTIMATE_MINUTES_MAX = 10_080

const TASK_PRIORITY_VALUES = ["low", "normal", "high"] as const

export type TaskInputField =
  | "title"
  | "status"
  | "priority"
  | "due_date"
  | "estimated_minutes"
  | "category"
  | "assignee_email"

export type TaskInputIssue = {
  field: TaskInputField
  message: string
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isCalendarYmd(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  const probe = new Date(Date.UTC(year, month - 1, day))
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  )
}

function isEstimateInRange(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= 0 &&
    value <= TASK_ESTIMATE_MINUTES_MAX
  )
}

/** Integer 0..10080, or null. Empty string clears. Anything else is absent. */
export function readEstimatedMinutes(value: unknown): number | null | undefined {
  if (value === null || value === "") return null
  if (typeof value === "number" && isEstimateInRange(value)) return value
  if (typeof value === "string" && /^(0|[1-9]\d*)$/.test(value.trim())) {
    const n = Number(value.trim())
    if (isEstimateInRange(n)) return n
  }
  return undefined
}

/**
 * Validates only the keys present on `partial`.
 * Assignee emails are checked case-insensitively; the route still passes the
 * raw string through so the repo remains the only place that lowercases.
 */
export function validateTaskInput(
  partial: Partial<Record<TaskInputField, unknown>>
): TaskInputIssue | null {
  if ("title" in partial) {
    const title = partial.title
    if (typeof title !== "string" || title.trim().length === 0) {
      return { field: "title", message: "title is required." }
    }
    if (title.trim().length > TASK_TITLE_MAX) {
      return {
        field: "title",
        message: `title must be ${TASK_TITLE_MAX} characters or fewer.`,
      }
    }
  }

  if ("status" in partial) {
    if (!isTaskStatus(partial.status)) {
      return {
        field: "status",
        message: `status must be one of: ${TASK_STATUSES.join(", ")}.`,
      }
    }
  }

  if ("priority" in partial) {
    const priority = partial.priority
    if (
      priority !== null &&
      (typeof priority !== "string" ||
        !(TASK_PRIORITY_VALUES as readonly string[]).includes(priority))
    ) {
      return {
        field: "priority",
        message: "priority must be one of: low, normal, high, or null.",
      }
    }
  }

  if ("due_date" in partial) {
    const due = partial.due_date
    if (due !== null && (typeof due !== "string" || !isCalendarYmd(due))) {
      return {
        field: "due_date",
        message: "due_date must be a YYYY-MM-DD calendar date or null.",
      }
    }
  }

  if ("estimated_minutes" in partial) {
    if (readEstimatedMinutes(partial.estimated_minutes) === undefined) {
      return {
        field: "estimated_minutes",
        message: `estimated_minutes must be an integer from 0 to ${TASK_ESTIMATE_MINUTES_MAX}, or null.`,
      }
    }
  }

  if ("category" in partial) {
    const category = partial.category
    if (category !== null && !isTaskCategory(category)) {
      return {
        field: "category",
        message:
          "category must be one of: reporting, pacing, creative, finance, admin, meeting_followup, other, or null.",
      }
    }
  }

  if ("assignee_email" in partial) {
    const email = partial.assignee_email
    if (email !== null) {
      const trimmed = typeof email === "string" ? email.trim().toLowerCase() : ""
      if (!EMAIL.test(trimmed)) {
        return {
          field: "assignee_email",
          message: "assignee_email must be an email address or null.",
        }
      }
    }
  }

  return null
}

export function isTaskSource(value: unknown): value is TaskSource {
  return (
    typeof value === "string" &&
    (TASK_SOURCES as readonly string[]).includes(value)
  )
}

export function categoryLabel(category: string | null | undefined): string {
  if (!category) return "—"
  return (
    TASK_CATEGORY_OPTIONS.find((o) => o.value === category)?.label ?? category
  )
}
