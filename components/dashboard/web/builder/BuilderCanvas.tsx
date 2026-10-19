"use client"

import type { KeyboardEvent } from "react"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"

import { ElementBoundary } from "@/components/dashboard/web/WebReportView"
import { WebReportElement } from "@/components/dashboard/web/reportElements"
import { Skeleton } from "@/components/ui/skeleton"
import { DISPLAY_LABEL, entryDisplay, entryWidth, type BuilderEntry } from "@/lib/webReport/builder/editor"
import { elementTitle } from "@/lib/webReport/builder/layout"
import { columnSpanClass } from "@/lib/webReport/displayModel"
import type { WebReportData } from "@/lib/webReport/types"

/** Alt+Up and Alt+Down move the focused element. Returns the move, or null for any other key. */
export function keyboardMove(event: Pick<KeyboardEvent, "altKey" | "key">): -1 | 1 | null {
  if (!event.altKey) return null
  if (event.key === "ArrowUp") return -1
  if (event.key === "ArrowDown") return 1
  return null
}

function CanvasItem({
  entry,
  selected,
  data,
  onSelect,
  onMove,
}: {
  entry: BuilderEntry
  selected: boolean
  data: WebReportData | null
  onSelect: () => void
  onMove: (delta: -1 | 1) => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.key,
  })
  const title = elementTitle(entry.item.elementId)
  return (
    <div
      ref={setNodeRef}
      data-element-key={entry.key}
      className={`${columnSpanClass(entryWidth(entry))} ${isDragging ? "opacity-60" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onKeyDown={(event) => {
        const delta = keyboardMove(event)
        if (delta == null) return
        event.preventDefault()
        onMove(delta)
      }}
    >
      <div
        className={`flex h-full flex-col gap-1 rounded-card ${
          selected ? "outline outline-2 outline-offset-2 outline-primary" : ""
        }`}
      >
        <div className="flex items-center gap-1">
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label={`Drag to reorder ${title}`}
            className="interactive-tint inline-flex h-11 w-11 cursor-grab items-center justify-center rounded-input text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" strokeWidth={1.8} aria-hidden />
          </button>
          <button
            type="button"
            aria-pressed={selected}
            className="interactive-tint flex min-h-11 flex-1 items-center justify-between gap-2 rounded-input px-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onSelect}
          >
            <span className="truncate font-medium text-foreground">{title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {DISPLAY_LABEL[entryDisplay(entry)]} · <span className="font-semibold text-primary">Edit</span>
            </span>
          </button>
        </div>
        <div className="min-h-0 flex-1">
          {data == null ? (
            <div className="rounded-card border border-border bg-card p-4 shadow-e1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-4 h-40 w-full" />
            </div>
          ) : (
            <ElementBoundary title={title}>
              <WebReportElement item={entry.item} data={data} />
            </ElementBoundary>
          )}
        </div>
      </div>
    </div>
  )
}

export function BuilderCanvas({
  entries,
  selectedKey,
  data,
  onSelect,
  onMove,
  onReorder,
}: {
  entries: BuilderEntry[]
  selectedKey: string | null
  data: WebReportData | null
  onSelect: (key: string) => void
  onMove: (key: string, delta: -1 | 1) => void
  onReorder: (from: number, to: number) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = entries.findIndex((entry) => entry.key === active.id)
    const to = entries.findIndex((entry) => entry.key === over.id)
    if (from >= 0 && to >= 0) onReorder(from, to)
  }

  if (entries.length === 0) {
    return (
      <section aria-label="Report" className="rounded-card border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
        Add an element from the library.
      </section>
    )
  }

  return (
    <section aria-label="Report">
      <DndContext id="web-report-builder" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={entries.map((entry) => entry.key)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            {entries.map((entry) => (
              <CanvasItem
                key={entry.key}
                entry={entry}
                selected={entry.key === selectedKey}
                data={data}
                onSelect={() => onSelect(entry.key)}
                onMove={(delta) => onMove(entry.key, delta)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  )
}
