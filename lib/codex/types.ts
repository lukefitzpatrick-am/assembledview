import type { BadgeProps } from "@/components/ui/badge"

export const TASK_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "waiting",
  "done",
] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

/** Alias used by Tasks page / form — single source of truth. */
export const STATUSES = [
  { value: "backlog" as const, label: "Backlog", badgeVariant: "secondary" as const },
  { value: "todo" as const, label: "To do", badgeVariant: "info" as const },
  {
    value: "in_progress" as const,
    label: "In progress",
    badgeVariant: "default" as const,
  },
  { value: "waiting" as const, label: "Waiting", badgeVariant: "warning" as const },
  { value: "done" as const, label: "Done", badgeVariant: "success" as const },
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

export type TaskSource = (typeof TASK_SOURCES)[number]

export type CodexTask = {
  id: number | string
  title: string
  client_id: number
  status: TaskStatus | string
  priority?: TaskPriority | string | null
  assignee_email?: string | null
  assignee_name?: string | null
  due_date?: string | null
  mba_number?: string | null
  description?: string | null
  client_visible?: boolean | null
  /** @deprecated prefer created_by_email — kept for TasksPageClient compat */
  created_by?: string | null
  created_by_email?: string | null
  category?: TaskCategory | string | null
  source?: TaskSource | string | null
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
      badgeVariant: "outline" as const,
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
