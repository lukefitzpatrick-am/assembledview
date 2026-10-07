"use client"

import { Columns3, LayoutList, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { TaskMbaSelect } from "@/components/tasks/TaskMbaSelect"
import type { MbaPlanRow } from "@/lib/codex/clientMbas"
import { myWeekDueBefore } from "@/lib/codex/quickAddParse"
import {
  TASK_SORT_OPTIONS,
  parseTaskSort,
  type TaskSortKey,
} from "@/lib/codex/queryHelpers"
import {
  STATUSES,
  TASK_CATEGORY_OPTIONS,
  TASK_PRIORITIES,
  categoryLabel,
  statusMeta,
} from "@/lib/codex/types"
import { cn } from "@/lib/utils"

const ALL = "__all__"
const UNASSIGNED = "__unassigned__"
const INACTIVE_HEADING = "__inactive__"

const SOURCE_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "ava", label: "AVA" },
  { value: "template", label: "Template" },
  { value: "recurring", label: "Recurring" },
  { value: "profile", label: "Profile" },
] as const

function myWeekChipLabel(now = new Date()): string {
  const ymd = myWeekDueBefore(now)
  const [y, m, d] = ymd.split("-").map(Number)
  const due = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "short",
  }).format(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)))
  return `My week · due by ${due}, incl. overdue`
}

function sourceLabel(value: string): string {
  return SOURCE_OPTIONS.find((option) => option.value === value)?.label ?? value
}

function priorityLabel(value: string): string {
  return TASK_PRIORITIES.find((option) => option.value === value)?.label ?? value
}

type ClientOpt = { id: number; label: string }
type MemberOpt = { email: string; name: string; active?: boolean }

export type TasksFilterBarProps = {
  search: string
  clientId: string
  mbaFilter: string
  mbaPlans: MbaPlanRow[]
  assigneeEmail: string
  categoryFilter: string
  statusFilter: string[]
  priorities: string[]
  overdue: boolean
  unassigned: boolean
  noClient: boolean
  createdByEmail: string
  dueFrom: string
  dueTo: string
  sources: string[]
  mine: boolean
  myWeek: boolean
  tasksLayout: "list" | "board"
  sort: TaskSortKey
  onSort: (sort: TaskSortKey) => void
  clients: ClientOpt[]
  members: MemberOpt[]
  onSearch: (v: string) => void
  onClient: (v: string) => void
  onMba: (v: string) => void
  onAssignee: (v: string) => void
  onUnassigned: () => void
  onCategory: (v: string) => void
  onStatus: (v: string[]) => void
  onPriorities: (v: string[]) => void
  onOverdue: (on: boolean) => void
  onNoClient: (on: boolean) => void
  onCreatedBy: (v: string) => void
  onDueFrom: (v: string) => void
  onDueTo: (v: string) => void
  onSources: (v: string[]) => void
  onMineToggle: (allTasks: boolean) => void
  onMyWeek: (on: boolean) => void
  onLayout: (v: "list" | "board") => void
  onClearAll: () => void
}

function memberOptions(members: MemberOpt[], includeUnassigned: boolean) {
  const byName = (a: MemberOpt, b: MemberOpt) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  const active = members.filter((member) => member.active !== false).toSorted(byName)
  const inactive = members.filter((member) => member.active === false).toSorted(byName)
  const toOption = (member: MemberOpt) => ({
    value: member.email,
    label: member.name,
    keywords: `${member.name} ${member.email}`,
  })
  return [
    ...(includeUnassigned ? [{ value: UNASSIGNED, label: "Unassigned" }] : []),
    { value: ALL, label: "Anyone" },
    ...active.map(toOption),
    ...(inactive.length > 0
      ? [
          { value: INACTIVE_HEADING, label: "Inactive", disabled: true },
          ...inactive.map(toOption),
        ]
      : []),
  ]
}

