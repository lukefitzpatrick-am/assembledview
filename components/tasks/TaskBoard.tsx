"use client"

import { rosterDisplayName } from "@/lib/codex/rosterResolve"
import { useMemo, useState, type ReactNode } from "react"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { CheckSquare, ListTree, MessageSquare, Paperclip } from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { TASK_PRIORITY, TONE_TEXT, type Tone } from "@/lib/design/status"
import { Button } from "@/components/ui/button"
import { formatDueYmd, isOverdueYmd } from "@/lib/codex/dueDate"
import { compareTasksForSort, type TaskSortKey } from "@/lib/codex/queryHelpers"
import {
  boardColumns as columnsForSource,
  columnKeyForTask,
  planBoardDrop,
  visibleBoardStatuses,
  type BoardColumnDef,
  type BoardColumnSource,
  type BoardMove,
} from "@/lib/codex/projectBoard"
import { TaskAskHelpButton } from "@/components/tasks/TaskAskHelpDialog"
import { TaskEstimateChip } from "@/components/tasks/TaskEstimateChip"
import { parentLinkLabel } from "@/lib/codex/taskDetail"
import {
  isTaskStatus,
  taskPriorityLabel,
  statusMeta,
  type CodexTask,
  type TaskStatus,
  type TeamMember,
} from "@/lib/codex/types"
import { cn } from "@/lib/utils"

export { visibleBoardStatuses }

function priorityTone(value: string): Tone {
  if (value === "high" || value === "normal" || value === "low") {
    return TASK_PRIORITY[value].tone
  }
  if (value === "asap") return "critical"
  return "neutral"
}

function priorityLabel(value: string | null | undefined): string {
  return taskPriorityLabel(value)
}

function columnDropId(key: string): string {
  return `col:${key}`
}

function cardDropId(taskId: string): string {
  return `card:${taskId}`
}

export type BoardStatusCounts = Record<TaskStatus, number>

type CardSharedProps = {
  clientName: string | null
  onOpen: (task: CodexTask) => void
  /** Undefined hides Ask for help on the cards. */
  teamMembers?: TeamMember[]
  meEmail: string | null
  onHelpAsked?: () => void
}

