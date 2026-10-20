import { TASK_STATUSES, type TaskStatus } from "./types.js"

/**
 * Board column counts when GET /api/codex/tasks/status-counts fails.
 * Uses the loaded column sizes so the board still renders its tasks.
 * Counts are a floor: "load more" stays hidden until the real counts return.
 */
export function statusCountsFromColumns(
  columns: Partial<Record<TaskStatus, readonly unknown[]>>
): Record<TaskStatus, number> {
  const counts = {} as Record<TaskStatus, number>
  for (const status of TASK_STATUSES) {
    counts[status] = columns[status]?.length ?? 0
  }
  return counts
}