export function TasksFilterBar({
  search,
  clientId,
  mbaFilter,
  mbaPlans,
  assigneeEmail,
  categoryFilter,
  statusFilter,
  priorities,
  overdue,
  unassigned,
  noClient,
  createdByEmail,
  dueFrom,
  dueTo,
  sources,
  mine,
  myWeek,
  tasksLayout,
  sort,
  onSort,
  clients,
  members,
  onSearch,
  onClient,
  onMba,
  onAssignee,
  onUnassigned,
  onCategory,
  onStatus,
  onPriorities,
  onOverdue,
  onNoClient,
  onCreatedBy,
  onDueFrom,
  onDueTo,
  onSources,
  onMineToggle,
  onMyWeek,
  onLayout,
  onClearAll,
}: TasksFilterBarProps) {
  const clientOptions = [
    { value: ALL, label: "All clients" },
    ...clients.map((c) => ({ value: String(c.id), label: c.label })),
  ]
  const assigneeChoices = memberOptions(members, true)
  const creatorChoices = memberOptions(members, false)
  const categoryOptions = [
    { value: ALL, label: "All categories" },
    { value: "none", label: "Uncategorised" },
    ...TASK_CATEGORY_OPTIONS.map((c) => ({ value: c.value, label: c.label })),
  ]
  const clientNumeric = /^\d+$/.test(clientId) ? Number(clientId) : null
  const moreCount =
    priorities.length +
    sources.length +
    (overdue ? 1 : 0) +
    (unassigned ? 1 : 0) +
    (noClient ? 1 : 0) +
    (createdByEmail ? 1 : 0) +
    (dueFrom ? 1 : 0) +
    (dueTo ? 1 : 0)

  const chips: Array<{ key: string; label: string; onClear: () => void }> = []
  if (search.trim()) {
    chips.push({
      key: "q",
      label: `Search: ${search.trim()}`,
      onClear: () => onSearch(""),
    })
  }
  if (noClient) {
    chips.push({
      key: "no-client",
      label: "No client",
      onClear: () => onNoClient(false),
    })
  } else if (clientId) {
    const name =
      clients.find((c) => String(c.id) === clientId)?.label ?? clientId
    chips.push({ key: "client", label: `Client: ${name}`, onClear: () => onClient("") })
  }
  if (mbaFilter) {
    chips.push({
      key: "mba",
      label: `MBA: ${mbaFilter}`,
      onClear: () => onMba(""),
    })
  }
  if (unassigned && !myWeek) {
    chips.push({
      key: "unassigned",
      label: "Unassigned",
      onClear: () => onAssignee(""),
    })
  } else if (!mine && !myWeek && assigneeEmail) {
    const name =
      members.find((m) => m.email === assigneeEmail)?.name ?? assigneeEmail
    chips.push({
      key: "assignee",
      label: `Assignee: ${name}`,
      onClear: () => onAssignee(""),
    })
  }
  if (createdByEmail) {
    const name =
      members.find((m) => m.email === createdByEmail)?.name ?? createdByEmail
    chips.push({
      key: "created-by",
      label: `Created by: ${name}`,
      onClear: () => onCreatedBy(""),
    })
  }
  if (categoryFilter) {
    chips.push({
      key: "category",
      label:
        categoryFilter === "none"
          ? "Uncategorised"
          : `Category: ${categoryLabel(categoryFilter)}`,
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
  for (const priority of priorities) {
    chips.push({
      key: `priority-${priority}`,
      label: `Priority: ${priorityLabel(priority)}`,
      onClear: () => onPriorities(priorities.filter((value) => value !== priority)),
    })
  }
  for (const source of sources) {
    chips.push({
      key: `source-${source}`,
      label: `Source: ${sourceLabel(source)}`,
      onClear: () => onSources(sources.filter((value) => value !== source)),
    })
  }
  if (overdue) {
    chips.push({
      key: "overdue",
      label: "Overdue",
      onClear: () => onOverdue(false),
    })
  }
  if (dueFrom) {
    chips.push({
      key: "due-from",
      label: `Due from: ${dueFrom}`,
      onClear: () => onDueFrom(""),
    })
  }
  if (dueTo) {
    chips.push({
      key: "due-to",
      label: `Due to: ${dueTo}`,
      onClear: () => onDueTo(""),
    })
  }
  if (myWeek) {
    chips.push({
      key: "week",
      label: myWeekChipLabel(),
      onClear: () => onMyWeek(false),
    })
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
          placeholder="Search title, description or MBA"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          aria-label="Search title, description or MBA"
        />
        <Combobox
          id="tasks-client"
          options={clientOptions}
          value={noClient ? ALL : clientId || ALL}
          onValueChange={(v) => onClient(v === ALL ? "" : v)}
          placeholder="Client"
          searchPlaceholder="Search clients…"
          disabled={noClient}
          buttonClassName="h-8 w-[11rem]"
        />
        <TaskMbaSelect
          id="tasks-filter-mba"
          hideLabel
          clientId={clientNumeric}
          value={mbaFilter}
          plans={mbaPlans}
          onChange={(mba) => onMba(mba ?? "")}
          buttonClassName="h-8 w-[14rem]"
        />
        <Combobox
          id="tasks-assignee"
          options={assigneeChoices}
          value={
            mine || myWeek ? ALL : unassigned ? UNASSIGNED : assigneeEmail || ALL
          }
          onValueChange={(v) => {
            if (v === INACTIVE_HEADING) return
            if (v === UNASSIGNED) onUnassigned()
            else onAssignee(v === ALL ? "" : v)
          }}
          placeholder="Assignee"
          searchPlaceholder="Search roster…"
          disabled={mine || myWeek}
          preserveOrder
          buttonClassName="h-8 w-[11rem]"
        />
        <Combobox
          id="tasks-category"
          options={categoryOptions}
          value={categoryFilter || ALL}
          onValueChange={(v) => onCategory(v === ALL ? "" : v)}
          placeholder="Category"
          searchPlaceholder="Search categories…"
          preserveOrder
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
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-8">
              More filters
              {moreCount > 0 ? (
                <Badge variant="secondary" size="sm" className="ml-1.5">
                  {moreCount}
                </Badge>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 space-y-3">
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Priority</p>
              <ToggleGroup
                type="multiple"
                variant="outline"
                size="sm"
                className="flex flex-wrap justify-start"
                value={priorities}
                onValueChange={onPriorities}
                aria-label="Priority"
              >
                {[...TASK_PRIORITIES].toReversed().map((priority) => (
                  <ToggleGroupItem
                    key={priority.value}
                    value={priority.value}
                    aria-label={priority.label}
                  >
                    {priority.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="tasks-overdue" className="cursor-pointer text-xs">
                Overdue
              </Label>
              <Switch
                id="tasks-overdue"
                checked={overdue}
                onCheckedChange={onOverdue}
                aria-label="Overdue"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="tasks-unassigned" className="cursor-pointer text-xs">
                Unassigned
              </Label>
              <Switch
                id="tasks-unassigned"
                checked={unassigned && !myWeek}
                onCheckedChange={(checked) => {
                  if (checked) onUnassigned()
                  else onAssignee("")
                }}
                aria-label="Unassigned"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="tasks-no-client" className="cursor-pointer text-xs">
                No client
              </Label>
              <Switch
                id="tasks-no-client"
                checked={noClient}
                onCheckedChange={onNoClient}
                aria-label="No client"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tasks-created-by" className="text-xs text-muted-foreground">
                Created by
              </Label>
              <Combobox
                id="tasks-created-by"
                options={creatorChoices}
                value={createdByEmail || ALL}
                onValueChange={(v) => {
                  if (v === INACTIVE_HEADING) return
                  onCreatedBy(v === ALL ? "" : v)
                }}
                placeholder="Anyone"
                searchPlaceholder="Search roster…"
                preserveOrder
                buttonClassName="h-8"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="tasks-due-from" className="text-xs text-muted-foreground">
                  Due from
                </Label>
                <Input
                  id="tasks-due-from"
                  type="date"
                  className="h-8"
                  value={dueFrom}
                  onChange={(e) => onDueFrom(e.target.value)}
                  aria-label="Due from"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tasks-due-to" className="text-xs text-muted-foreground">
                  Due to
                </Label>
                <Input
                  id="tasks-due-to"
                  type="date"
                  className="h-8"
                  value={dueTo}
                  onChange={(e) => onDueTo(e.target.value)}
                  aria-label="Due to"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Source</p>
              <ToggleGroup
                type="multiple"
                variant="outline"
                size="sm"
                className="flex flex-wrap justify-start"
                value={sources}
                onValueChange={onSources}
                aria-label="Source"
              >
                {SOURCE_OPTIONS.map((source) => (
                  <ToggleGroupItem
                    key={source.value}
                    value={source.value}
                    aria-label={source.label}
                  >
                    {source.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </PopoverContent>
        </Popover>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="tasks-sort" className="text-xs text-muted-foreground">
              Sort
            </Label>
            <Select value={sort} onValueChange={(value) => onSort(parseTaskSort(value))}>
              <SelectTrigger id="tasks-sort" className="h-8 w-[12.5rem]" aria-label="Sort tasks">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
                className="cursor-pointer rounded-sm hover:text-foreground"
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
