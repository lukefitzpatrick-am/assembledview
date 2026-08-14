/** Persistable width for the Codex task detail slide-over. */

export const TASK_DETAIL_WIDTH_KEY = "codex:task-detail-width:v1"
/** Matches `sm:max-w-xl` (36rem). */
export const TASK_DETAIL_WIDTH_DEFAULT = 576
export const TASK_DETAIL_WIDTH_MIN = 420

export function clampTaskDetailWidth(px: number, viewportWidth: number): number {
  if (!Number.isFinite(px)) return TASK_DETAIL_WIDTH_DEFAULT
  const vw = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 1280
  const max = Math.max(TASK_DETAIL_WIDTH_MIN, Math.round(vw * 0.8))
  return Math.min(max, Math.max(TASK_DETAIL_WIDTH_MIN, Math.round(px)))
}

export function readStoredTaskDetailWidth(viewportWidth: number): number {
  if (typeof window === "undefined") return TASK_DETAIL_WIDTH_DEFAULT
  try {
    const raw = window.localStorage.getItem(TASK_DETAIL_WIDTH_KEY)
    const n = raw != null ? Number(raw) : NaN
    if (!Number.isFinite(n)) return TASK_DETAIL_WIDTH_DEFAULT
    return clampTaskDetailWidth(n, viewportWidth)
  } catch {
    return TASK_DETAIL_WIDTH_DEFAULT
  }
}

export function persistTaskDetailWidth(px: number): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(TASK_DETAIL_WIDTH_KEY, String(Math.round(px)))
  } catch {
    /* quota / private mode */
  }
}
