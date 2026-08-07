"use client"

import { useMemo, useState } from "react"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { CheckSquare } from "lucide-react"
import { isValid, parseISO, startOfDay } from "date-fns"
import { Badge } from "@/components/ui/badge"
import {
  STATUSES,
  TASK_PRIORITIES,
  isTaskStatus,
  statusMeta,
  type CodexTask,
  type TaskStatus,
} from "@/lib/codex/types"
import { cn } from "@/lib/utils"

const SYDNEY_TZ = "Australia/Sydney"

function formatDueDateSydney(value: string | null | undefined): string {
  if (!value) return "—"
  const raw = value.includes("T") ? value : `${value}T12:00:00`
  const d = parseISO(raw)
  if (!isValid(d)) return value
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: SYDNEY_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d)
}

function isOverdue(task: CodexTask): boolean {
  if (!task.due_date) return false
  if (task.status === "done") return false
  const raw = task.due_date.includes("T")
    ? task.due_date
    : `${task.due_date}T23:59:59`
  const due = parseISO(raw)
  if (!isValid(due)) return false
  return due < startOfDay(new Date())
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

type BoardCardProps = {
  task: CodexTask
  clientName: string
  onOpen: (task: CodexTask) => void
}

function TaskBoardCardFace({
  task,
  clientName,
  overdue,
}: {
  task: CodexTask
  clientName: string
  overdue: boolean
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
        <Badge
          variant={priority === "high" ? "warning" : "secondary"}
          size="sm"
        >
          {priorityLabel(priority)}
        </Badge>
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">{clientName}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="truncate">
          {task.assignee_name || task.assignee_email || "Unassigned"}
        </span>
        <span
          className={cn(
            "num",
            overdue && "font-semibold text-status-critical-fg"
          )}
        >
          {overdue ? `Overdue · ${formatDueDateSydney(task.due_date)}` : formatDueDateSydney(task.due_date)}
        </span>
        {total > 0 ? (
          <span className="inline-flex items-center gap-1 num">
            <CheckSquare className="h-3 w-3" aria-hidden />
            {done}/{total}
          </span>
        ) : null}
      </div>
    </>
  )
}

function SortableTaskCard({ task, clientName, onOpen }: BoardCardProps) {
  const overdue = isOverdue(task)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: String(task.id),
    data: { type: "card" as const, task, status: task.status },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(task)}
      className={cn(
        "interactive w-full rounded-card border border-border bg-card p-3 text-left shadow-e1",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        overdue && "border-l-[3px] border-l-status-critical-fg",
        isDragging && "opacity-40"
      )}
      aria-label={`${task.title}${overdue ? ", overdue" : ""}`}
    >
      <TaskBoardCardFace task={task} clientName={clientName} overdue={overdue} />
    </button>
  )
}

function BoardColumn({
  status,
  label,
  tasks,
  clientNameById,
  onOpen,
}: {
  status: TaskStatus
  label: string
  tasks: CodexTask[]
  clientNameById: Map<number, string>
  onOpen: (task: CodexTask) => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnDropId(status),
    data: { type: "column" as const, status },
  })
  const meta = statusMeta(status)

  return (
    <div
      className={cn(
        "flex min-h-[12rem] w-[16.5rem] shrink-0 flex-col rounded-card border border-border bg-surface-panel/60",
        isOver && "ring-2 ring-ring"
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <Badge variant={meta.badgeVariant} size="sm">
          {label}
        </Badge>
        <span className="num text-xs text-muted-foreground">{tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className="flex flex-1 flex-col gap-2 p-2"
      >
        <SortableContext
          items={tasks.map((t) => String(t.id))}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <SortableTaskCard
              key={String(task.id)}
              task={task}
              clientName={
                clientNameById.get(Number(task.client_id)) ??
                String(task.client_id || "—")
              }
              onOpen={onOpen}
            />
          ))}
        </SortableContext>
        {tasks.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            Drop here
          </p>
        ) : null}
      </div>
    </div>
  )
}

type Props = {
  tasks: CodexTask[]
  clientNameById: Map<number, string>
  onOpenTask: (task: CodexTask) => void
  onStatusChange: (
    task: CodexTask,
    nextStatus: TaskStatus
  ) => void | Promise<void>
}

export function TaskBoard({
  tasks,
  clientNameById,
  onOpenTask,
  onStatusChange,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const byStatus = useMemo(() => {
    const map: Record<TaskStatus, CodexTask[]> = {
      backlog: [],
      todo: [],
      in_progress: [],
      waiting: [],
      done: [],
    }
    for (const task of tasks) {
      const status = isTaskStatus(task.status) ? task.status : "todo"
      map[status].push(task)
    }
    return map
  }, [tasks])

  const activeTask = useMemo(() => {
    if (!activeId) return null
    return tasks.find((t) => String(t.id) === activeId) ?? null
  }, [activeId, tasks])

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
    const overTask = tasks.find((t) => String(t.id) === String(overId))
    if (overTask && isTaskStatus(overTask.status)) return overTask.status
    return null
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over) return

    const task = tasks.find((t) => String(t.id) === String(active.id))
    if (!task) return

    const from = isTaskStatus(task.status) ? task.status : null
    const to = resolveDropStatus(over.id, over.data.current)
    if (!from || !to || from === to) return

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
        className="flex gap-3 overflow-x-auto pb-2"
        role="region"
        aria-label="Task board"
      >
        {STATUSES.map((s) => (
          <BoardColumn
            key={s.value}
            status={s.value}
            label={s.label}
            tasks={byStatus[s.value]}
            clientNameById={clientNameById}
            onOpen={onOpenTask}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div
            className={cn(
              "w-[15.5rem] rounded-card border border-border bg-card p-3 shadow-e2",
              isOverdue(activeTask) && "border-l-[3px] border-l-status-critical-fg"
            )}
          >
            <TaskBoardCardFace
              task={activeTask}
              clientName={
                clientNameById.get(Number(activeTask.client_id)) ??
                String(activeTask.client_id || "—")
              }
              overdue={isOverdue(activeTask)}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
