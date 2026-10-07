"use client"

import { useMemo, useState } from "react"
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
import { CheckSquare } from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { TASK_PRIORITY, TONE_TEXT, type Tone } from "@/lib/design/status"
import { Button } from "@/components/ui/button"
import { formatDueYmd, isOverdueYmd } from "@/lib/codex/dueDate"
import { compareTasksForSort, type TaskSortKey } from "@/lib/codex/queryHelpers"
import { TaskAskHelpButton } from "@/components/tasks/TaskAskHelpDialog"
import { TaskEstimateChip } from "@/components/tasks/TaskEstimateChip"
import {
  STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  isTaskStatus,
  statusMeta,
  type CodexTask,
  type TaskStatus,
  type TeamMember,
} from "@/lib/codex/types"
import { cn } from "@/lib/utils"

function priorityTone(value: string): Tone {
  if (value === "high" || value === "normal" || value === "low") {
    return TASK_PRIORITY[value].tone
  }
  return "neutral"
}

function priorityLabel(value: string | null | undefined): string {
  const found = TASK_PRIORITIES.find((p) => p.value === value)
  return found?.label ?? (value ? String(value) : "Normal")
}

function columnDropId(status: TaskStatus): string {
  return `col:${status}`
}

function parseColumnId(id: string | number): TaskStatus | null {
  const raw = String(id)
  if (raw.startsWith("col:")) {
    const status = raw.slice(4)
    return isTaskStatus(status) ? status : null
  }
  return null
}

/** Empty or missing filter shows every column. A set filter shows those columns, in board order. */
export function visibleBoardStatuses(
  statusFilter: readonly string[] | null | undefined
): TaskStatus[] {
  if (statusFilter == null || statusFilter.length === 0) {
    return [...TASK_STATUSES]
  }
  const selected = new Set(statusFilter.filter(isTaskStatus))
  return TASK_STATUSES.filter((status) => selected.has(status))
}

export type BoardStatusCounts = Record<TaskStatus, number>

type BoardCardProps = {
  task: CodexTask
  columnStatus: TaskStatus
  clientName: string
  onOpen: (task: CodexTask) => void
  teamMembers: TeamMember[]
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
}: {
  task: CodexTask
  clientName: string
  overdue: boolean
  teamMembers?: TeamMember[]
  meEmail?: string | null
  onHelpAsked?: () => void
}) {
  const done = task.checklist_done ?? 0
  const total = task.checklist_total ?? 0
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
      <p className="mt-1 truncate text-xs text-muted-foreground">{clientName}</p>
      {task.parent_task_id != null && task.parent_title ? (
        <Link
          href={`/tasks/${task.parent_task_id}`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="mt-1 inline-flex max-w-full items-center rounded-pill border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <span className="truncate">Help for: {task.parent_title}</span>
        </Link>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1">
          <span className="truncate">
            {task.assignee_name || task.assignee_email || "Unassigned"}
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
        <span
          className={cn(
            "num",
            overdue && `font-semibold ${TONE_TEXT.critical}`
          )}
        >
          {overdue ? `Overdue · ${formatDueYmd(task.due_date ?? null)}` : formatDueYmd(task.due_date ?? null)}
        </span>
        {total > 0 ? (
          <span className="inline-flex items-center gap-1 num">
            <CheckSquare className="h-3 w-3" aria-hidden />
            {done}/{total}
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
  columnStatus,
  clientName,
  onOpen,
  teamMembers,
  meEmail,
  onHelpAsked,
}: BoardCardProps) {
  const overdue = isOverdueYmd(task.due_date ?? null, task.status)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: String(task.id),
    data: { type: "card" as const, task, status: columnStatus },
  })

  return (
    <div
      ref={setNodeRef}
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
        isDragging && "opacity-40"
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
      />
    </div>
  )
}

function BoardColumn({
  status,
  label,
  tasks,
  count,
  loadingMore,
  onLoadMore,
  clientNameById,
  onOpen,
  teamMembers,
  meEmail,
  onHelpAsked,
}: {
  status: TaskStatus
  label: string
  tasks: CodexTask[]
  count: number
  loadingMore: boolean
  onLoadMore: (status: TaskStatus) => void
  clientNameById: Map<number, string>
  onOpen: (task: CodexTask) => void
  teamMembers: TeamMember[]
  meEmail: string | null
  onHelpAsked?: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnDropId(status),
    data: { type: "column" as const, status },
  })
  const meta = statusMeta(status)
  const remaining = Math.max(0, count - tasks.length)

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[12rem] min-w-[16.5rem] flex-1 flex-col rounded-card border border-border bg-surface-panel/60",
        isOver && "ring-2 ring-ring"
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <Badge variant={meta.badgeVariant} size="sm">
          {label}
        </Badge>
        <span className="num text-xs text-muted-foreground">{count}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2">
        {tasks.map((task) => (
          <TaskBoardCard
            key={String(task.id)}
            task={task}
            columnStatus={status}
            clientName={
              clientNameById.get(Number(task.client_id)) ??
              String(task.client_id || "—")
            }
            onOpen={onOpen}
            teamMembers={teamMembers}
            meEmail={meEmail}
            onHelpAsked={onHelpAsked}
          />
        ))}
        {tasks.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            Drop here
          </p>
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
            onClick={() => onLoadMore(status)}
          >
            {`Load more (${remaining} left)`}
          </Button>
        </div>
      ) : null}
    </div>
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
  onStatusChange: (
    task: CodexTask,
    nextStatus: TaskStatus
  ) => void | Promise<void>
  teamMembers: TeamMember[]
  meEmail: string | null
  onHelpAsked?: () => void
}

