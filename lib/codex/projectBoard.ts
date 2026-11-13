/**
 * Codex boards (B39): the pure parts of the board, shared by the Tasks board
 * (columns are statuses) and the project board (columns are the project's
 * sections, plan 5.1 and 5.4). No React, no database.
 *
 * - Column source: which columns a board shows and which column a task is in.
 * - Drag rules (plan 5.4): on a status board a drop into another column
 *   changes status; on a project board a drop into another section moves the
 *   task there (its status becomes the section's category; a done section
 *   completes it) and a drop inside a section changes the card order.
 * - Optimistic moves with rollback when the server refuses (409).
 * - The section header menu and the hide or show completed setting.
 */
import {
  checkDeleteSection,
  checkRecategorise,
  SECTION_STATUS_CATEGORIES,
  sortSections,
  statusForSectionCategory,
  type CodexSection,
  type SectionStatusCategory,
} from "@/lib/codex/projects"
import { isTaskStatus, STATUSES, TASK_STATUSES, type CodexTask, type TaskStatus } from "@/lib/codex/types"

// ---------------------------------------------------------------------------
// Column source
// ---------------------------------------------------------------------------

export type BoardColumnSource =
  | { kind: "status"; statusFilter?: readonly string[] | null }
  | { kind: "sections"; sections: readonly CodexSection[] }

export type BoardColumnDef = {
  /** Status value on a status board, `section:<id>` on a project board. */
  key: string
  label: string
  /** The status a card takes in this column. */
  status: TaskStatus
  sectionId: number | null
  collapsedDefault: boolean
}

export function sectionColumnKey(sectionId: number): string {
  return `section:${sectionId}`
}

export function sectionIdFromColumnKey(key: string): number | null {
  const m = /^section:([1-9]\d*)$/.exec(key)
  return m ? Number(m[1]) : null
}

/** Empty or missing filter shows every status column. A set filter shows those columns, in board order. */
export function visibleBoardStatuses(statusFilter: readonly string[] | null | undefined): TaskStatus[] {
  if (statusFilter == null || statusFilter.length === 0) return [...TASK_STATUSES]
  const selected = new Set(statusFilter.filter(isTaskStatus))
  return TASK_STATUSES.filter((status) => selected.has(status))
}

export function boardColumns(source: BoardColumnSource): BoardColumnDef[] {
  if (source.kind === "status") {
    const visible = new Set(visibleBoardStatuses(source.statusFilter))
    return STATUSES.filter((s) => visible.has(s.value)).map((s) => ({
      key: s.value,
      label: s.label,
      status: s.value,
      sectionId: null,
      collapsedDefault: false,
    }))
  }
  return sortSections(source.sections).map((s) => ({
    key: sectionColumnKey(s.id),
    label: s.name,
    status: statusForSectionCategory(s.status_category),
    sectionId: s.id,
    collapsedDefault: s.collapsed_default,
  }))
}

/** The column a task sits in, or null when the board has no column for it. */
export function columnKeyForTask(source: BoardColumnSource, task: Pick<CodexTask, "status" | "section_id">): string | null {
  if (source.kind === "status") return isTaskStatus(task.status) ? task.status : "todo"
  const id = task.section_id == null ? null : Number(task.section_id)
  if (id == null) return null
  return source.sections.some((s) => s.id === id) ? sectionColumnKey(id) : null
}

export function sectionCategoryLabel(category: SectionStatusCategory): string {
  return STATUSES.find((s) => s.value === statusForSectionCategory(category))?.label ?? category
}

// ---------------------------------------------------------------------------
// Drag rules
// ---------------------------------------------------------------------------

export type BoardState = {
  columns: Record<string, CodexTask[]>
  counts: Record<string, number>
}

export type BoardMove = {
  taskId: number
  fromKey: string
  toKey: string
  /** The status the card takes (the target column's status). */
  status: TaskStatus
  /** Project boards: the card goes right after this one (null: first). Status boards: null. */
  afterTaskId: number | null
  /** Index in the target column's loaded cards. */
  toIndex: number
}

export type DropTarget = { columnKey: string; overTaskId: number | null }

