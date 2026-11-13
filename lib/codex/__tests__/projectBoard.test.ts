/**
 * Codex boards (B39): column source, drag rules, optimistic moves with
 * rollback, the section header menu, hide completed, bulk paste parsing and
 * the status change rule for project tasks. Pure, no database.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  BULK_PASTE_MAX,
  orderAfterPlacement,
  parseCreateSectionTasksInput,
  parseMoveTaskInput,
  parsePastedTaskTitles,
  planStatusChangeInProject,
  type CodexSection,
} from "../projects.js"
import {
  applyBoardMove,
  boardColumns,
  columnKeyForTask,
  commitBoardMove,
  parseCompletedParam,
  planBoardDrop,
  projectBoardScope,
  reloadAfterMove,
  reorderForMove,
  resolveHideCompleted,
  sectionColumnKey,
  sectionIdFromColumnKey,
  sectionMenuItems,
  visibleBoardStatuses,
  type BoardColumnSource,
  type BoardState,
} from "../projectBoard.js"
import { TASK_TITLE_MAX, type CodexTask } from "../types.js"

const S = (id: number, name: string, sort_order: number, status_category: CodexSection["status_category"], collapsed_default = false): CodexSection => ({
  id,
  project_id: 5,
  name,
  sort_order,
  collapsed_default,
  status_category,
})

// Board order: Inbound (todo), This week (in_progress), Awaiting (waiting), Done (done). Ids are not in order.
const SECTIONS = [S(30, "Done", 3, "done"), S(10, "Inbound", 0, "todo"), S(20, "This week", 1, "in_progress"), S(25, "Awaiting", 2, "waiting")]
const SOURCE: BoardColumnSource = { kind: "sections", sections: SECTIONS }

const T = (id: number, section_id: number, status = "todo"): CodexTask => ({ id, title: `t${id}`, client_id: 0, status, section_id, project_id: 5 })

function board(): BoardState {
  return {
    columns: {
      "section:10": [T(1, 10), T(2, 10), T(3, 10)],
      "section:20": [T(4, 20, "in_progress")],
      "section:25": [],
      "section:30": [],
    },
    counts: { "section:10": 3, "section:20": 1, "section:25": 0, "section:30": 0 },
  }
}

describe("column source", () => {
  it("a status board has the five statuses, or the filtered ones in board order", () => {
    assert.deepEqual(boardColumns({ kind: "status" }).map((c) => c.key), ["backlog", "todo", "in_progress", "waiting", "done"])
    assert.deepEqual(boardColumns({ kind: "status", statusFilter: ["done", "todo", "nope"] }).map((c) => c.key), ["todo", "done"])
    assert.deepEqual(visibleBoardStatuses([]), ["backlog", "todo", "in_progress", "waiting", "done"])
  })

  it("a project board has its sections in sort_order, each with its category's status", () => {
    const cols = boardColumns(SOURCE)
    assert.deepEqual(cols.map((c) => c.label), ["Inbound", "This week", "Awaiting", "Done"])
    assert.deepEqual(cols.map((c) => c.status), ["todo", "in_progress", "waiting", "done"])
    assert.deepEqual(cols.map((c) => c.sectionId), [10, 20, 25, 30])
    assert.equal(cols[0].key, "section:10")
  })

  it("a task sits in its status column, or its section column (null when the section is not on the board)", () => {
    assert.equal(columnKeyForTask({ kind: "status" }, { status: "waiting" }), "waiting")
    assert.equal(columnKeyForTask({ kind: "status" }, { status: "weird" }), "todo")
    assert.equal(columnKeyForTask(SOURCE, { status: "todo", section_id: 25 }), "section:25")
    assert.equal(columnKeyForTask(SOURCE, { status: "todo", section_id: 99 }), null)
    assert.equal(columnKeyForTask(SOURCE, { status: "todo", section_id: null }), null)
  })

  it("section column keys round-trip", () => {
    assert.equal(sectionIdFromColumnKey(sectionColumnKey(42)), 42)
    assert.equal(sectionIdFromColumnKey("todo"), null)
    assert.equal(sectionIdFromColumnKey("section:0"), null)
  })
})

describe("drag rules (plan 5.4)", () => {
  it("status board: another column changes status, the same column does nothing", () => {
    const state: BoardState = { columns: { todo: [T(1, 0)], done: [] }, counts: { todo: 1, done: 0 } }
    const move = planBoardDrop(state, { kind: "status" }, 1, "todo", { columnKey: "done", overTaskId: null })
    assert.deepEqual(move, { taskId: 1, fromKey: "todo", toKey: "done", status: "done", afterTaskId: null, toIndex: 0 })
    assert.equal(planBoardDrop(state, { kind: "status" }, 1, "todo", { columnKey: "todo", overTaskId: null }), null)
  })

  it("between sections: the card takes the section's status; on empty space it goes last", () => {
    const move = planBoardDrop(board(), SOURCE, 2, "section:10", { columnKey: "section:20", overTaskId: null })
    assert.deepEqual(move, { taskId: 2, fromKey: "section:10", toKey: "section:20", status: "in_progress", afterTaskId: 4, toIndex: 1 })
    const intoDone = planBoardDrop(board(), SOURCE, 2, "section:10", { columnKey: "section:30", overTaskId: null })
    assert.equal(intoDone?.status, "done")
    assert.equal(intoDone?.afterTaskId, null)
  })

  it("between sections onto a card: placed before that card", () => {
    const move = planBoardDrop(board(), SOURCE, 2, "section:10", { columnKey: "section:20", overTaskId: 4 })
    assert.equal(move?.afterTaskId, null)
    assert.equal(move?.toIndex, 0)
  })

  it("within a section: down places after the card, up before it; no change is no move", () => {
    const down = planBoardDrop(board(), SOURCE, 1, "section:10", { columnKey: "section:10", overTaskId: 2 })
    assert.equal(down?.afterTaskId, 2)
    assert.equal(down?.status, "todo")
    const up = planBoardDrop(board(), SOURCE, 3, "section:10", { columnKey: "section:10", overTaskId: 1 })
    assert.equal(up?.afterTaskId, null)
    assert.equal(up?.toIndex, 0)
    assert.equal(planBoardDrop(board(), SOURCE, 2, "section:10", { columnKey: "section:10", overTaskId: 2 }), null)
    assert.equal(planBoardDrop(board(), SOURCE, 3, "section:10", { columnKey: "section:10", overTaskId: null }), null)
  })

  it("an unknown column is no move", () => {
    assert.equal(planBoardDrop(board(), SOURCE, 1, "section:10", { columnKey: "section:99", overTaskId: null }), null)
  })

  it("applyBoardMove moves the card, sets its status and section, and adjusts counts", () => {
    const move = planBoardDrop(board(), SOURCE, 2, "section:10", { columnKey: "section:20", overTaskId: 4 })!
    const next = applyBoardMove(board(), move)
    assert.deepEqual(next.columns["section:10"].map((t) => t.id), [1, 3])
    assert.deepEqual(next.columns["section:20"].map((t) => t.id), [2, 4])
    assert.equal(next.columns["section:20"][0].status, "in_progress")
    assert.equal(next.columns["section:20"][0].section_id, 20)
    assert.equal(next.counts["section:10"], 2)
    assert.equal(next.counts["section:20"], 2)
  })

  it("a reorder keeps counts; with completed hidden a card dropped in Done leaves the board", () => {
    const reorder = applyBoardMove(board(), planBoardDrop(board(), SOURCE, 1, "section:10", { columnKey: "section:10", overTaskId: 3 })!)
    assert.deepEqual(reorder.columns["section:10"].map((t) => t.id), [2, 3, 1])
    assert.equal(reorder.counts["section:10"], 3)
    const done = planBoardDrop(board(), SOURCE, 1, "section:10", { columnKey: "section:30", overTaskId: null })!
    const hidden = applyBoardMove(board(), done, { hideCompleted: true })
    assert.deepEqual(hidden.columns["section:30"], [])
    assert.equal(hidden.counts["section:30"], 0)
    assert.equal(hidden.counts["section:10"], 2)
    const shown = applyBoardMove(board(), done, { hideCompleted: false })
    assert.deepEqual(shown.columns["section:30"].map((t) => t.id), [1])
  })

  it("commitBoardMove shows the move, keeps it when the server agrees, and rolls back on 409", async () => {
    const start = board()
    const move = planBoardDrop(start, SOURCE, 2, "section:10", { columnKey: "section:30", overTaskId: null })!
    const shown: BoardState[] = []
    const ok = await commitBoardMove(start, move, async () => ({ ok: true }), (s) => shown.push(s))
    assert.equal(ok.error, null)
    assert.deepEqual(ok.state.columns["section:30"].map((t) => t.id), [2])
    assert.equal(shown.length, 1)

    shown.length = 0
    const refused = await commitBoardMove(
      start,
      move,
      async () => ({ ok: false, status: 409, message: "This task belongs to another project." }),
      (s) => shown.push(s)
    )
    assert.equal(refused.error, "This task belongs to another project.")
    assert.equal(refused.state, start)
    assert.equal(shown.length, 2)
    assert.deepEqual(shown[0].columns["section:30"].map((t) => t.id), [2])
    assert.equal(shown[1], start)

    const thrown = await commitBoardMove(start, move, async () => { throw new Error("offline") }, () => {})
    assert.equal(thrown.state, start)
    assert.match(thrown.error ?? "", /back where it was/)
  })

  it("B39fix: a 500 rolls back too; only a 409 (stale view) and a move to another column reload the board", async () => {
    const start = board()
    const across = planBoardDrop(start, SOURCE, 2, "section:10", { columnKey: "section:30", overTaskId: null })!
    const within = planBoardDrop(start, SOURCE, 1, "section:10", { columnKey: "section:10", overTaskId: 3 })!
    assert.ok(across && within)

    const shown: BoardState[] = []
    const failed = await commitBoardMove(start, across, async () => ({ ok: false, status: 500, message: "Server error." }), (s) => shown.push(s))
    assert.equal(failed.state, start, "a 500 does not keep the optimistic card")
    assert.equal(failed.error, "Server error.")
    assert.equal(shown[shown.length - 1], start)
    assert.equal(failed.reload, false)

    const stale = await commitBoardMove(start, within, async () => ({ ok: false, status: 409, message: "Reload the board." }), () => {})
    assert.equal(stale.state, start)
    assert.equal(stale.reload, true, "a 409 reloads after the rollback")

    assert.equal((await commitBoardMove(start, within, async () => ({ ok: true }), () => {})).reload, false, "a reorder keeps the loaded cards")
    assert.equal((await commitBoardMove(start, across, async () => ({ ok: true }), () => {})).reload, true)
    assert.equal((await commitBoardMove(start, across, async () => { throw new Error("offline") }, () => {})).reload, false)

    assert.equal(reloadAfterMove(within, { ok: false, status: 400, message: "x" }), false)
    assert.equal(reloadAfterMove(within, { ok: false, status: 404, message: "x" }), false)
  })
})

describe("section header menu", () => {
  const find = (items: ReturnType<typeof sectionMenuItems>, action: string, category?: string) =>
    items.find((i) => i.action === action && (category == null || ("category" in i && i.category === category)))!

  it("move left and right swap with the neighbour; edges are disabled", () => {
    assert.deepEqual(reorderForMove(SECTIONS, 20, -1), [20, 10, 25, 30])
    assert.deepEqual(reorderForMove(SECTIONS, 20, 1), [10, 25, 20, 30])
    assert.equal(reorderForMove(SECTIONS, 10, -1), null)
    assert.equal(reorderForMove(SECTIONS, 30, 1), null)
    const first = sectionMenuItems(SECTIONS, 10, { liveTasks: 0, collapsed: false })
    assert.equal(find(first, "move_left").disabled, true)
    assert.equal(find(first, "move_right").disabled, false)
    assert.equal(find(sectionMenuItems(SECTIONS, 30, { liveTasks: 0, collapsed: false }), "move_right").disabled, true)
  })

  it("delete only when empty, with the 409 message otherwise; never the last done section", () => {
    assert.equal(find(sectionMenuItems(SECTIONS, 25, { liveTasks: 0, collapsed: false }), "delete").disabled, false)
    const full = find(sectionMenuItems(SECTIONS, 25, { liveTasks: 2, collapsed: false }), "delete")
    assert.equal(full.disabled, true)
    assert.equal(full.reason, "Move the 2 tasks out of this section first.")
    const lastDone = find(sectionMenuItems(SECTIONS, 30, { liveTasks: 0, collapsed: false }), "delete")
    assert.equal(lastDone.disabled, true)
    assert.match(lastDone.reason ?? "", /at least one done section/)
  })

  it("status category: the current one and anything that would drop the last done section are disabled", () => {
    const done = sectionMenuItems(SECTIONS, 30, { liveTasks: 0, collapsed: false })
    assert.equal(find(done, "set_category", "done").disabled, true)
    assert.equal(find(done, "set_category", "todo").disabled, true)
    const inbound = sectionMenuItems(SECTIONS, 10, { liveTasks: 0, collapsed: false })
    assert.equal(find(inbound, "set_category", "todo").disabled, true)
    assert.equal(find(inbound, "set_category", "done").disabled, false)
    assert.equal(find(inbound, "set_category", "waiting").label, "Status: Waiting")
  })

  it("collapse toggles its label; rename is always there; unknown section has no menu", () => {
    assert.equal(find(sectionMenuItems(SECTIONS, 10, { liveTasks: 0, collapsed: true }), "toggle_collapse").label, "Expand")
    assert.equal(find(sectionMenuItems(SECTIONS, 10, { liveTasks: 0, collapsed: false }), "toggle_collapse").label, "Collapse")
    assert.equal(find(sectionMenuItems(SECTIONS, 10, { liveTasks: 0, collapsed: false }), "rename").disabled, false)
    assert.deepEqual(sectionMenuItems(SECTIONS, 99, { liveTasks: 0, collapsed: false }), [])
  })
})

describe("hide or show completed", () => {
  it("the link wins, then the stored setting, then hide", () => {
    assert.equal(parseCompletedParam("hide"), true)
    assert.equal(parseCompletedParam("show"), false)
    assert.equal(parseCompletedParam("yes"), null)
    assert.equal(parseCompletedParam(null), null)
    assert.equal(resolveHideCompleted(false, true), false)
    assert.equal(resolveHideCompleted(null, false), false)
    assert.equal(resolveHideCompleted(null, null), true)
    assert.equal(projectBoardScope(12), "project:12")
  })
})

describe("bulk paste", () => {
  it("one line per task, trimmed, blanks ignored, inner spaces collapsed", () => {
    const r = parsePastedTaskTitles("  Book OOH \n\n\tConfirm   radio spots\r\n   \nUpload final 15s\n")
    assert.deepEqual(r.titles, ["Book OOH", "Confirm radio spots", "Upload final 15s"])
    assert.equal(r.blank, 2)
    assert.equal(r.overCap, false)
    assert.deepEqual(r.tooLong, [])
    assert.deepEqual(parsePastedTaskTitles("").titles, [])
    assert.equal(parsePastedTaskTitles("").blank, 0)
  })

  it("over the cap is refused whole; long lines are reported by line number", () => {
    const many = Array.from({ length: BULK_PASTE_MAX + 1 }, (_, i) => `task ${i}`).join("\n")
    assert.equal(parsePastedTaskTitles(many).overCap, true)
    const atCap = Array.from({ length: BULK_PASTE_MAX }, (_, i) => `task ${i}`).join("\n")
    assert.equal(parsePastedTaskTitles(atCap).overCap, false)
    const long = parsePastedTaskTitles(`ok\n${"x".repeat(TASK_TITLE_MAX + 1)}`)
    assert.deepEqual(long.tooLong, [2])
  })

  it("the create body: 1 to the cap, text only, each title within the limit", () => {
    assert.deepEqual(parseCreateSectionTasksInput({ titles: [" A ", "", "B"] }), { ok: true, value: { titles: ["A", "B"] } })
    assert.equal(parseCreateSectionTasksInput({ titles: [] }).ok, false)
    assert.equal(parseCreateSectionTasksInput({ titles: ["  "] }).ok, false)
    assert.equal(parseCreateSectionTasksInput({ titles: [3] }).ok, false)
    assert.equal(parseCreateSectionTasksInput({ titles: "A" }).ok, false)
    assert.equal(parseCreateSectionTasksInput(null).ok, false)
    const over = parseCreateSectionTasksInput({ titles: Array.from({ length: BULK_PASTE_MAX + 1 }, () => "x") })
    assert.equal(over.ok, false)
    assert.equal(!over.ok && over.error, "too_many_titles")
    assert.equal(parseCreateSectionTasksInput({ titles: ["x".repeat(TASK_TITLE_MAX + 1)] }).ok, false)
    // A title with a line break is one title, not two.
    assert.deepEqual(parseCreateSectionTasksInput({ titles: ["a\nb"] }), { ok: true, value: { titles: ["a b"] } })
  })
})

describe("move placement", () => {
  it("after_task_id: null is first, an id is right after it; not with sort_order; not itself", () => {
    assert.deepEqual(parseMoveTaskInput({ task_id: 7, after_task_id: null }), { ok: true, value: { task_id: 7, sort_order: null, after_task_id: null } })
    assert.deepEqual(parseMoveTaskInput({ task_id: 7, after_task_id: 3 }), { ok: true, value: { task_id: 7, sort_order: null, after_task_id: 3 } })
    assert.equal(parseMoveTaskInput({ task_id: 7, after_task_id: 7 }).ok, false)
    assert.equal(parseMoveTaskInput({ task_id: 7, after_task_id: "x" }).ok, false)
    assert.equal(parseMoveTaskInput({ task_id: 7, after_task_id: 3, sort_order: 2 }).ok, false)
    assert.deepEqual(parseMoveTaskInput({ task_id: 7 }), { ok: true, value: { task_id: 7, sort_order: null } })
  })

  it("orderAfterPlacement puts the task after the anchor, first for null, null when the anchor is not there", () => {
    assert.deepEqual(orderAfterPlacement([1, 2, 3], 9, 2), [1, 2, 9, 3])
    assert.deepEqual(orderAfterPlacement([1, 2, 3], 3, null), [3, 1, 2])
    assert.deepEqual(orderAfterPlacement([1, 2, 3], 1, 3), [2, 3, 1])
    assert.equal(orderAfterPlacement([1, 2, 3], 9, 8), null)
    assert.equal(orderAfterPlacement([1, 2, 3], 2, 2), null)
  })
})

describe("status change on a project task (PATCH, bulk, Tasks board)", () => {
  const task = (section_id: number | null, status = "todo", project_id: number | null = 5) => ({ project_id, section_id, status })

  it("a task in no project changes as before", () => {
    assert.deepEqual(planStatusChangeInProject(task(null, "todo", null), SECTIONS, "done"), { ok: true, inProject: false })
  })

  it("stays when its section already has that status", () => {
    const sections = [...SECTIONS, S(40, "Today", 4, "in_progress")]
    const r = planStatusChangeInProject(task(40, "todo"), sections, "in_progress")
    assert.equal(r.ok && r.inProject && r.section_id, 40)
  })

  it("done goes to the first done section; others to the first section with that category", () => {
    const sections = [...SECTIONS, S(41, "Finished", 1, "done")]
    const done = planStatusChangeInProject(task(10), sections, "done")
    assert.equal(done.ok && done.inProject && done.section_id, 41)
    const waiting = planStatusChangeInProject(task(10), SECTIONS, "waiting")
    assert.ok(waiting.ok && waiting.inProject)
    assert.equal(waiting.ok && waiting.inProject && waiting.section_id, 25)
    assert.equal(waiting.ok && waiting.inProject && waiting.status, "waiting")
    assert.equal(waiting.ok && waiting.inProject && waiting.statusChanges, true)
  })

  it("two sections with the status: the first in board order wins, not the last (B39fix R03)", () => {
    // "Later" is first in the array and last on the board: only board order picks "This week".
    const sections = [S(60, "Later", 5, "in_progress"), ...SECTIONS]
    const r = planStatusChangeInProject(task(10), sections, "in_progress")
    assert.equal(r.ok && r.inProject && r.section_id, 20)
    const w = planStatusChangeInProject(task(10), [...SECTIONS, S(26, "Parked", 9, "waiting")], "waiting")
    assert.equal(w.ok && w.inProject && w.section_id, 25)
  })

  it("no section for the status (backlog, or no waiting section) is refused", () => {
    const backlog = planStatusChangeInProject(task(10), SECTIONS, "backlog")
    assert.equal(backlog.ok, false)
    assert.equal(!backlog.ok && backlog.reason, "no_section_for_status")
    assert.match(!backlog.ok ? backlog.message : "", /Backlog/)
    const noWaiting = SECTIONS.filter((s) => s.status_category !== "waiting")
    assert.equal(planStatusChangeInProject(task(10), noWaiting, "waiting").ok, false)
  })

  it("a task in a project with no section yet still lands in a matching section", () => {
    const r = planStatusChangeInProject(task(null), SECTIONS, "todo")
    assert.equal(r.ok && r.inProject && r.section_id, 10)
  })
})