function TaskBoardCardFace({
  task,
  clientName,
  overdue,
  teamMembers,
  meEmail,
  onHelpAsked,
  chips,
}: {
  task: CodexTask
  clientName: string | null
  overdue: boolean
  teamMembers?: TeamMember[]
  meEmail?: string | null
  onHelpAsked?: () => void
  /** Project boards (B40): the card's custom field chips. */
  chips?: readonly string[]
}) {
  const done = task.checklist_done ?? 0
  const total = task.checklist_total ?? 0
  const subtasks = task.subtask_count ?? 0
  const comments = task.comment_count ?? 0
  const attachments = task.attachment_count ?? 0
  const priority = String(task.priority ?? "normal")

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground">
          {task.title}
        </p>
        <Badge variant={priorityTone(priority)} size="sm">
          {priorityLabel(priority)}
        </Badge>
      </div>
      {clientName != null ? (
        <p className="mt-1 truncate text-xs text-muted-foreground">{clientName}</p>
      ) : null}
      {task.parent_task_id != null && task.parent_title ? (
        <Link
          href={`/tasks/${task.parent_task_id}`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="mt-1 inline-flex max-w-full items-center rounded-pill border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <span className="truncate">
            {parentLinkLabel(task.task_type)} {task.parent_title}
          </span>
        </Link>
      ) : null}
      {task.task_type === "milestone" || (chips && chips.length > 0) ? (
        <div className="mt-1.5 flex flex-wrap gap-1" data-testid="card-chips">
          {task.task_type === "milestone" ? (
            <Badge variant="info" size="sm">
              Milestone
            </Badge>
          ) : null}
          {(chips ?? []).map((chip) => (
            <span
              key={chip}
              className="inline-flex max-w-full items-center rounded-pill border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              <span className="truncate">{chip}</span>
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1">
          <span className="truncate">
            {task.assignee_name || task.assignee_email
              ? rosterDisplayName({ name: task.assignee_name, email: task.assignee_email })
              : "Unassigned"}
          </span>
          {teamMembers && meEmail !== undefined ? (
            <TaskAskHelpButton
              task={task}
              members={teamMembers}
              meEmail={meEmail}
              onAsked={onHelpAsked}
            />
          ) : null}
        </span>
        <span className={cn("num", overdue && `font-semibold ${TONE_TEXT.critical}`)}>
          {overdue ? `Overdue · ${formatDueYmd(task.due_date ?? null)}` : formatDueYmd(task.due_date ?? null)}
        </span>
        {total > 0 ? (
          <span className="inline-flex items-center gap-1 num">
            <CheckSquare className="h-3 w-3" aria-hidden />
            {done}/{total}
          </span>
        ) : null}
        {subtasks > 0 ? (
          <span className="inline-flex items-center gap-1 num" title={`${subtasks} subtask${subtasks === 1 ? "" : "s"}`}>
            <ListTree className="h-3 w-3" aria-hidden />
            {subtasks}
          </span>
        ) : null}
        {comments > 0 ? (
          <span className="inline-flex items-center gap-1 num" title={`${comments} comment${comments === 1 ? "" : "s"}`}>
            <MessageSquare className="h-3 w-3" aria-hidden />
            {comments}
          </span>
        ) : null}
        {attachments > 0 ? (
          <span className="inline-flex items-center gap-1 num" title={`${attachments} attachment${attachments === 1 ? "" : "s"}`}>
            <Paperclip className="h-3 w-3" aria-hidden />
            {attachments}
          </span>
        ) : null}
        {task.estimated_minutes != null && task.estimated_minutes > 0 ? (
          <TaskEstimateChip minutes={task.estimated_minutes} />
        ) : null}
      </div>
    </>
  )
}

function TaskBoardCard({
  task,
  columnKey,
  droppable,
  clientName,
  onOpen,
  teamMembers,
  meEmail,
  onHelpAsked,
  chips,
}: CardSharedProps & { task: CodexTask; columnKey: string; droppable: boolean; chips?: readonly string[] }) {
  const overdue = isOverdueYmd(task.due_date ?? null, task.status)
  const id = String(task.id)
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id,
    data: { type: "card" as const, task, columnKey },
  })
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: cardDropId(id),
    data: { type: "card" as const, columnKey, taskId: Number(task.id) },
    disabled: !droppable,
  })

  return (
    <div
      ref={(node) => {
        setDragRef(node)
        setDropRef(node)
      }}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onOpen(task)
        }
      }}
      className={cn(
        "interactive w-full cursor-pointer rounded-card border border-border bg-card p-3 text-left shadow-e1",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        overdue && "border-l-[3px] border-l-status-critical-fg",
        isDragging && "opacity-40",
        droppable && isOver && !isDragging && "ring-2 ring-ring"
      )}
      aria-label={`${task.title}${overdue ? ", overdue" : ""}`}
    >
      <TaskBoardCardFace
        task={task}
        clientName={clientName}
        overdue={overdue}
        teamMembers={teamMembers}
        meEmail={meEmail}
        onHelpAsked={onHelpAsked}
        chips={chips}
      />
    </div>
  )
}

type ColumnRenderers = {
  /** Project boards (B40): custom field chips for a card (labels, already filtered by the project's settings). */
  cardChips?: (task: CodexTask) => readonly string[]
  /** Extra header content (the project board's section menu). */
  renderColumnMenu?: (column: BoardColumnDef) => ReactNode
  /** Below the cards (the project board's inline add and paste). */
  renderColumnFooter?: (column: BoardColumnDef) => ReactNode
}