function ids(list: readonly CodexTask[] | undefined): number[] {
  return (list ?? []).map((t) => Number(t.id))
}

/**
 * What a drop does, or null when it changes nothing. Status boards: another
 * column changes status, the same column does nothing (cards are sorted by
 * the list sort). Project boards: dropping on a card places the dragged card
 * where that card is (after it when dragging down the same column, before it
 * otherwise); dropping on the column's empty space places it last.
 */
export function planBoardDrop(
  state: BoardState,
  source: BoardColumnSource,
  taskId: number,
  fromKey: string,
  target: DropTarget
): BoardMove | null {
  const columns = boardColumns(source)
  const to = columns.find((c) => c.key === target.columnKey)
  if (!to) return null
  if (source.kind === "status") {
    if (fromKey === to.key) return null
    return { taskId, fromKey, toKey: to.key, status: to.status, afterTaskId: null, toIndex: 0 }
  }
  const before = ids(state.columns[to.key])
  const rest = before.filter((id) => id !== taskId)
  let index: number
  if (target.overTaskId == null || target.overTaskId === taskId) {
    if (target.overTaskId === taskId && fromKey === to.key) return null
    index = rest.length
  } else {
    const overAt = rest.indexOf(target.overTaskId)
    if (overAt < 0) {
      index = rest.length
    } else {
      const sameColumn = fromKey === to.key
      const draggingDown = sameColumn && before.indexOf(taskId) < before.indexOf(target.overTaskId)
      index = draggingDown ? overAt + 1 : overAt
    }
  }
  if (fromKey === to.key) {
    const next = [...rest.slice(0, index), taskId, ...rest.slice(index)]
    if (next.length === before.length && next.every((id, i) => id === before[i])) return null
  }
  return {
    taskId,
    fromKey,
    toKey: to.key,
    status: to.status,
    afterTaskId: index === 0 ? null : rest[index - 1],
    toIndex: index,
  }
}

/**
 * The board after a move, before the server answers. The card takes the
 * column's status (and section). With completed hidden, a card moved into a
 * done column leaves the board.
 */
export function applyBoardMove(state: BoardState, move: BoardMove, options: { hideCompleted?: boolean } = {}): BoardState {
  const from = state.columns[move.fromKey] ?? []
  const task = from.find((t) => Number(t.id) === move.taskId)
  if (!task) return state
  const sectionId = sectionIdFromColumnKey(move.toKey)
  const moved: CodexTask = {
    ...task,
    status: move.status,
    ...(sectionId != null ? { section_id: sectionId } : {}),
  }
  const columns = { ...state.columns, [move.fromKey]: from.filter((t) => Number(t.id) !== move.taskId) }
  const counts = { ...state.counts }
  const leaves = options.hideCompleted === true && move.status === "done"
  if (!leaves) {
    const target = [...(columns[move.toKey] ?? [])].filter((t) => Number(t.id) !== move.taskId)
    target.splice(Math.min(move.toIndex, target.length), 0, moved)
    columns[move.toKey] = target
  }
  if (move.fromKey !== move.toKey || leaves) {
    counts[move.fromKey] = Math.max(0, (counts[move.fromKey] ?? 0) - 1)
    if (!leaves) counts[move.toKey] = (counts[move.toKey] ?? 0) + 1
  }
  return { columns, counts }
}

export type MoveResult = { ok: true } | { ok: false; status: number; message: string }

/**
 * Whether the board loads again after a move. A move to another column does
 * (its counts and the cards around it come from the server). A 409 does too,
 * after the rollback: the server refused because this view is stale (a card
 * moved, an anchor left the section), so the next drag needs fresh columns.
 * Other failures (network, 500) only roll back.
 */
export function reloadAfterMove(move: BoardMove, result: MoveResult): boolean {
  if (result.ok) return move.fromKey !== move.toKey
  return result.status === 409
}

/**
 * Optimistic move: show the move at once, send it, and put the board back
 * as it was when the server refuses (409 and anything else not OK).
 * `reload` says whether the caller loads the board again (reloadAfterMove).
 */
