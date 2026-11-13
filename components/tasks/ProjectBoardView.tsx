"use client"

/**
 * The project board (B39, plan 5.4): presentational. Columns are the
 * project's sections; the header menu manages a section; each column footer
 * adds a task inline or opens the paste box. ProjectBoardClient loads the
 * data and owns the requests.
 */
import { useState, type ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft, ClipboardPaste, Lock, MoreHorizontal, Plus, SlidersHorizontal } from "lucide-react"

import { GenericTaskBoard } from "@/components/tasks/TaskBoard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  sectionIdFromColumnKey,
  sectionMenuItems,
  type BoardColumnDef,
  type BoardMove,
  type BoardState,
} from "@/lib/codex/projectBoard"
import type { CodexProject, CodexSection, SectionStatusCategory } from "@/lib/codex/projects"
import type { CodexTask } from "@/lib/codex/types"

export type SectionMenuHandlers = {
  onRename: (section: CodexSection) => void
  onMove: (section: CodexSection, direction: -1 | 1) => void
  onToggleCollapse: (section: CodexSection) => void
  onSetCategory: (section: CodexSection, category: SectionStatusCategory) => void
  onDelete: (section: CodexSection) => void
  onPaste: (section: CodexSection) => void
}

export type ProjectBoardViewProps = SectionMenuHandlers & {
  project: CodexProject
  sections: CodexSection[]
  board: BoardState
  /** Live tasks per section key, completed included (the delete rule). */
  liveCounts: Record<string, number>
  completedCounts: Record<string, number>
  unsectionedCount: number
  hideCompleted: boolean
  onHideCompletedChange: (hide: boolean) => void
  collapsedKeys: ReadonlySet<string>
  loadingMoreKey: string | null
  onLoadMore: (key: string) => void
  onOpenTask: (task: CodexTask) => void
  onCardMove: (task: CodexTask, move: BoardMove) => void
  onAddSection: () => void
  onInlineAdd: (section: CodexSection, title: string) => Promise<boolean>
  busy?: boolean
  /** B40: custom field chips for a card, and the fields settings and view toggle in the header. */
  cardChips?: (task: CodexTask) => readonly string[]
  onOpenFields?: () => void
  headerExtra?: ReactNode
}

const KIND_LABEL: Record<string, string> = {
  campaign: "Campaign",
  retainer: "Retainer",
  onboarding: "Onboarding",
  pitch: "Pitch",
  internal: "Internal",
  ops: "Ops",
}