function BoardColumn({
  column,
  showCategory,
  collapsed,
  tasks,
  count,
  loadingMore,
  onLoadMore,
  clientNameFor,
  cardsDroppable,
  onOpen,
  teamMembers,
  meEmail,
  onHelpAsked,
  renderColumnMenu,
  renderColumnFooter,
  cardChips,
}: ColumnRenderers & {
  column: BoardColumnDef
  showCategory: boolean
  collapsed: boolean
  tasks: CodexTask[]
  count: number
  loadingMore: boolean
  onLoadMore: (key: string) => void
  clientNameFor: (task: CodexTask) => string | null
  cardsDroppable: boolean
  onOpen: (task: CodexTask) => void
  teamMembers?: TeamMember[]
  meEmail: string | null
  onHelpAsked?: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnDropId(column.key),
    data: { type: "column" as const, columnKey: column.key, status: column.status },
  })
  const meta = statusMeta(column.status)
  const remaining = Math.max(0, count - tasks.length)

  if (collapsed) {
    return (
      <div
        ref={setNodeRef}
        data-column={column.key}
        data-collapsed="true"
        className={cn(
          "flex min-h-[12rem] w-12 shrink-0 flex-col items-center gap-2 rounded-card border border-border bg-surface-panel/60 py-2",
          isOver && "ring-2 ring-ring"
        )}
      >
        {renderColumnMenu ? renderColumnMenu(column) : null}
        <span className="num text-xs text-muted-foreground">{count}</span>
        <span className="text-xs font-medium text-muted-foreground [writing-mode:vertical-rl]">{column.label}</span>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      data-column={column.key}
      className={cn(
        "flex min-h-[12rem] min-w-[16.5rem] flex-1 flex-col rounded-card border border-border bg-surface-panel/60",
        isOver && "ring-2 ring-ring"
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <span className="inline-flex min-w-0 items-center gap-2">
          {showCategory ? (
            <>
              <span className="truncate text-sm font-semibold text-foreground">{column.label}</span>
              <Badge variant={meta.badgeVariant} size="sm">
                {meta.label}
              </Badge>
            </>
          ) : (
            <Badge variant={meta.badgeVariant} size="sm">
              {column.label}
            </Badge>
          )}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="num text-xs text-muted-foreground">{count}</span>
          {renderColumnMenu ? renderColumnMenu(column) : null}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2">
        {tasks.map((task) => (
          <TaskBoardCard
            key={String(task.id)}
            task={task}
            columnKey={column.key}
            droppable={cardsDroppable}
            clientName={clientNameFor(task)}
            onOpen={onOpen}
            teamMembers={teamMembers}
            meEmail={meEmail}
            onHelpAsked={onHelpAsked}
            chips={cardChips?.(task)}
          />
        ))}
        {tasks.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">Drop here</p>
        ) : null}
      </div>
      {remaining > 0 ? (
        <div className="border-t border-border/60 p-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            disabled={loadingMore}
            onClick={() => onLoadMore(column.key)}
          >
            {`Load more (${remaining} left)`}
          </Button>
        </div>
      ) : null}
      {renderColumnFooter ? <div className="border-t border-border/60 p-2">{renderColumnFooter(column)}</div> : null}
    </div>
  )
}

export type GenericTaskBoardProps = ColumnRenderers & {
  /** Statuses (Tasks board) or a project's sections (project board). */
  source: BoardColumnSource
  /** Cards per column key. Status boards sort by `sort`; section boards keep the given order. */
  columns: Record<string, CodexTask[]>
  counts: Record<string, number>
  onLoadMore: (key: string) => void
  loadingMoreKey?: string | null
  sort?: TaskSortKey
  /** Null hides the client line (a project's cards share its client). */
  clientNameFor: (task: CodexTask) => string | null
  onOpenTask: (task: CodexTask) => void
  /** A drop that changes something (planBoardDrop). */
  onMove: (task: CodexTask, move: BoardMove) => void | Promise<void>
  collapsedKeys?: ReadonlySet<string>
  /** Undefined hides Ask for help on the cards. */
  teamMembers?: TeamMember[]
  meEmail: string | null
  onHelpAsked?: () => void
  ariaLabel?: string
}

/** The one board: columns from a status or sections source (plan 5.1), drag rules from planBoardDrop. */
export function GenericTaskBoard({
  source,
  columns,
  counts,
  onLoadMore,
  loadingMoreKey = null,
  sort = "due_asc",
  clientNameFor,
  onOpenTask,
  onMove,
  collapsedKeys,
  teamMembers,
  meEmail,
  onHelpAsked,
  renderColumnMenu,
  renderColumnFooter,
  cardChips,
  ariaLabel = "Task board",
}: GenericTaskBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const defs = useMemo(() => columnsForSource(source), [source])
  const sections = source.kind === "sections"

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  )

  const byKey = useMemo(() => {
    const map: Record<string, CodexTask[]> = {}
    for (const def of defs) map[def.key] = []
    if (sections) {
      // Section boards keep the server's card order (sort_order).
      for (const def of defs) map[def.key] = [...(columns[def.key] ?? [])]
      return map
    }
    // Status boards: each card goes in its own status column (unknown statuses with To do), sorted.
    for (const list of Object.values(columns)) {
      for (const task of list ?? []) {
        const key = columnKeyForTask(source, task)
        if (key != null && map[key]) map[key].push(task)
      }
    }
    for (const list of Object.values(map)) list.sort((a, b) => compareTasksForSort(a, b, sort))
    return map
  }, [columns, defs, sections, sort, source])

  const activeTask = useMemo(() => {
    if (!activeId) return null
    for (const def of defs) {
      const found = byKey[def.key]?.find((task) => String(task.id) === activeId)
      if (found) return found
    }
    return null
  }, [activeId, byKey, defs])

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over) return
    const data = (active.data.current ?? {}) as { task?: CodexTask; columnKey?: unknown }
    const task = data.task ?? activeTask
    if (!task) return
    const fromKey = typeof data.columnKey === "string" ? data.columnKey : null
    if (!fromKey) return
    const overData = (over.data.current ?? {}) as { columnKey?: unknown; taskId?: unknown; type?: unknown }
    const toKey = typeof overData.columnKey === "string" ? overData.columnKey : null
    if (!toKey) return
    const overTaskId = overData.type === "card" && typeof overData.taskId === "number" ? overData.taskId : null
    const move = planBoardDrop({ columns: byKey, counts }, source, Number(task.id), fromKey, {
      columnKey: toKey,
      overTaskId,
    })
    if (move) void onMove(task, move)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex w-full min-w-0 gap-3 overflow-x-auto pb-2" role="region" aria-label={ariaLabel}>
        {defs.map((def) => (
          <BoardColumn
            key={def.key}
            column={def}
            showCategory={sections}
            collapsed={collapsedKeys?.has(def.key) ?? false}
            tasks={byKey[def.key] ?? []}
            count={counts[def.key] ?? 0}
            loadingMore={loadingMoreKey === def.key}
            onLoadMore={onLoadMore}
            clientNameFor={clientNameFor}
            cardsDroppable={sections}
            onOpen={onOpenTask}
            teamMembers={teamMembers}
            meEmail={meEmail}
            onHelpAsked={onHelpAsked}
            renderColumnMenu={renderColumnMenu}
            renderColumnFooter={renderColumnFooter}
            cardChips={cardChips}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div
            className={cn(
              "w-[15.5rem] rounded-card border border-border bg-card p-3 shadow-e2",
              isOverdueYmd(activeTask.due_date ?? null, activeTask.status) &&
                "border-l-[3px] border-l-status-critical-fg"
            )}
          >
            <TaskBoardCardFace
              task={activeTask}
              clientName={clientNameFor(activeTask)}
              overdue={isOverdueYmd(activeTask.due_date ?? null, activeTask.status)}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

type Props = {
  columns: Record<TaskStatus, CodexTask[]>
  counts: BoardStatusCounts
  statusFilter?: readonly string[] | null
  onLoadMore: (status: TaskStatus) => void
  loadingMoreStatus?: TaskStatus | null
  sort?: TaskSortKey
  clientNameById: Map<number, string>
  onOpenTask: (task: CodexTask) => void
  onStatusChange: (task: CodexTask, nextStatus: TaskStatus) => void | Promise<void>
  teamMembers: TeamMember[]
  meEmail: string | null
  onHelpAsked?: () => void
}

/** The Tasks board: the generic board with status columns (unchanged behaviour). */
export function TaskBoard({
  columns,
  counts,
  statusFilter,
  onLoadMore,
  loadingMoreStatus = null,
  sort = "due_asc",
  clientNameById,
  onOpenTask,
  onStatusChange,
  teamMembers,
  meEmail,
  onHelpAsked,
}: Props) {
  const source = useMemo<BoardColumnSource>(() => ({ kind: "status", statusFilter }), [statusFilter])
  return (
    <GenericTaskBoard
      source={source}
      columns={columns}
      counts={counts}
      onLoadMore={(key) => {
        if (isTaskStatus(key)) onLoadMore(key)
      }}
      loadingMoreKey={loadingMoreStatus}
      sort={sort}
      clientNameFor={(task) => clientNameById.get(Number(task.client_id)) ?? String(task.client_id || "—")}
      onOpenTask={onOpenTask}
      onMove={(task, move) => onStatusChange(task, move.status)}
      teamMembers={teamMembers}
      meEmail={meEmail}
      onHelpAsked={onHelpAsked}
    />
  )
}