export async function commitBoardMove(
  state: BoardState,
  move: BoardMove,
  send: (move: BoardMove) => Promise<MoveResult>,
  show: (next: BoardState) => void,
  options: { hideCompleted?: boolean } = {}
): Promise<{ state: BoardState; error: string | null; reload: boolean }> {
  const optimistic = applyBoardMove(state, move, options)
  show(optimistic)
  let result: MoveResult
  try {
    result = await send(move)
  } catch {
    result = { ok: false, status: 0, message: "Could not reach the server. The card is back where it was." }
  }
  const reload = reloadAfterMove(move, result)
  if (result.ok) return { state: optimistic, error: null, reload }
  show(state)
  return { state, error: result.message, reload }
}

// ---------------------------------------------------------------------------
// Section header menu
// ---------------------------------------------------------------------------

export type SectionMenuItem =
  | { action: "rename"; label: string; disabled: boolean; reason: string | null }
  | { action: "move_left" | "move_right"; label: string; disabled: boolean; reason: string | null }
  | { action: "toggle_collapse"; label: string; disabled: boolean; reason: string | null }
  | {
      action: "set_category"
      label: string
      category: SectionStatusCategory
      current: boolean
      disabled: boolean
      reason: string | null
    }
  | { action: "delete"; label: string; disabled: boolean; reason: string | null }

/** Section ids in board order after moving one column left (-1) or right (+1); null at an edge. */
export function reorderForMove(sections: readonly CodexSection[], sectionId: number, direction: -1 | 1): number[] | null {
  const order = sortSections(sections).map((s) => s.id)
  const at = order.indexOf(sectionId)
  const to = at + direction
  if (at < 0 || to < 0 || to >= order.length) return null
  const next = [...order]
  next[at] = order[to]
  next[to] = sectionId
  return next
}

/**
 * The header menu for one section. `liveTasks` is its live task count
 * (completed included). Delete is offered only when empty and not the last
 * done section; the reason says why not.
 */
export function sectionMenuItems(
  sections: readonly CodexSection[],
  sectionId: number,
  options: { liveTasks: number; collapsed: boolean }
): SectionMenuItem[] {
  const section = sections.find((s) => s.id === sectionId)
  if (!section) return []
  const order = sortSections(sections).map((s) => s.id)
  const at = order.indexOf(sectionId)
  const del = checkDeleteSection(sections, sectionId, options.liveTasks)
  const items: SectionMenuItem[] = [
    { action: "rename", label: "Rename", disabled: false, reason: null },
    { action: "move_left", label: "Move left", disabled: at <= 0, reason: at <= 0 ? "Already the first column." : null },
    {
      action: "move_right",
      label: "Move right",
      disabled: at >= order.length - 1,
      reason: at >= order.length - 1 ? "Already the last column." : null,
    },
    { action: "toggle_collapse", label: options.collapsed ? "Expand" : "Collapse", disabled: false, reason: null },
  ]
  for (const category of SECTION_STATUS_CATEGORIES) {
    const rule = checkRecategorise(sections, sectionId, category)
    const current = section.status_category === category
    items.push({
      action: "set_category",
      label: `Status: ${sectionCategoryLabel(category)}`,
      category,
      current,
      disabled: current || !rule.ok,
      reason: rule.ok ? null : rule.message,
    })
  }
  items.push({ action: "delete", label: "Delete section", disabled: !del.ok, reason: del.ok ? null : del.message })
  return items
}

// ---------------------------------------------------------------------------
// Hide or show completed
// ---------------------------------------------------------------------------

export const COMPLETED_PARAM = "completed"

/** `?completed=hide` true, `show` false, anything else null. */
export function parseCompletedParam(value: string | null | undefined): boolean | null {
  if (value === "hide") return true
  if (value === "show") return false
  return null
}

/** A link's `?completed=` wins, then the stored setting, then hide (the table default). */
export function resolveHideCompleted(fromUrl: boolean | null, stored: boolean | null): boolean {
  if (fromUrl != null) return fromUrl
  if (stored != null) return stored
  return true
}

/** The codex_board_configs scope for a project board. */
export function projectBoardScope(projectId: number): string {
  return `project:${projectId}`
}
