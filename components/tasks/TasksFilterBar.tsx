"use client"

import { Columns3, LayoutList, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Label } from "@/components/ui/label"
import {
  STATUSES,
  TASK_CATEGORY_OPTIONS,
  categoryLabel,
  statusMeta,
} from "@/lib/codex/types"
import { cn } from "@/lib/utils"

const ALL = "__all__"

type ClientOpt = { id: number; label: string }
type MemberOpt = { email: string; name: string }

export type TasksFilterBarProps = {
  search: string
  clientId: string
  mbaFilter: string
  assigneeEmail: string
  categoryFilter: string
  statusFilter: string[]
  mine: boolean
  myWeek: boolean
  tasksLayout: "list" | "board"
  clients: ClientOpt[]
  members: MemberOpt[]
  onSearch: (v: string) => void
  onClient: (v: string) => void
  onClearMba: () => void
  onAssignee: (v: string) => void
  onCategory: (v: string) => void
  onStatus: (v: string[]) => void
  onMineToggle: (allTasks: boolean) => void
  onMyWeek: (on: boolean) => void
  onLayout: (v: "list" | "board") => void
  onClearAll: () => void
}

export function TasksFilterBar({
  search,
  clientId,
  mbaFilter,
  assigneeEmail,
  categoryFilter,
  statusFilter,
  mine,
  myWeek,
  tasksLayout,
  clients,
  members,
  onSearch,
  onClient,
  onClearMba,
  onAssignee,
  onCategory,
  onStatus,
  onMineToggle,
  onMyWeek,
  onLayout,
  onClearAll,
}: TasksFilterBarProps) {
  const clientOptions = [
    { value: ALL, label: "All clients" },
    ...clients.map((c) => ({ value: String(c.id), label: c.label })),
  ]
  const memberOptions = [
    { value: ALL, label: "Anyone" },
    ...members.map((m) => ({
      value: m.email,
      label: m.name,
      keywords: `${m.name} ${m.email}`,
    })),
  ]
  const categoryOptions = [
    { value: ALL, label: "All categories" },
    ...TASK_CATEGORY_OPTIONS.map((c) => ({ value: c.value, label: c.label })),
  ]

  const chips: Array<{ key: string; label: string; onClear: () => void }> = []
  if (search.trim()) {
    chips.push({
      key: "q",
      label: `Search: ${search.trim()}`,
      onClear: () => onSearch(""),
    })
  }
  if (clientId) {
    const name =
      clients.find((c) => String(c.id) === clientId)?.label ?? clientId
    chips.push({ key: "client", label: `Client: ${name}`, onClear: () => onClient("") })
  }
  if (mbaFilter) {
    chips.push({
      key: "mba",
      label: `MBA: ${mbaFilter}`,
      onClear: onClearMba,
    })
  }
  if (!mine && !myWeek && assigneeEmail) {
    const name =
      members.find((m) => m.email === assigneeEmail)?.name ?? assigneeEmail
    chips.push({
      key: "assignee",
      label: `Assignee: ${name}`,
      onClear: () => onAssignee(""),
    })
  }
  if (categoryFilter) {
    chips.push({
      key: "category",
      label: `Category: ${categoryLabel(categoryFilter)}`,
      onClear: () => onCategory(""),
    })
  }
  for (const status of statusFilter) {
    chips.push({
      key: `status-${status}`,
      label: statusMeta(status).label,
      onClear: () => onStatus(statusFilter.filter((s) => s !== status)),
    })
  }
  if (myWeek) {
    chips.push({ key: "week", label: "My week", onClear: () => onMyWeek(false) })
  }
  if (!mine && !myWeek) {
    chips.push({
      key: "all",
      label: "All tasks",
      onClear: () => onMineToggle(false),
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-card px-3 py-2 shadow-e1">
        <Input
          id="tasks-search"
          className="h-8 min-w-[10rem] flex-1"
          placeholder="Search title…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          aria-label="Search title"
        />
        <Combobox
          id="tasks-client"
          options={clientOptions}
          value={clientId || ALL}
          onValueChange={(v) => onClient(v === ALL ? "" : v)}
          placeholder="Client"
          searchPlaceholder="Search clients…"
          buttonClassName="h-8 w-[11rem]"
        />
        <Combobox
          id="tasks-assignee"
          options={memberOptions}
          value={mine || myWeek ? ALL : assigneeEmail || ALL}
          onValueChange={(v) => onAssignee(v === ALL ? "" : v)}
          placeholder="Assignee"
          searchPlaceholder="Search roster…"
          disabled={mine || myWeek}
          buttonClassName="h-8 w-[11rem]"
        />
        <Combobox
          id="tasks-category"
          options={categoryOptions}
          value={categoryFilter || ALL}
          onValueChange={(v) => onCategory(v === ALL ? "" : v)}
          placeholder="Category"
          searchPlaceholder="Search categories…"
          buttonClassName="h-8 w-[10rem]"
        />
        <ToggleGroup
          type="multiple"
          variant="outline"
          size="sm"
          className="flex flex-wrap justify-start"
          value={statusFilter}
          onValueChange={onStatus}
          aria-label="Status"
        >
          {STATUSES.map((s) => (
            <ToggleGroupItem key={s.value} value={s.value} aria-label={s.label}>
              {s.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button
          type="button"
          size="sm"
          variant={myWeek ? "default" : "outline"}
          className="h-8"
          onClick={() => onMyWeek(!myWeek)}
        >
          My week
        </Button>
        <div className="flex items-center gap-1.5">
          <Switch
            id="tasks-all"
            checked={!mine && !myWeek}
            onCheckedChange={(checked) => onMineToggle(checked)}
            aria-label="All tasks"
          />
          <Label htmlFor="tasks-all" className="cursor-pointer text-xs">
            All tasks
          </Label>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={tasksLayout}
            onValueChange={(v) => {
              if (v === "list" || v === "board") onLayout(v)
            }}
            aria-label="Choose list or board view"
          >
            <ToggleGroupItem value="list" aria-label="List view">
              <LayoutList className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="board" aria-label="Board view">
              <Columns3 className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <Badge
              key={chip.key}
              variant="secondary"
              size="sm"
              className={cn("gap-1 font-normal")}
            >
              {chip.label}
              <button
                type="button"
                className="rounded-sm hover:text-foreground"
                onClick={chip.onClear}
                aria-label={`Clear ${chip.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={onClearAll}
          >
            Clear all
          </Button>
        </div>
      ) : null}
    </div>
  )
}
