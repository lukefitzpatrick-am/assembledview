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
  created_by?: string | null
  updated_at?: string | null
  created_at?: string | null
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