function emptyColumns(): Record<TaskStatus, CodexTask[]> {
  return {
    backlog: [],
    todo: [],
    in_progress: [],
    waiting: [],
    done: [],
  }
}

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
  const [activeId, setActiveId] = useState<string | null>(null)
  const visible = useMemo(
    () => visibleBoardStatuses(statusFilter),
    [statusFilter]
  )

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor)
  )

  const byStatus = useMemo(() => {
    const map = emptyColumns()
    for (const column of TASK_STATUSES) {
      for (const task of columns[column] ?? []) {
        const status = isTaskStatus(task.status) ? task.status : "todo"
        map[status].push(task)
      }
    }
    for (const column of Object.values(map)) {
      column.sort((a, b) => compareTasksForSort(a, b, sort))
    }
    return map
  }, [columns, sort])

  const activeTask = useMemo(() => {
    if (!activeId) return null
    for (const column of TASK_STATUSES) {
      const found = byStatus[column].find((task) => String(task.id) === activeId)
      if (found) return found
    }
    return null
  }, [activeId, byStatus])

  const resolveDropStatus = (
    overId: string | number,
    overData: unknown
  ): TaskStatus | null => {
    const col = parseColumnId(overId)
    if (col) return col
    if (
      overData &&
      typeof overData === "object" &&
      "status" in overData &&
      isTaskStatus((overData as { status?: unknown }).status)
    ) {
      return (overData as { status: TaskStatus }).status
    }
    return null
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over) return

    const task =
      (active.data.current &&
      typeof active.data.current === "object" &&
      "task" in active.data.current
        ? (active.data.current as { task?: CodexTask }).task
        : null) ?? activeTask
    if (!task) return

    const fromData =
      active.data.current &&
      typeof active.data.current === "object" &&
      "status" in active.data.current
        ? (active.data.current as { status?: unknown }).status
        : null
    const from = isTaskStatus(fromData)
      ? fromData
      : isTaskStatus(task.status)
        ? task.status
        : "todo"
    const to = resolveDropStatus(over.id, over.data.current)
    if (!to || from === to) return

    void onStatusChange(task, to)
  }

  const handleDragCancel = () => {
    setActiveId(null)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div
        className="flex w-full min-w-0 gap-3 overflow-x-auto pb-2"
        role="region"
        aria-label="Task board"
      >
        {STATUSES.filter((s) => visible.includes(s.value)).map((s) => (
          <BoardColumn
            key={s.value}
            status={s.value}
            label={s.label}
            tasks={byStatus[s.value]}
            count={counts[s.value] ?? 0}
            loadingMore={loadingMoreStatus === s.value}
            onLoadMore={onLoadMore}
            clientNameById={clientNameById}
            onOpen={onOpenTask}
            teamMembers={teamMembers}
            meEmail={meEmail}
            onHelpAsked={onHelpAsked}
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
              clientName={
                clientNameById.get(Number(activeTask.client_id)) ??
                String(activeTask.client_id || "—")
              }
              overdue={isOverdueYmd(activeTask.due_date ?? null, activeTask.status)}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