function SectionMenu({
  section,
  sections,
  liveTasks,
  collapsed,
  handlers,
}: {
  section: CodexSection
  sections: CodexSection[]
  liveTasks: number
  collapsed: boolean
  handlers: SectionMenuHandlers
}) {
  const items = sectionMenuItems(sections, section.id, { liveTasks, collapsed })
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          aria-label={`Section menu: ${section.name}`}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={() => handlers.onPaste(section)}>Paste tasks</DropdownMenuItem>
        <DropdownMenuSeparator />
        {items.map((item) => {
          const key = item.action === "set_category" ? `${item.action}:${item.category}` : item.action
          const run = () => {
            switch (item.action) {
              case "rename":
                return handlers.onRename(section)
              case "move_left":
                return handlers.onMove(section, -1)
              case "move_right":
                return handlers.onMove(section, 1)
              case "toggle_collapse":
                return handlers.onToggleCollapse(section)
              case "set_category":
                return handlers.onSetCategory(section, item.category)
              case "delete":
                return handlers.onDelete(section)
            }
          }
          return (
            <DropdownMenuItem
              key={key}
              disabled={item.disabled}
              title={item.reason ?? undefined}
              onSelect={run}
              className={item.action === "delete" ? "text-status-critical-fg" : undefined}
            >
              <span className="flex w-full items-center justify-between gap-2">
                {item.label}
                {item.action === "set_category" && item.current ? (
                  <span className="text-xs text-muted-foreground">current</span>
                ) : null}
              </span>
            </DropdownMenuItem>
          )
        })}
        {items.some((i) => i.action === "delete" && i.disabled && i.reason) ? (
          <p className="px-2 pb-1 pt-0.5 text-xs text-muted-foreground">
            {items.find((i) => i.action === "delete")?.reason}
          </p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function InlineAdd({
  section,
  onAdd,
  onPaste,
}: {
  section: CodexSection
  onAdd: (section: CodexSection, title: string) => Promise<boolean>
  onPaste: (section: CodexSection) => void
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [saving, setSaving] = useState(false)

  if (!open) {
    return (
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="sm" className="flex-1 justify-start" onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Add task
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          aria-label={`Paste tasks into ${section.name}`}
          onClick={() => onPaste(section)}
        >
          <ClipboardPaste className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    )
  }

  const submit = async () => {
    const value = title.trim()
    if (!value || saving) return
    setSaving(true)
    const ok = await onAdd(section, value)
    setSaving(false)
    if (ok) setTitle("")
  }

  return (
    <Input
      autoFocus
      value={title}
      disabled={saving}
      placeholder="Task name, then Enter"
      aria-label={`New task in ${section.name}`}
      onChange={(e) => setTitle(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          void submit()
        } else if (e.key === "Escape") {
          setOpen(false)
          setTitle("")
        }
      }}
      onBlur={() => {
        if (!title.trim()) setOpen(false)
      }}
    />
  )
}

export function ProjectBoardView(props: ProjectBoardViewProps) {
  const {
    project,
    sections,
    board,
    liveCounts,
    completedCounts,
    unsectionedCount,
    hideCompleted,
    onHideCompletedChange,
    collapsedKeys,
    loadingMoreKey,
    onLoadMore,
    onOpenTask,
    onCardMove,
    onAddSection,
    onInlineAdd,
    busy = false,
    cardChips,
    onOpenFields,
    headerExtra,
  } = props
  const sectionFor = (column: BoardColumnDef) => sections.find((s) => s.id === sectionIdFromColumnKey(column.key))
  const hiddenDone = Object.values(completedCounts).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Link
            href="/tasks?tab=projects"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden />
            Projects
          </Link>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold tracking-tight text-foreground">
            {project.name}
            <Badge variant="secondary" size="sm">
              {KIND_LABEL[project.kind] ?? project.kind}
            </Badge>
            {project.mba_number ? (
              <Badge variant="neutral" size="sm">
                {project.mba_number}
              </Badge>
            ) : null}
            {project.is_private ? (
              <Badge variant="neutral" size="sm">
                <Lock className="mr-1 h-3 w-3" aria-hidden />
                Private
              </Badge>
            ) : null}
            {project.status !== "active" ? (
              <Badge variant="warning" size="sm">
                {project.status === "on_hold" ? "On hold" : "Closed"}
              </Badge>
            ) : null}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Switch
              checked={hideCompleted}
              onCheckedChange={onHideCompletedChange}
              aria-label="Hide completed tasks"
              disabled={busy}
            />
            Hide completed
            {hideCompleted && hiddenDone > 0 ? <span className="num text-xs">({hiddenDone} hidden)</span> : null}
          </label>
          {headerExtra}
          {onOpenFields ? (
            <Button type="button" variant="outline" size="sm" onClick={onOpenFields} disabled={busy}>
              <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Fields
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={onAddSection} disabled={busy}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Add section
          </Button>
        </div>
      </div>

      {unsectionedCount > 0 ? (
        <p className="rounded-card border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {`${unsectionedCount} task${unsectionedCount === 1 ? " is" : "s are"} in this project without a section. Open ${unsectionedCount === 1 ? "it" : "them"} from the Tasks list.`}
        </p>
      ) : null}

      <GenericTaskBoard
        source={{ kind: "sections", sections }}
        columns={board.columns}
        counts={board.counts}
        onLoadMore={onLoadMore}
        loadingMoreKey={loadingMoreKey}
        clientNameFor={() => null}
        onOpenTask={onOpenTask}
        onMove={onCardMove}
        collapsedKeys={collapsedKeys}
        meEmail={null}
        ariaLabel={`${project.name} board`}
        cardChips={cardChips}
        renderColumnMenu={(column) => {
          const section = sectionFor(column)
          if (!section) return null
          return (
            <SectionMenu
              section={section}
              sections={sections}
              liveTasks={liveCounts[column.key] ?? 0}
              collapsed={collapsedKeys.has(column.key)}
              handlers={props}
            />
          )
        }}
        renderColumnFooter={(column) => {
          const section = sectionFor(column)
          if (!section) return null
          return <InlineAdd section={section} onAdd={onInlineAdd} onPaste={props.onPaste} />
        }}
      />
    </div>
  )
}
