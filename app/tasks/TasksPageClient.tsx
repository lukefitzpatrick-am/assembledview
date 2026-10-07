"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table"
import { ArrowDown, ArrowUp, Inbox, ListTodo, PlusCircle, Trash2, Users, LayoutTemplate } from "lucide-react"
import { isValid, parseISO } from "date-fns"
import { formatDueYmd, isOverdueYmd, toSydneyCivilYmd } from "@/lib/codex/dueDate"
import { MediaPlanEditorHero } from "@/components/mediaplans/MediaPlanEditorHero"
import { useUser } from "@/components/AuthWrapper"
import { TaskAskHelpButton } from "@/components/tasks/TaskAskHelpDialog"
import { TaskBoard, visibleBoardStatuses } from "@/components/tasks/TaskBoard"
import { TaskBulkBar } from "@/components/tasks/TaskBulkBar"
import { TaskDetailSlideOver } from "@/components/tasks/TaskDetailSlideOver"
import { TaskEstimateChip } from "@/components/tasks/TaskEstimateChip"
import { TaskFormDialog } from "@/components/tasks/TaskFormDialog"
import { TaskMbaSelect } from "@/components/tasks/TaskMbaSelect"
import { TasksFilterBar } from "@/components/tasks/TasksFilterBar"
import { TeamMemberFormDialog } from "@/components/tasks/TeamMemberFormDialog"
import { TemplateFormDialog } from "@/components/tasks/TemplateFormDialog"
import { TaskQuickAdd } from "@/components/tasks/TaskQuickAdd"
import { TimesheetDraftsPanel } from "@/components/tasks/TimesheetDraftsPanel"
import { Auth0RosterSyncButton } from "@/components/tasks/Auth0RosterSyncButton"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Combobox, ComboboxModalProvider } from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { EmptyState } from "@/components/ui/states"
import { ViewStateBoundary } from "@/components/ui/ViewStateBoundary"
import { ToastAction } from "@/components/ui/toast"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"
import {
  applyClientsFetchResult,
  fetchClientsList,
} from "@/lib/clients/fetchClientsList"
import { getClientDisplayName } from "@/lib/clients/slug"
import type { MbaPlanRow } from "@/lib/codex/clientMbas"
import { MY_WEEK_STATUSES, myWeekDueBefore } from "@/lib/codex/quickAddParse"
import { resolveListViewState } from "@/lib/ui/viewState"
import {
  applyTasksFilterChange,
  buildTasksFetchParams,
  exitMyWeekState,
  parseTasksFilterParams,
  parseTasksLayoutValue,
  readStoredTasksLayout,
  serializeTasksFilterParams,
  taskDetailHref,
  taskListHref,
  writeStoredTasksLayout,
  type TaskSortKey,
  type TasksFilterState,
} from "@/lib/codex/queryHelpers"
import {
  STATUSES,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  categoryLabel,
  isTaskCategory,
  statusMeta,
  type CodexPagedResponse,
  type CodexTask,
  type TaskStatus,
  type TaskTemplate,
  type TeamMember,
  isTaskStatus,
} from "@/lib/codex/types"
import type { TeamWeekTimeSummary } from "@/lib/myhours/timeSummary"

function teamTasksHref(email: string, kind: "open" | "overdue"): string {
  const assignee = encodeURIComponent(email.trim())
  if (kind === "overdue") {
    return `/tasks?all=1&assignee=${assignee}&overdue=1`
  }
  return `/tasks?all=1&assignee=${assignee}&status=backlog,todo,in_progress,waiting`
}

type TeamMemberWithWeek = TeamMember & {
  week_hours: number
  estimated_open_hours: number
  open_tasks: number
  overdue_tasks: number
}

type ClientOption = {
  id: number
  mp_client_name?: string
  client_name?: string
  slug?: string
}

const SYDNEY_TZ = "Australia/Sydney"
const PER_PAGE = 100
const BOARD_PER_PAGE = 50

type BoardColumns = Record<TaskStatus, CodexTask[]>

function emptyBoardColumns(): BoardColumns {
  return {
    backlog: [],
    todo: [],
    in_progress: [],
    waiting: [],
    done: [],
  }
}

function emptyStatusCounts(): Record<TaskStatus, number> {
  return {
    backlog: 0,
    todo: 0,
    in_progress: 0,
    waiting: 0,
    done: 0,
  }
}

function readStatusCounts(body: unknown): Record<TaskStatus, number> {
  const src =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const counts = emptyStatusCounts()
  for (const status of TASK_STATUSES) {
    const value = Number(src[status])
    counts[status] = Number.isFinite(value) ? value : 0
  }
  return counts
}

function mergeBoardTasks(current: CodexTask[], incoming: CodexTask[]): CodexTask[] {
  const seen = new Set(current.map((task) => String(task.id)))
  return [
    ...current,
    ...incoming.filter((task) => !seen.has(String(task.id))),
  ]
}
const INBOX_PER_PAGE = 20
const NOTES_TRUNCATE = 60

function formatUpdatedAt(value: string | null | undefined): string {
  if (!value) return "—"
  const d = parseISO(value)
  if (!isValid(d)) return value
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: SYDNEY_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

function truncateNotes(value: string | null | undefined): string {
  if (!value) return "—"
  const trimmed = value.trim()
  if (trimmed.length <= NOTES_TRUNCATE) return trimmed
  return `${trimmed.slice(0, NOTES_TRUNCATE)}…`
}

function SortHeaderButton({
  label,
  active,
  direction,
  onClick,
}: {
  label: string
  active: boolean
  direction: "asc" | "desc"
  onClick: () => void
}) {
  const Icon = direction === "asc" ? ArrowUp : ArrowDown
  return (
    <button
      type="button"
      className="inline-flex cursor-pointer items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
      onClick={onClick}
    >
      {label}
      {active ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
    </button>
  )
}

function recordToSearchParams(
  record: Record<string, string | string[] | undefined>
): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string") params.append(key, value)
    else if (Array.isArray(value)) {
      for (const item of value) params.append(key, item)
    }
  }
  return params
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError"
}

const EDIT_CATEGORY_NONE = "__none__"
const EDIT_ASSIGNEE_NONE = "__unassigned__"

function inboxAcceptEdits(
  proposal: {
    proposed_title: string
    proposed_description: string | null
    proposed_assignee_email: string | null
    proposed_mba_number: string | null
    proposed_category: string | null
    proposed_due_date: string | null
    client_id: number | null
  },
  form: {
    title: string
    description: string
    clientId: string
    mba: string
    assignee: string
    due: string
    category: string
  }
): Record<string, string | number | null> | null {
  const edits: Record<string, string | number | null> = {}
  const title = form.title.trim()
  if (title !== proposal.proposed_title.trim()) edits.title = title

  const description = form.description.trim()
  const originalDescription = (proposal.proposed_description ?? "").trim()
  if (description !== originalDescription) {
    edits.description = description || null
  }

  const clientId = form.clientId.trim() ? Number(form.clientId) : null
  if (clientId !== (proposal.client_id ?? null)) {
    edits.client_id = clientId != null && Number.isFinite(clientId) ? clientId : null
  }

  const mba = form.mba.trim()
  if (mba !== (proposal.proposed_mba_number ?? "").trim()) {
    edits.mba_number = mba || null
  }

  const assignee = form.assignee.trim().toLowerCase()
  const originalAssignee = (proposal.proposed_assignee_email ?? "")
    .trim()
    .toLowerCase()
  if (assignee !== originalAssignee) {
    edits.assignee_email = assignee || null
  }

  const due = form.due.trim()
  const originalDue = toSydneyCivilYmd(proposal.proposed_due_date) ?? ""
  if (due !== originalDue) edits.due_date = due || null

  const category = form.category.trim()
  if (category !== (proposal.proposed_category ?? "").trim()) {
    edits.category = category || null
  }

  return Object.keys(edits).length > 0 ? edits : null
}

function quickAddVisibleInFilters(
  task: {
    title: string
    clientId: number
    priority: string
    assigneeEmail: string | null
    dueDate: string | null
    mbaNumber: string | null
    category: string | null
    creatorEmail: string | null
  },
  filters: {
    clientId: string
    mbaFilter: string
    categoryFilter: string
    search: string
    assigneeEmail: string
    statuses: string[]
    mine: boolean
    myWeek: boolean
    priorities: string[]
    overdue: boolean
    unassigned: boolean
    noClient: boolean
    createdByEmail: string
    dueFrom: string
    dueTo: string
    sources: string[]
  },
  now = new Date()
): boolean {
  const assignee = task.assigneeEmail?.trim().toLowerCase() || null
  const creator = task.creatorEmail?.trim().toLowerCase() || null
  const mba = task.mbaNumber?.trim() || null

  if (filters.noClient) {
    if (task.clientId != null) return false
  } else if (filters.clientId.trim()) {
    if (Number(filters.clientId) !== task.clientId) return false
  }

  if (filters.mbaFilter.trim()) {
    if ((mba ?? "").toLowerCase() !== filters.mbaFilter.trim().toLowerCase()) {
      return false
    }
  }

  if (filters.categoryFilter === "none") {
    if (task.category) return false
  } else if (filters.categoryFilter && task.category !== filters.categoryFilter) {
    return false
  }

  const query = filters.search.trim().slice(0, 100).toLowerCase()
  if (query) {
    const inTitle = task.title.toLowerCase().includes(query)
    const inMba = (mba ?? "").toLowerCase().includes(query)
    if (!inTitle && !inMba) return false
  }

  if (
    filters.priorities.length > 0 &&
    !filters.priorities.includes(task.priority)
  ) {
    return false
  }

  if (filters.sources.length > 0 && !filters.sources.includes("manual")) {
    return false
  }

  const createdBy = filters.createdByEmail.trim().toLowerCase()
  if (createdBy && createdBy !== creator) return false

  if (filters.myWeek) {
    if (!task.dueDate || task.dueDate > myWeekDueBefore(now)) return false
    return true
  }

  if (filters.overdue && !isOverdueYmd(task.dueDate, "todo", now)) return false
  if (filters.dueFrom && (!task.dueDate || task.dueDate < filters.dueFrom)) {
    return false
  }
  if (filters.dueTo && (!task.dueDate || task.dueDate > filters.dueTo)) {
    return false
  }
  if (filters.statuses.length > 0 && !filters.statuses.includes("todo")) {
    return false
  }

  if (filters.unassigned) {
    if (assignee) return false
  } else if (filters.mine) {
    const me = creator
    const onMine = me != null && (assignee === me || creator === me)
    if (me && !onMine) return false
  } else if (filters.assigneeEmail.trim()) {
    if (assignee !== filters.assigneeEmail.trim().toLowerCase()) return false
  }

  return true
}

async function loadLiveTemplateSeeds(
  templateId: number
): Promise<Array<{ id: number; title: string }>> {
  const found: Array<{ id: number; title: string }> = []
  let page = 1
  for (let guard = 0; guard < 30; guard += 1) {
    const res = await fetch(
      `/api/codex/tasks?per_page=100&page=${page}`,
      { cache: "no-store" }
    )
    if (!res.ok) break
    const data = (await res.json()) as CodexPagedResponse<CodexTask>
    for (const task of data.items ?? []) {
      if (
        Number(task.template_id) === templateId &&
        Boolean(task.recurring_rule) &&
        task.status !== "done" &&
        !task.deleted_at
      ) {
        found.push({ id: Number(task.id), title: task.title })
      }
    }
    if (!data.nextPage) break
    page = data.nextPage
  }
  return found
}

export function TasksPageClient({
  overlayTaskId = null,
  initialSearchParams,
}: {
  overlayTaskId?: number | null
  /** Request query from `/tasks/[id]`, so the list behind the panel matches `/tasks`. */
  initialSearchParams?: Record<string, string | string[] | undefined>
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const seededSearchParams = useMemo(() => {
    if (searchParams.toString().length > 0) return searchParams
    if (initialSearchParams) return recordToSearchParams(initialSearchParams)
    return searchParams
  }, [searchParams, initialSearchParams])
  const { toast } = useToast()
  const { user, isLoading: sessionLoading } = useUser()
  const urlFilters = parseTasksFilterParams(seededSearchParams)
  const [mainTab, setMainTab] = useState<
    "tasks" | "team" | "templates" | "inbox"
  >("tasks")

  type InboxProposalRow = {
    id: number
    proposed_title: string
    proposed_description: string | null
    proposed_assignee_email: string | null
    proposed_mba_number: string | null
    proposed_category: string | null
    proposed_due_date: string | null
    client_id: number | null
    source_note_id: number | null
    possible_duplicate: boolean
    status: string
    created_at: string
  }
  type InboxGroup = {
    note_id: number
    meeting_title: string | null
    meeting_date: string | null
    transcript_url: string | null
    mba_number: string | null
    client_id: number | null
    proposals: InboxProposalRow[]
  }
  const [inboxGroups, setInboxGroups] = useState<InboxGroup[]>([])
  const [inboxPendingCount, setInboxPendingCount] = useState(0)
  const [inboxStaleCount, setInboxStaleCount] = useState(0)
  const [confirmExpireStale, setConfirmExpireStale] = useState(false)
  const [inboxExpiring, setInboxExpiring] = useState(false)
  const [inboxPage, setInboxPage] = useState(1)
  const [inboxPageTotal, setInboxPageTotal] = useState(1)
  const [inboxNextPage, setInboxNextPage] = useState<number | null>(null)
  const [inboxLoading, setInboxLoading] = useState(false)
  const [inboxError, setInboxError] = useState<string | null>(null)
  const [inboxBusyId, setInboxBusyId] = useState<number | null>(null)
  const [dismissAllTarget, setDismissAllTarget] = useState<{
    noteId: number
    label: string
    count: number
  } | null>(null)
  const [editProposal, setEditProposal] = useState<InboxProposalRow | null>(
    null
  )
  const [editTitle, setEditTitle] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editAssignee, setEditAssignee] = useState("")
  const [editMba, setEditMba] = useState("")
  const [editClientId, setEditClientId] = useState("")
  const [editDue, setEditDue] = useState("")
  const [editCategory, setEditCategory] = useState("")
  const [editMbaPlans, setEditMbaPlans] = useState<MbaPlanRow[]>([])
  /** List and board share the same filter state — switching must not reset it. */
  const [tasksLayout, setTasksLayout] = useState<"list" | "board">(
    urlFilters.view
  )
  const tasksLayoutRef = useRef(tasksLayout)
  tasksLayoutRef.current = tasksLayout
  const appliedStoredLayout = useRef(false)

  useEffect(() => {
    if (appliedStoredLayout.current) return
    appliedStoredLayout.current = true
    if (parseTasksLayoutValue(seededSearchParams.get("view"))) return
    const stored = readStoredTasksLayout()
    if (stored) setTasksLayout(stored)
  }, [seededSearchParams])

  const [tasks, setTasks] = useState<CodexTask[]>([])
  const [itemsTotal, setItemsTotal] = useState(0)
  const [nextPage, setNextPage] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)
  const [boardColumns, setBoardColumns] = useState<BoardColumns>(emptyBoardColumns)
  const [statusCounts, setStatusCounts] = useState(emptyStatusCounts)
  const [boardPages, setBoardPages] = useState<Record<TaskStatus, number>>({
    backlog: 1,
    todo: 1,
    in_progress: 1,
    waiting: 1,
    done: 1,
  })
  const [boardLoading, setBoardLoading] = useState(true)
  const [boardError, setBoardError] = useState<string | null>(null)
  const [loadingMoreStatus, setLoadingMoreStatus] = useState<TaskStatus | null>(null)
  const [boardReload, setBoardReload] = useState(0)
  const boardGen = useRef(0)
  const tasksFetchAbort = useRef<AbortController | null>(null)
  const boardFetchAbort = useRef<AbortController | null>(null)
  const sessionLoadingRef = useRef(sessionLoading)
  sessionLoadingRef.current = sessionLoading

  const [clientId, setClientId] = useState<string>(urlFilters.clientId ?? "")
  const [mbaFilter, setMbaFilter] = useState<string>(urlFilters.mbaNumber ?? "")
  const [statusFilter, setStatusFilter] = useState<string[]>(
    urlFilters.statuses ?? []
  )
  const [categoryFilter, setCategoryFilter] = useState<string>(
    urlFilters.category ?? ""
  )
  const [assigneeEmail, setAssigneeEmail] = useState(
    urlFilters.assigneeEmail ?? ""
  )
  const [mine, setMine] = useState(urlFilters.myWeek ? true : urlFilters.mine)
  const [myWeek, setMyWeek] = useState(urlFilters.myWeek)
  const [search, setSearch] = useState(urlFilters.search ?? "")
  const [taskQuery, setTaskQuery] = useState(() =>
    (urlFilters.search ?? "").trim().slice(0, 100)
  )
  const taskQueryRef = useRef(taskQuery)
  const [sort, setSort] = useState<TaskSortKey>(urlFilters.sort)
  const [priorities, setPriorities] = useState<string[]>(urlFilters.priorities)
  const [overdue, setOverdue] = useState(urlFilters.overdue)
  const [unassigned, setUnassigned] = useState(urlFilters.unassigned)
  const [noClient, setNoClient] = useState(urlFilters.noClient)
  const [createdByEmail, setCreatedByEmail] = useState(
    urlFilters.createdByEmail ?? ""
  )
  const [dueFrom, setDueFrom] = useState(urlFilters.dueFrom ?? "")
  const [dueTo, setDueTo] = useState(urlFilters.dueTo ?? "")
  const [sources, setSources] = useState<string[]>(urlFilters.sources)
  const [mbaPlans, setMbaPlans] = useState<MbaPlanRow[]>([])

  const [clients, setClients] = useState<ClientOption[]>([])
  const [clientsError, setClientsError] = useState<string | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [teamLoading, setTeamLoading] = useState(true)
  const [teamError, setTeamError] = useState<string | null>(null)
  const [teamWeek, setTeamWeek] = useState<TeamWeekTimeSummary | null>(null)
  const [teamHoursSortDesc, setTeamHoursSortDesc] = useState(true)
  const [neverLoggedIn, setNeverLoggedIn] = useState<string[]>([])
  const [aliasCollisions, setAliasCollisions] = useState<
    Array<{ alias: string; holders: Array<{ email: string; name: string }> }>
  >([])
  const [autoBusyId, setAutoBusyId] = useState<number | string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<CodexTask | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  const [teamDialogOpen, setTeamDialogOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null)

  const [templates, setTemplates] = useState<TaskTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [templatesError, setTemplatesError] = useState<string | null>(null)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(
    null
  )
  const [deleteTemplateTarget, setDeleteTemplateTarget] =
    useState<TaskTemplate | null>(null)
  const [deletingTemplate, setDeletingTemplate] = useState(false)
  const [templateSeeds, setTemplateSeeds] = useState<
    Array<{ id: number; title: string }>
  >([])
  const [templateSeedsLoading, setTemplateSeedsLoading] = useState(false)

  useEffect(() => {
    if (!deleteTemplateTarget) {
      setTemplateSeeds([])
      setTemplateSeedsLoading(false)
      return
    }
    let cancelled = false
    setTemplateSeeds([])
    setTemplateSeedsLoading(true)
    void loadLiveTemplateSeeds(deleteTemplateTarget.id).then((seeds) => {
      if (cancelled) return
      setTemplateSeeds(seeds)
      setTemplateSeedsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [deleteTemplateTarget])

  const meEmail = (user?.email ?? "").trim().toLowerCase() || null
  const meName =
    teamMembers.find((m) => m.email.toLowerCase() === meEmail)?.name ??
    (typeof user?.name === "string" ? user.name : null)

  // Slack-friendly deep links: /tasks?task=<id> → /tasks/<id>
  // Scope deep links: /tasks?mba=<mba> and /tasks?client=<id> (combined with other filters).
  useEffect(() => {
    const raw = searchParams.get("task")
    if (raw) {
      const id = Number(raw)
      if (Number.isFinite(id) && id >= 1) {
        router.replace(taskDetailHref(id, searchParams), { scroll: false })
      }
    }
  }, [searchParams, router])

  const skipFilterWrite = useRef(true)
  useEffect(() => {
    if (skipFilterWrite.current) {
      skipFilterWrite.current = false
      return
    }
    const qs = serializeTasksFilterParams({
      mbaNumber: mbaFilter || null,
      clientId: clientId || null,
      search,
      assigneeEmail,
      category: categoryFilter || null,
      statuses: statusFilter,
      mine,
      myWeek,
      view: tasksLayout,
      sort,
      priorities,
      overdue,
      unassigned,
      noClient,
      createdByEmail,
      dueFrom,
      dueTo,
      sources,
    })
    const path = pathname || "/tasks"
    const next = qs ? `${path}?${qs}` : path
    router.replace(next, { scroll: false })
  }, [
    mbaFilter,
    clientId,
    search,
    assigneeEmail,
    categoryFilter,
    statusFilter,
    mine,
    myWeek,
    tasksLayout,
    sort,
    priorities,
    overdue,
    unassigned,
    noClient,
    createdByEmail,
    dueFrom,
    dueTo,
    sources,
    pathname,
    router,
  ])

  useEffect(() => {
    const id = Number(clientId)
    if (!clientId || noClient || !Number.isFinite(id) || id < 1) {
      setMbaPlans([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(
          `/api/codex/client-mbas?client_id=${encodeURIComponent(String(id))}`,
          { cache: "no-store" }
        )
        if (!res.ok || cancelled) return
        const body = (await res.json()) as {
          mba_numbers?: unknown
          campaigns?: Array<{
            mba_number?: unknown
            campaign_name?: unknown
          }>
        }
        if (cancelled) return
        if (Array.isArray(body.campaigns) && body.campaigns.length > 0) {
          setMbaPlans(
            body.campaigns.flatMap((c) => {
              if (typeof c.mba_number !== "string") return []
              return [
                {
                  mba_number: c.mba_number,
                  campaign_name:
                    typeof c.campaign_name === "string" ? c.campaign_name : "",
                  client_id: id,
                },
              ]
            })
          )
          return
        }
        const numbers = Array.isArray(body.mba_numbers)
          ? body.mba_numbers.filter((n): n is string => typeof n === "string")
          : []
        setMbaPlans(numbers.map((mba_number) => ({ mba_number, client_id: id })))
      } catch {
        if (!cancelled) setMbaPlans([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [clientId, noClient])

  useEffect(() => {
    if (!editProposal) {
      setEditMbaPlans([])
      return
    }
    const id = Number(editClientId)
    if (!editClientId || !Number.isFinite(id) || id < 1) {
      setEditMbaPlans([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(
          `/api/codex/client-mbas?client_id=${encodeURIComponent(String(id))}`,
          { cache: "no-store" }
        )
        if (!res.ok || cancelled) return
        const body = (await res.json()) as {
          mba_numbers?: unknown
          campaigns?: Array<{
            mba_number?: unknown
            campaign_name?: unknown
          }>
        }
        if (cancelled) return
        if (Array.isArray(body.campaigns) && body.campaigns.length > 0) {
          setEditMbaPlans(
            body.campaigns.flatMap((c) => {
              if (typeof c.mba_number !== "string") return []
              return [
                {
                  mba_number: c.mba_number,
                  campaign_name:
                    typeof c.campaign_name === "string" ? c.campaign_name : "",
                  client_id: id,
                },
              ]
            })
          )
          return
        }
        const numbers = Array.isArray(body.mba_numbers)
          ? body.mba_numbers.filter((n): n is string => typeof n === "string")
          : []
        setEditMbaPlans(
          numbers.map((mba_number) => ({ mba_number, client_id: id }))
        )
      } catch {
        if (!cancelled) setEditMbaPlans([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [editProposal, editClientId])

  const clientNameById = useMemo(() => {
    const map = new Map<number, string>()
    for (const c of clients) {
      map.set(c.id, getClientDisplayName(c) || String(c.id))
    }
    return map
  }, [clients])

  const editClientOptions = useMemo(() => {
    const options = clients.map((c) => ({
      value: String(c.id),
      label: getClientDisplayName(c) || String(c.id),
      keywords: `${getClientDisplayName(c) ?? ""} ${c.id}`,
    }))
    if (
      editClientId &&
      !options.some((o) => o.value === editClientId)
    ) {
      options.push({
        value: editClientId,
        label: `Client ${editClientId}`,
        keywords: editClientId,
      })
    }
    return options
  }, [clients, editClientId])

  const editAssigneeOptions = useMemo(() => {
    const options = [
      { value: EDIT_ASSIGNEE_NONE, label: "Unassigned" },
      ...teamMembers
        .filter((m) => m.active)
        .map((m) => ({
          value: m.email,
          label: m.name ? `${m.name} (${m.email})` : m.email,
          keywords: `${m.name} ${m.email}`,
        })),
    ]
    const email = editAssignee.trim().toLowerCase()
    if (
      email &&
      !options.some((o) => o.value.toLowerCase() === email)
    ) {
      options.push({
        value: editAssignee.trim(),
        label: editAssignee.trim(),
        keywords: email,
      })
    }
    return options
  }, [teamMembers, editAssignee])

  const fetchClients = useCallback(async () => {
    const result = await fetchClientsList<ClientOption>()
    const ui = applyClientsFetchResult(result)
    setClients(ui.clients)
    setClientsError(ui.clientsError)
  }, [])

  useEffect(() => {
    void fetchClients()
  }, [fetchClients])

  const fetchTeamWeek = useCallback(async () => {
    try {
      const res = await fetch("/api/codex/time/team-week")
      if (!res.ok) {
        setTeamWeek(null)
        return
      }
      const data = (await res.json()) as TeamWeekTimeSummary
      setTeamWeek(data)
    } catch {
      setTeamWeek(null)
    }
  }, [])

  const fetchTeam = useCallback(async () => {
    setTeamLoading(true)
    setTeamError(null)
    try {
      const res = await fetch("/api/codex/team?active=0&per_page=100")
      if (res.status === 403) {
        setAccessDenied(true)
        setTeamMembers([])
        setNeverLoggedIn([])
        setAliasCollisions([])
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(
          (body && typeof body === "object" && "message" in body
            ? String((body as { message?: string }).message)
            : null) || "Failed to fetch team"
        )
      }
      const data = (await res.json()) as CodexPagedResponse<TeamMember> & {
        never_logged_in?: string[]
        alias_collisions?: Array<{
          alias: string
          holders: Array<{ email: string; name: string }>
        }>
      }
      setTeamMembers(Array.isArray(data.items) ? data.items : [])
      setNeverLoggedIn(
        Array.isArray(data.never_logged_in) ? data.never_logged_in : []
      )
      setAliasCollisions(
        Array.isArray(data.alias_collisions) ? data.alias_collisions : []
      )
    } catch (error) {
      console.error("Error fetching team:", error)
      setTeamError("Something went wrong while loading the team.")
      setTeamMembers([])
      setNeverLoggedIn([])
      setAliasCollisions([])
    } finally {
      setTeamLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchTeam()
  }, [fetchTeam])

  useEffect(() => {
    if (mainTab !== "team") return
    void fetchTeamWeek()
  }, [mainTab, fetchTeamWeek])

  const fetchInbox = useCallback(async (pageNum = inboxPage) => {
    setInboxLoading(true)
    setInboxError(null)
    try {
      const params = new URLSearchParams()
      params.set("page", String(pageNum))
      params.set("per_page", String(INBOX_PER_PAGE))
      const res = await fetch(`/api/codex/proposals?${params.toString()}`)
      if (res.status === 403) {
        setAccessDenied(true)
        setInboxGroups([])
        setInboxPendingCount(0)
        setInboxStaleCount(0)
        return
      }
      if (!res.ok) {
        setInboxError("Something went wrong while loading the inbox.")
        setInboxGroups([])
        setInboxPendingCount(0)
        setInboxStaleCount(0)
        return
      }
      const data = (await res.json()) as {
        groups?: InboxGroup[]
        pendingCount?: number
        pageTotal?: number
        nextPage?: number | null
        curPage?: number
        staleCount?: number
      }
      setInboxGroups(Array.isArray(data.groups) ? data.groups : [])
      setInboxPendingCount(
        typeof data.pendingCount === "number" ? data.pendingCount : 0
      )
      setInboxStaleCount(
        typeof data.staleCount === "number" ? data.staleCount : 0
      )
      setInboxPageTotal(
        typeof data.pageTotal === "number" ? data.pageTotal : 1
      )
      setInboxNextPage(
        typeof data.nextPage === "number" ? data.nextPage : data.nextPage ?? null
      )
      if (typeof data.curPage === "number") setInboxPage(data.curPage)
    } catch (error) {
      console.error("Error fetching proposals inbox:", error)
      setInboxError("Something went wrong while loading the inbox.")
      setInboxGroups([])
      setInboxPendingCount(0)
      setInboxStaleCount(0)
    } finally {
      setInboxLoading(false)
    }
  }, [inboxPage])

  useEffect(() => {
    if (mainTab !== "inbox") return
    void fetchInbox()
  }, [mainTab, fetchInbox])

  const refreshInboxBadge = useCallback(async () => {
    try {
      const res = await fetch("/api/codex/proposals?page=1&per_page=1")
      if (res.status === 403) {
        setAccessDenied(true)
        setInboxPendingCount(0)
        return
      }
      if (!res.ok) return
      const data = (await res.json()) as {
        pendingCount?: number
        staleCount?: number
      }
      if (typeof data.pendingCount === "number") {
        setInboxPendingCount(data.pendingCount)
      }
      if (typeof data.staleCount === "number") {
        setInboxStaleCount(data.staleCount)
      }
    } catch (error) {
      if (isAbortError(error)) return
      console.error("Error fetching inbox count:", error)
    }
  }, [])

  useEffect(() => {
    if (sessionLoading) return
    void refreshInboxBadge()
  }, [sessionLoading, refreshInboxBadge])

  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true)
    setTemplatesError(null)
    try {
      const res = await fetch(
        "/api/codex/templates?include_items=1&per_page=100"
      )
      if (!res.ok) {
        setTemplatesError("Something went wrong while loading templates.")
        setTemplates([])
        return
      }
      const data = (await res.json()) as CodexPagedResponse<TaskTemplate>
      setTemplates(Array.isArray(data.items) ? data.items : [])
    } catch (error) {
      console.error("Error fetching templates:", error)
      setTemplatesError("Something went wrong while loading templates.")
      setTemplates([])
    } finally {
      setTemplatesLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchTemplates()
  }, [fetchTemplates])

  const fetchTasks = useCallback(async () => {
    if (sessionLoadingRef.current) return
    if (tasksLayoutRef.current === "board") {
      setBoardReload((n) => n + 1)
      return
    }
    tasksFetchAbort.current?.abort()
    const controller = new AbortController()
    tasksFetchAbort.current = controller
    setIsLoading(true)
    setLoadError(null)
    try {
      const params = buildTasksFetchParams({
        page,
        perPage: PER_PAGE,
        sort,
        clientId,
        mbaNumber: mbaFilter,
        category: categoryFilter,
        q: taskQuery,
        assigneeEmail,
        statuses: statusFilter,
        mine,
        myWeek,
        priorities,
        overdue,
        unassigned,
        noClient,
        createdByEmail,
        dueFrom,
        dueTo,
        sources,
      })

      const response = await fetch(`/api/codex/tasks?${params.toString()}`, {
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      if (response.status === 403) {
        setAccessDenied(true)
        setTasks([])
        setItemsTotal(0)
        setNextPage(null)
        return
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(
          (body && typeof body === "object" && "message" in body
            ? String((body as { message?: string }).message)
            : null) || "Failed to fetch tasks"
        )
      }
      const data = (await response.json()) as CodexPagedResponse<CodexTask>
      if (controller.signal.aborted || tasksFetchAbort.current !== controller) return
      setTasks(Array.isArray(data.items) ? data.items : [])
      setItemsTotal(typeof data.itemsTotal === "number" ? data.itemsTotal : 0)
      setNextPage(
        typeof data.nextPage === "number"
          ? data.nextPage
          : data.nextPage == null
            ? null
            : Number(data.nextPage) || null
      )
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) return
      console.error("Error fetching tasks:", error)
      const isNetwork =
        error instanceof TypeError ||
        (error instanceof Error && error.message === "Failed to fetch")
      setLoadError(
        isNetwork
          ? "We couldn't reach the server. Check your connection and try again."
          : "Something went wrong while loading tasks."
      )
      setTasks([])
      setItemsTotal(0)
      setNextPage(null)
    } finally {
      if (!controller.signal.aborted) setIsLoading(false)
    }
  }, [page, sort, clientId, mbaFilter, statusFilter, categoryFilter, mine, assigneeEmail, myWeek, taskQuery, priorities, overdue, unassigned, noClient, createdByEmail, dueFrom, dueTo, sources])

  useEffect(() => {
    if (sessionLoading) return
    if (tasksLayout === "board") return
    void fetchTasks()
    return () => {
      tasksFetchAbort.current?.abort()
    }
  }, [fetchTasks, tasksLayout, sessionLoading])

  const boardFilterKey = useMemo(() => {
    const params = buildTasksFetchParams({
      page: 1,
      perPage: BOARD_PER_PAGE,
      sort,
      clientId,
      mbaNumber: mbaFilter,
      category: categoryFilter,
      q: taskQuery,
      assigneeEmail,
      statuses: myWeek ? [...MY_WEEK_STATUSES] : statusFilter,
      mine,
      myWeek,
      priorities,
      overdue,
      unassigned,
      noClient,
      createdByEmail,
      dueFrom,
      dueTo,
      sources,
    })
    params.delete("page")
    params.delete("per_page")
    return params.toString()
  }, [
    sort,
    clientId,
    mbaFilter,
    categoryFilter,
    taskQuery,
    assigneeEmail,
    statusFilter,
    mine,
    myWeek,
    priorities,
    overdue,
    unassigned,
    noClient,
    createdByEmail,
    dueFrom,
    dueTo,
    sources,
  ])

  const boardStatuses = useMemo(
    () => visibleBoardStatuses(myWeek ? MY_WEEK_STATUSES : statusFilter),
    [myWeek, statusFilter]
  )

  useEffect(() => {
    if (sessionLoading) return
    if (tasksLayout !== "board") {
      boardFetchAbort.current?.abort()
      return
    }
    const gen = ++boardGen.current
    const statuses = boardStatuses
    boardFetchAbort.current?.abort()
    const controller = new AbortController()
    boardFetchAbort.current = controller
    setBoardLoading(true)
    setBoardError(null)
    setLoadingMoreStatus(null)

    void (async () => {
      try {
        const [countsRes, columns] = await Promise.all([
          fetch(`/api/codex/tasks/status-counts?${boardFilterKey}`, {
            signal: controller.signal,
          }),
          Promise.all(
            statuses.map(async (status) => {
              const params = new URLSearchParams(boardFilterKey)
              params.set("status", status)
              params.set("page", "1")
              params.set("per_page", String(BOARD_PER_PAGE))
              const response = await fetch(`/api/codex/tasks?${params.toString()}`, {
                signal: controller.signal,
              })
              if (response.status === 403) {
                const denied = new Error("forbidden")
                denied.name = "Forbidden"
                throw denied
              }
              if (!response.ok) {
                throw new Error("Failed to fetch tasks")
              }
              const data = (await response.json()) as CodexPagedResponse<CodexTask>
              return [
                status,
                Array.isArray(data.items) ? data.items : [],
              ] as const
            })
          ),
        ])
        if (gen !== boardGen.current) return
        if (countsRes.status === 403) {
          setAccessDenied(true)
          setBoardColumns(emptyBoardColumns())
          setStatusCounts(emptyStatusCounts())
          return
        }
        if (!countsRes.ok) {
          throw new Error("Failed to fetch task counts")
        }
        const countsBody: unknown = await countsRes.json()
        if (controller.signal.aborted || gen !== boardGen.current) return
        const nextColumns = emptyBoardColumns()
        for (const [status, items] of columns) {
          nextColumns[status] = items
        }
        setBoardColumns(nextColumns)
        setStatusCounts(readStatusCounts(countsBody))
        setBoardPages({
          backlog: 1,
          todo: 1,
          in_progress: 1,
          waiting: 1,
          done: 1,
        })
      } catch (error) {
        if (isAbortError(error) || controller.signal.aborted) return
        if (gen !== boardGen.current) return
        if (error instanceof Error && error.name === "Forbidden") {
          setAccessDenied(true)
          setBoardColumns(emptyBoardColumns())
          setStatusCounts(emptyStatusCounts())
          return
        }
        console.error("Error fetching task board:", error)
        const isNetwork =
          error instanceof TypeError ||
          (error instanceof Error && error.message === "Failed to fetch")
        setBoardError(
          isNetwork
            ? "We couldn't reach the server. Check your connection and try again."
            : "Something went wrong while loading tasks."
        )
        setBoardColumns(emptyBoardColumns())
        setStatusCounts(emptyStatusCounts())
      } finally {
        if (!controller.signal.aborted && gen === boardGen.current) {
          setBoardLoading(false)
        }
      }
    })()
    return () => {
      controller.abort()
    }
  }, [tasksLayout, boardFilterKey, boardStatuses, boardReload, sessionLoading])

  const loadMoreBoard = useCallback(
    async (status: TaskStatus) => {
      const gen = boardGen.current
      const nextPage = boardPages[status] + 1
      const signal = boardFetchAbort.current?.signal
      setLoadingMoreStatus(status)
      try {
        const params = new URLSearchParams(boardFilterKey)
        params.set("status", status)
        params.set("page", String(nextPage))
        params.set("per_page", String(BOARD_PER_PAGE))
        const response = await fetch(`/api/codex/tasks?${params.toString()}`, {
          signal,
        })
        if (gen !== boardGen.current) return
        if (!response.ok) {
          throw new Error("Failed to fetch tasks")
        }
        const data = (await response.json()) as CodexPagedResponse<CodexTask>
        if (signal?.aborted || gen !== boardGen.current) return
        const items = Array.isArray(data.items) ? data.items : []
        setBoardColumns((prev) => ({
          ...prev,
          [status]: mergeBoardTasks(prev[status], items),
        }))
        setBoardPages((prev) => ({ ...prev, [status]: nextPage }))
      } catch (error) {
        if (isAbortError(error) || signal?.aborted) return
        if (gen !== boardGen.current) return
        console.error("Error loading more board tasks:", error)
        toast({
          title: "Could not load more tasks",
          description:
            error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        })
      } finally {
        setLoadingMoreStatus((current) => (current === status ? null : current))
      }
    },
    [boardFilterKey, boardPages, toast]
  )

  const acceptInboxProposal = useCallback(
    async (
      proposalId: number,
      edits: Record<string, string | number | null> | null = null
    ) => {
      setInboxBusyId(proposalId)
      try {
        const res = await fetch(`/api/codex/proposals/${proposalId}/accept`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: edits ? JSON.stringify(edits) : undefined,
        })
        const body = await res.json().catch(() => null)
        if (!res.ok) {
          toast({
            variant: "destructive",
            title: "Accept failed",
            description:
              body && typeof body === "object" && "error" in body
                ? String((body as { error: string }).error)
                : "Could not create task from proposal.",
          })
          return
        }
        toast({
          title: "Task created",
          description:
            body && typeof body === "object" && "task_id" in body
              ? `Task #${String((body as { task_id: number }).task_id)}`
              : undefined,
        })
        setEditProposal(null)
        await fetchInbox()
        void refreshInboxBadge()
        void fetchTasks()
      } catch (error) {
        console.error(error)
        toast({
          variant: "destructive",
          title: "Accept failed",
          description: "Could not create task from proposal.",
        })
      } finally {
        setInboxBusyId(null)
      }
    },
    [fetchInbox, fetchTasks, refreshInboxBadge, toast]
  )

  const dismissInboxProposal = useCallback(
    async (proposalId: number) => {
      setInboxBusyId(proposalId)
      try {
        const res = await fetch(`/api/codex/proposals/${proposalId}/dismiss`, {
          method: "POST",
        })
        if (!res.ok) {
          toast({
            variant: "destructive",
            title: "Dismiss failed",
            description: "Could not dismiss proposal.",
          })
          return
        }
        toast({ title: "Proposal dismissed" })
        await fetchInbox()
        void refreshInboxBadge()
      } catch (error) {
        console.error(error)
        toast({
          variant: "destructive",
          title: "Dismiss failed",
          description: "Could not dismiss proposal.",
        })
      } finally {
        setInboxBusyId(null)
      }
    },
    [fetchInbox, refreshInboxBadge, toast]
  )

  const dismissAllForMeeting = useCallback(
    async (noteId: number, label: string, count: number) => {
      setInboxBusyId(-noteId)
      try {
        const res = await fetch("/api/codex/proposals/dismiss-all", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note_id: noteId }),
        })
        if (!res.ok) {
          toast({
            variant: "destructive",
            title: "Dismiss all failed",
            description: "Could not dismiss proposals.",
          })
          return
        }
        const body = (await res.json().catch(() => null)) as {
          dismissed?: number
        } | null
        const n =
          body && typeof body.dismissed === "number" ? body.dismissed : count
        toast({ title: `Dismissed ${n} in ${label}` })
        setInboxPendingCount((c) => Math.max(0, c - n))
        await fetchInbox()
        void refreshInboxBadge()
      } catch (error) {
        console.error(error)
        toast({
          variant: "destructive",
          title: "Dismiss all failed",
          description: "Could not dismiss proposals.",
        })
      } finally {
        setInboxBusyId(null)
        setDismissAllTarget(null)
      }
    },
    [fetchInbox, refreshInboxBadge, toast]
  )

  const batchAcceptMeeting = useCallback(
    async (noteId: number) => {
      setInboxBusyId(-noteId)
      try {
        const res = await fetch("/api/codex/proposals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note_id: noteId }),
        })
        const body = await res.json().catch(() => null)
        if (!res.ok) {
          toast({
            variant: "destructive",
            title: "Batch accept failed",
            description: "Could not accept proposals for this meeting.",
          })
          return
        }
        const accepted =
          body && typeof body === "object" && "accepted" in body
            ? Number((body as { accepted: number }).accepted)
            : 0
        const failed =
          body && typeof body === "object" && "failed" in body
            ? (body as { failed: unknown[] }).failed.length
            : 0
        toast({
          title: "Batch accept finished",
          description: `${accepted} accepted${failed ? `, ${failed} skipped` : ""}`,
        })
        await fetchInbox()
        void refreshInboxBadge()
        void fetchTasks()
      } catch (error) {
        console.error(error)
        toast({
          variant: "destructive",
          title: "Batch accept failed",
          description: "Could not accept proposals for this meeting.",
        })
      } finally {
        setInboxBusyId(null)
      }
    },
    [fetchInbox, fetchTasks, refreshInboxBadge, toast]
  )

  const expireStaleInbox = useCallback(async () => {
    setInboxExpiring(true)
    try {
      const res = await fetch("/api/codex/proposals/expire-stale", {
        method: "POST",
      })
      const body = (await res.json().catch(() => null)) as {
        expired?: number
        message?: string
      } | null
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Could not expire proposals",
          description: body?.message || "Please try again.",
        })
        return
      }
      const expired = typeof body?.expired === "number" ? body.expired : 0
      toast({ title: `Expired ${expired} proposals` })
      setConfirmExpireStale(false)
      await fetchInbox()
      void refreshInboxBadge()
    } catch (error) {
      console.error(error)
      toast({
        variant: "destructive",
        title: "Could not expire proposals",
        description: error instanceof Error ? error.message : "Please try again.",
      })
    } finally {
      setInboxExpiring(false)
    }
  }, [fetchInbox, refreshInboxBadge, toast])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = search.trim().slice(0, 100)
      if (taskQueryRef.current === next) return
      taskQueryRef.current = next
      setTaskQuery(next)
      setPage(1)
    }, 250)
    return () => window.clearTimeout(handle)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [clientId, mbaFilter, statusFilter, categoryFilter, mine, assigneeEmail, sort, myWeek, priorities, overdue, unassigned, noClient, createdByEmail, dueFrom, dueTo, sources])

  useEffect(() => {
    setSelectedIds(new Set())
  }, [page, clientId, mbaFilter, statusFilter, categoryFilter, mine, assigneeEmail, myWeek, search, priorities, overdue, unassigned, noClient, createdByEmail, dueFrom, dueTo, sources])

  const filterState = (): TasksFilterState => ({
    clientId,
    mbaNumber: mbaFilter,
    search,
    assigneeEmail,
    category: categoryFilter,
    statuses: statusFilter,
    mine,
    myWeek,
    priorities,
    overdue,
    unassigned,
    noClient,
    createdByEmail,
    dueFrom,
    dueTo,
    sources,
  })

  const commitFilters = (next: TasksFilterState) => {
    setClientId(next.clientId)
    setMbaFilter(next.mbaNumber)
    setSearch(next.search)
    setAssigneeEmail(next.assigneeEmail)
    setCategoryFilter(next.category)
    setStatusFilter(next.statuses)
    setMine(next.mine)
    setMyWeek(next.myWeek)
    setPriorities(next.priorities ?? [])
    setOverdue(next.overdue ?? false)
    setUnassigned(next.unassigned ?? false)
    setNoClient(next.noClient ?? false)
    setCreatedByEmail(next.createdByEmail ?? "")
    setDueFrom(next.dueFrom ?? "")
    setDueTo(next.dueTo ?? "")
    setSources(next.sources ?? [])
  }

  const exitMyWeek = () => {
    commitFilters(exitMyWeekState(filterState()))
  }

  const clearTaskFilters = useCallback(() => {
    setClientId("")
    setMbaFilter("")
    setStatusFilter([])
    setCategoryFilter("")
    setAssigneeEmail("")
    setSearch("")
    setMine(true)
    setMyWeek(false)
    setPriorities([])
    setOverdue(false)
    setUnassigned(false)
    setNoClient(false)
    setCreatedByEmail("")
    setDueFrom("")
    setDueTo("")
    setSources([])
    setPage(1)
  }, [])

  const applyMyWeek = (on: boolean) => {
    if (!on) {
      exitMyWeek()
      return
    }
    setMyWeek(true)
    setUnassigned(false)
    setOverdue(false)
    setDueFrom("")
    setDueTo("")
    setPage(1)
  }

  const tasksFiltersActive = Boolean(
    clientId ||
      mbaFilter ||
      statusFilter.length > 0 ||
      categoryFilter ||
      assigneeEmail.trim() ||
      search.trim() ||
      myWeek ||
      !mine ||
      priorities.length > 0 ||
      overdue ||
      unassigned ||
      noClient ||
      createdByEmail.trim() ||
      dueFrom ||
      dueTo ||
      sources.length > 0
  )

  const tasksViewState = useMemo(() => {
    if (tasksLayout === "board") {
      const visible = boardStatuses.flatMap((status) => boardColumns[status])
      return resolveListViewState({
        loading: boardLoading,
        error: clientsError ?? boardError,
        items: visible,
        visible,
        filtersActive: tasksFiltersActive,
        clear: clearTaskFilters,
        retry: () => {
          if (clientsError) {
            setClientsError(null)
            void fetchClients()
            return
          }
          setBoardError(null)
          setBoardReload((n) => n + 1)
        },
      })
    }
    return resolveListViewState({
      loading: isLoading,
      error: clientsError ?? loadError,
      items: tasks,
      visible: tasks,
      filtersActive: tasksFiltersActive,
      clear: clearTaskFilters,
      retry: () => {
        if (clientsError) {
          setClientsError(null)
          void fetchClients()
          return
        }
        setLoadError(null)
        void fetchTasks()
      },
    })
  }, [
    tasksLayout,
    boardLoading,
    boardError,
    boardColumns,
    boardStatuses,
    isLoading,
    clientsError,
    loadError,
    tasks,
    tasksFiltersActive,
    clearTaskFilters,
    fetchClients,
    fetchTasks,
  ])

  const teamViewState = useMemo(
    () =>
      resolveListViewState({
        loading: teamLoading,
        error: teamError,
        items: teamMembers,
        visible: teamMembers,
        filtersActive: false,
        clear: () => undefined,
        retry: () => {
          setTeamError(null)
          void fetchTeam()
        },
      }),
    [teamLoading, teamError, teamMembers, fetchTeam]
  )

  const templatesViewState = useMemo(
    () =>
      resolveListViewState({
        loading: templatesLoading,
        error: templatesError,
        items: templates,
        visible: templates,
        filtersActive: false,
        clear: () => undefined,
        retry: () => {
          setTemplatesError(null)
          void fetchTemplates()
        },
      }),
    [templatesLoading, templatesError, templates, fetchTemplates]
  )

  const inboxViewState = useMemo(
    () =>
      resolveListViewState({
        loading: inboxLoading,
        error: inboxError,
        items: inboxGroups,
        visible: inboxGroups,
        filtersActive: false,
        clear: () => undefined,
        retry: () => {
          setInboxError(null)
          void fetchInbox()
        },
      }),
    [inboxLoading, inboxError, inboxGroups, fetchInbox]
  )

  const dismissAutoTask = async (task: CodexTask) => {
    setAutoBusyId(task.id)
    try {
      const res = await fetch(
        `/api/codex/tasks/${encodeURIComponent(String(task.id))}/dismiss-auto`,
        { method: "POST" }
      )
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(
          (body && typeof body === "object" && "message" in body
            ? String((body as { message?: string }).message)
            : null) || "Failed to dismiss"
        )
      }
      setTasks((prev) => prev.filter((t) => String(t.id) !== String(task.id)))
      toast({ title: "Auto-created task dismissed" })
    } catch (error) {
      toast({
        title: "Could not dismiss",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setAutoBusyId(null)
    }
  }

  const requestStatusPatch = async (
    task: CodexTask,
    status: TaskStatus
  ): Promise<CodexTask> => {
    const res = await fetch(
      `/api/codex/tasks/${encodeURIComponent(String(task.id))}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }
    )
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(
        (body && typeof body === "object" && "message" in body
          ? String((body as { message?: string }).message)
          : null) || "Failed to update status"
      )
    }
    return (await res.json()) as CodexTask
  }

  const patchStatus = async (task: CodexTask, status: TaskStatus) => {
    const previousStatus = task.status
    if (previousStatus === status) return

    setTasks((prev) =>
      prev.map((t) =>
        String(t.id) === String(task.id) ? { ...t, status } : t
      )
    )

    try {
      const next = await requestStatusPatch(task, status)
      setTasks((prev) =>
        prev.map((t) => {
          if (String(t.id) !== String(next.id)) return t
          return {
            ...next,
            // PATCH body has no checklist counts — keep list enrichment.
            checklist_done: t.checklist_done,
            checklist_total: t.checklist_total,
          }
        })
      )
    } catch (error) {
      console.error("Inline status patch failed:", error)
      setTasks((prev) =>
        prev.map((t) =>
          String(t.id) === String(task.id)
            ? { ...t, status: previousStatus }
            : t
        )
      )
      toast({
        title: "Could not update status",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    }
  }

  const patchBoardStatus = async (task: CodexTask, status: TaskStatus) => {
    const visible = new Set(boardStatuses)
    let from: TaskStatus = isTaskStatus(task.status) ? task.status : "todo"
    let source = task
    for (const column of TASK_STATUSES) {
      const found = boardColumns[column].find(
        (item) => String(item.id) === String(task.id)
      )
      if (found) {
        from = column
        source = found
        break
      }
    }
    if (from === status) return

    const previousColumns = boardColumns
    const previousCounts = statusCounts
    setBoardColumns((prev) => {
      const next: BoardColumns = {
        ...prev,
        [from]: prev[from].filter((item) => String(item.id) !== String(task.id)),
      }
      if (visible.has(status)) {
        next[status] = [
          ...prev[status].filter((item) => String(item.id) !== String(task.id)),
          { ...source, status },
        ]
      }
      return next
    })
    setStatusCounts((prev) => ({
      ...prev,
      [from]: Math.max(0, prev[from] - 1),
      [status]: prev[status] + 1,
    }))

    try {
      const next = await requestStatusPatch(source, status)
      setBoardColumns((prev) => {
        if (!visible.has(status)) return prev
        return {
          ...prev,
          [status]: prev[status].map((item) => {
            if (String(item.id) !== String(next.id)) return item
            return {
              ...next,
              checklist_done: item.checklist_done,
              checklist_total: item.checklist_total,
            }
          }),
        }
      })
    } catch (error) {
      console.error("Inline status patch failed:", error)
      setBoardColumns(previousColumns)
      setStatusCounts(previousCounts)
      toast({
        title: "Could not update status",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    }
  }

  const quickCreateTask = async (payload: {
    title: string
    client_id: number
    status: "todo"
    priority: "low" | "normal" | "high"
    assignee_email: string | null
    assignee_name: string | null
    due_date: string | null
    estimated_minutes: number | null
    mba_number: string | null
    category: string | null
  }) => {
    const res = await fetch("/api/codex/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      const message =
        (body && typeof body === "object" && "message" in body
          ? String((body as { message?: string }).message)
          : null) || "Failed to create task"
      toast({
        title: "Could not create task",
        description: message,
        variant: "destructive",
      })
      throw new Error(message)
    }
    const visible = quickAddVisibleInFilters(
      {
        title: payload.title,
        clientId: payload.client_id,
        priority: payload.priority,
        assigneeEmail: payload.assignee_email,
        dueDate: payload.due_date,
        mbaNumber: payload.mba_number,
        category: payload.category,
        creatorEmail: meEmail,
      },
      {
        clientId,
        mbaFilter,
        categoryFilter,
        search,
        assigneeEmail,
        statuses: statusFilter,
        mine,
        myWeek,
        priorities,
        overdue,
        unassigned,
        noClient,
        createdByEmail,
        dueFrom,
        dueTo,
        sources,
      }
    )
    if (visible) {
      toast({ title: "Task created" })
    } else {
      toast({
        title: "Created. Hidden by current filters",
        action: (
          <ToastAction altText="Show" onClick={() => clearTaskFilters()}>
            Show
          </ToastAction>
        ),
      })
    }
    await fetchTasks()
  }

  const bulkApply = async (
    body: { patch?: Record<string, unknown>; action?: "delete" },
    label: string
  ) => {
    const ids = [...selectedIds]
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
    if (ids.length === 0) return
    if (ids.length > 200) {
      toast({
        title: `Could not ${label}`,
        description: "Select at most 200 tasks.",
        variant: "destructive",
      })
      return
    }
    setBulkBusy(true)
    try {
      const res = await fetch("/api/codex/tasks/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, ...body }),
      })
      const payload = (await res.json().catch(() => null)) as {
        message?: string
        tasks?: CodexTask[]
        ids?: number[]
      } | null
      if (!res.ok) {
        toast({
          title: `Could not ${label}`,
          description: payload?.message || "Please try again.",
          variant: "destructive",
        })
        await fetchTasks()
        return
      }
      if (body.action === "delete") {
        const deleted = new Set(
          (payload?.ids ?? ids).map((id) => String(id))
        )
        setTasks((prev) => prev.filter((task) => !deleted.has(String(task.id))))
        setItemsTotal((prev) => Math.max(0, prev - deleted.size))
        toast({ title: `Deleted ${deleted.size} tasks` })
      } else {
        const nextTasks = Array.isArray(payload?.tasks) ? payload.tasks : []
        const byId = new Map(nextTasks.map((task) => [String(task.id), task]))
        setTasks((prev) =>
          prev.map((task) => {
            const next = byId.get(String(task.id))
            if (!next) return task
            return {
              ...task,
              ...next,
              checklist_done: task.checklist_done,
              checklist_total: task.checklist_total,
            }
          })
        )
        toast({ title: `Updated ${ids.length} tasks` })
      }
      setSelectedIds(new Set())
    } catch (error) {
      toast({
        title: `Could not ${label}`,
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
      await fetchTasks()
    } finally {
      setBulkBusy(false)
    }
  }

  const toggleMemberActive = async (member: TeamMember, active: boolean) => {
    try {
      const res = await fetch(
        `/api/codex/team/${encodeURIComponent(String(member.id))}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active }),
        }
      )
      if (!res.ok) throw new Error("Failed to update member")
      await fetchTeam()
    } catch (error) {
      console.error("Inline active toggle failed:", error)
      toast({
        title: "Could not update member",
        description: "Please try again.",
        variant: "destructive",
      })
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(
        `/api/codex/tasks/${encodeURIComponent(String(deleteTarget.id))}`,
        { method: "DELETE" }
      )
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(
          (body && typeof body === "object" && "message" in body
            ? String((body as { message?: string }).message)
            : null) || "Failed to delete task"
        )
      }
      toast({ title: "Task deleted" })
      setDeleteTarget(null)
      await fetchTasks()
    } catch (error) {
      console.error("Soft delete failed:", error)
      toast({
        title: "Could not delete task",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setDeleting(false)
    }
  }

  const columns = useMemo<ColumnDef<CodexTask>[]>(
    () => [
      {
        id: "select",
        header: ({ table: tbl }) => {
          const rows = tbl.getRowModel().rows
          const allSelected =
            rows.length > 0 &&
            rows.every((r) => selectedIds.has(String(r.original.id)))
          return (
            <Checkbox
              checked={allSelected}
              onCheckedChange={(checked) => {
                setSelectedIds((prev) => {
                  const next = new Set(prev)
                  for (const r of rows) {
                    const id = String(r.original.id)
                    if (checked) next.add(id)
                    else next.delete(id)
                  }
                  return next
                })
              }}
              aria-label={`Select all on this page (${rows.length})`}
              title={`Select all on this page (${rows.length})`}
              onClick={(e) => e.stopPropagation()}
            />
          )
        },
        cell: ({ row }) => {
          const id = String(row.original.id)
          return (
            <div
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <Checkbox
                checked={selectedIds.has(id)}
                onCheckedChange={(checked) => {
                  setSelectedIds((prev) => {
                    const next = new Set(prev)
                    if (checked) next.add(id)
                    else next.delete(id)
                    return next
                  })
                }}
                aria-label={`Select ${row.original.title}`}
              />
            </div>
          )
        },
      },
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">
              {row.original.title}
            </span>
            {row.original.source && row.original.source !== "manual" ? (
              <Badge variant="outline" size="sm">
                {row.original.source}
              </Badge>
            ) : null}
            {row.original.auto_created ? (
              <Badge variant="secondary" size="sm">
                Auto
              </Badge>
            ) : null}
            {row.original.parent_task_id != null && row.original.parent_title ? (
              <Link
                href={`/tasks/${row.original.parent_task_id}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex max-w-full items-center rounded-pill border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <span className="truncate">
                  Help for: {row.original.parent_title}
                </span>
              </Link>
            ) : null}
          </div>
        ),
      },
      {
        id: "client",
        header: "Client",
        cell: ({ row }) =>
          clientNameById.get(Number(row.original.client_id)) ??
          String(row.original.client_id ?? "—"),
      },
      {
        id: "category",
        header: "Category",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {categoryLabel(row.original.category)}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const meta = statusMeta(String(row.original.status ?? ""))
          return (
            <div
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <Select
                value={
                  isTaskStatus(row.original.status)
                    ? row.original.status
                    : undefined
                }
                onValueChange={(value) => {
                  if (isTaskStatus(value)) void patchStatus(row.original, value)
                }}
              >
                <SelectTrigger className="h-8 w-[9.5rem] border-0 bg-transparent px-0 shadow-none focus:ring-0">
                  <SelectValue>
                    <Badge variant={meta.badgeVariant} size="sm">
                      {meta.label}
                    </Badge>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )
        },
      },
      {
        id: "assignee",
        header: "Assignee",
        cell: ({ row }) => (
          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <span>
              {row.original.assignee_name ||
                row.original.assignee_email ||
                "—"}
            </span>
            <TaskAskHelpButton
              task={row.original}
              members={teamMembers}
              meEmail={meEmail}
              onAsked={() => void fetchTasks()}
            />
          </div>
        ),
      },
      {
        id: "priority",
        header: () => (
          <SortHeaderButton
            label="Priority"
            active={sort === "priority_desc"}
            direction="desc"
            onClick={() => setSort("priority_desc")}
          />
        ),
        cell: ({ row }) => {
          const value = row.original.priority
          const label = TASK_PRIORITIES.find((p) => p.value === value)?.label
          return <span>{label ?? (value ? String(value) : "—")}</span>
        },
      },
      {
        accessorKey: "due_date",
        header: () => (
          <SortHeaderButton
            label="Due date"
            active={sort === "due_asc" || sort === "due_desc"}
            direction={sort === "due_desc" ? "desc" : "asc"}
            onClick={() =>
              setSort((current) => (current === "due_asc" ? "due_desc" : "due_asc"))
            }
          />
        ),
        cell: ({ row }) => (
          <span
            className={cn(
              "num",
              isOverdueYmd(row.original.due_date ?? null, row.original.status) &&
                "text-destructive font-medium"
            )}
          >
            {formatDueYmd(row.original.due_date ?? null)}
          </span>
        ),
      },
      {
        id: "estimate",
        header: "Estimate",
        cell: ({ row }) => (
          <TaskEstimateChip minutes={row.original.estimated_minutes} />
        ),
      },
      {
        accessorKey: "mba_number",
        header: "MBA",
        cell: ({ row }) => (
          <span className="num">{row.original.mba_number || "—"}</span>
        ),
      },
      {
        accessorKey: "updated_at",
        header: "Updated",
        cell: ({ row }) => (
          <span className="num text-muted-foreground">
            {formatUpdatedAt(row.original.updated_at)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div
            className="flex items-center justify-end gap-1"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {row.original.auto_created ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={autoBusyId === row.original.id}
                onClick={() => void dismissAutoTask(row.original)}
              >
                Dismiss
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              aria-label={`Delete ${row.original.title}`}
              onClick={() => setDeleteTarget(row.original)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- patchStatus closes over fetchTasks
    [clientNameById, selectedIds, autoBusyId, teamMembers, meEmail, fetchTasks, sort]
  )

  const teamRows = useMemo<TeamMemberWithWeek[]>(() => {
    const hoursBy = new Map(
      (teamWeek?.members ?? []).map((m) => [
        m.email.toLowerCase(),
        m,
      ] as const)
    )
    const rows: TeamMemberWithWeek[] = teamMembers.map((tm) => {
      const w = hoursBy.get(tm.email.toLowerCase())
      return {
        ...tm,
        week_hours: w?.hours ?? 0,
        estimated_open_hours: w?.estimated_open_hours ?? 0,
        open_tasks: w?.open ?? 0,
        overdue_tasks: w?.overdue ?? 0,
      }
    })
    rows.sort((a, b) => {
      const diff = teamHoursSortDesc
        ? b.week_hours - a.week_hours
        : a.week_hours - b.week_hours
      if (diff !== 0) return diff
      return a.name.localeCompare(b.name)
    })
    return rows
  }, [teamMembers, teamWeek, teamHoursSortDesc])

  const teamColumns = useMemo<ColumnDef<TeamMemberWithWeek>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <span className="font-medium text-foreground">{row.original.name}</span>
        ),
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.email}</span>
        ),
      },
      {
        accessorKey: "role_title",
        header: "Role",
        cell: ({ row }) => row.original.role_title || "—",
      },
      {
        id: "week_hours",
        accessorKey: "week_hours",
        header: () => (
          <button
            type="button"
            className="inline-flex items-center gap-1 font-medium hover:text-foreground"
            onClick={() => setTeamHoursSortDesc((d) => !d)}
          >
            Hours (week)
            <span className="text-muted-foreground" aria-hidden>
              {teamHoursSortDesc ? "↓" : "↑"}
            </span>
          </button>
        ),
        cell: ({ row }) => (
          <span className="num">{row.original.week_hours}</span>
        ),
      },
      {
        id: "estimated_open_hours",
        header: "Est. open (h)",
        cell: ({ row }) => (
          <span className="num">{row.original.estimated_open_hours}</span>
        ),
      },
      {
        id: "open_tasks",
        header: "Open",
        cell: ({ row }) => (
          <Link
            href={teamTasksHref(row.original.email, "open")}
            className="num text-foreground underline-offset-2 hover:underline"
            onClick={(event) => event.stopPropagation()}
            aria-label={`Open tasks for ${row.original.name}`}
          >
            {row.original.open_tasks}
          </Link>
        ),
      },
      {
        id: "overdue_tasks",
        header: "Overdue",
        cell: ({ row }) => (
          <Link
            href={teamTasksHref(row.original.email, "overdue")}
            className={cn(
              "num underline-offset-2 hover:underline",
              row.original.overdue_tasks > 0
                ? "text-status-danger"
                : "text-foreground"
            )}
            onClick={(event) => event.stopPropagation()}
            aria-label={`Overdue tasks for ${row.original.name}`}
          >
            {row.original.overdue_tasks}
          </Link>
        ),
      },
      {
        id: "active",
        header: "Active",
        cell: ({ row }) => (
          <div
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Switch
              checked={row.original.active}
              onCheckedChange={(checked) =>
                void toggleMemberActive(row.original, Boolean(checked))
              }
              aria-label={
                row.original.active
                  ? `Deactivate ${row.original.name}`
                  : `Activate ${row.original.name}`
              }
            />
          </div>
        ),
      },
      {
        accessorKey: "capacity_notes",
        header: "Capacity notes",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {truncateNotes(row.original.capacity_notes)}
          </span>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toggleMemberActive closes over fetchTeam
    [teamHoursSortDesc]
  )

  const table = useReactTable({
    data: tasks,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(row.id),
  })

  const teamTable = useReactTable({
    data: teamRows,
    columns: teamColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(row.id),
  })

  const openCreate = () => {
    setDialogOpen(true)
  }

  const openTaskDetail = (task: CodexTask) => {
    router.push(taskDetailHref(task.id, searchParams), { scroll: false })
  }

  const closeTaskPanel = () => {
    router.push(taskListHref(searchParams), { scroll: false })
  }

  const openCreateMember = () => {
    setEditingMember(null)
    setTeamDialogOpen(true)
  }

  const openEditMember = (member: TeamMember) => {
    setEditingMember(member)
    setTeamDialogOpen(true)
  }

  const openCreateTemplate = () => {
    setEditingTemplate(null)
    setTemplateDialogOpen(true)
  }

  const openEditTemplate = (tpl: TaskTemplate) => {
    setEditingTemplate(tpl)
    setTemplateDialogOpen(true)
  }

  const confirmDeleteTemplate = async () => {
    if (!deleteTemplateTarget) return
    setDeletingTemplate(true)
    try {
      const res = await fetch(
        `/api/codex/templates/${encodeURIComponent(String(deleteTemplateTarget.id))}`,
        { method: "DELETE" }
      )
      if (!res.ok) throw new Error("Failed to delete template")
      toast({ title: "Template deleted" })
      setDeleteTemplateTarget(null)
      void fetchTemplates()
    } catch (err) {
      toast({
        title: "Couldn’t delete template",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      })
    } finally {
      setDeletingTemplate(false)
    }
  }

  if (accessDenied) {
    return (
      <div className="w-full max-w-none space-y-6 px-4 pb-12 pt-0 md:px-6">
        <MediaPlanEditorHero
          className="mb-2 pt-6 md:pt-8"
          title={
            <span className="inline-flex flex-wrap items-center gap-2">
              Codex
              <Badge variant="secondary" size="sm">
                shadow
              </Badge>
            </span>
          }
          Icon={ListTodo}
          detail={<p>Internal task ops for the Assembled Media team.</p>}
        />
        <EmptyState
          title="Access denied"
          message="Codex is available to admins only. If you need access, contact an administrator."
        />
      </div>
    )
  }

  return (
    <div className="w-full max-w-none space-y-6 px-4 pb-12 pt-0 md:px-6">
      <MediaPlanEditorHero
        className="mb-2 pt-6 md:pt-8"
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            Codex
            <Badge variant="secondary" size="sm">
              shadow
            </Badge>
          </span>
        }
        Icon={ListTodo}
        detail={
          <p>Internal task ops for follow-ups across clients and campaigns.</p>
        }
        actions={
          mainTab === "tasks" ? (
            <Button type="button" onClick={openCreate}>
              <PlusCircle className="mr-2 h-4 w-4" />
              New task
            </Button>
          ) : mainTab === "templates" ? (
            <Button type="button" onClick={openCreateTemplate}>
              <PlusCircle className="mr-2 h-4 w-4" />
              New template
            </Button>
          ) : mainTab === "team" ? (
            <Button type="button" onClick={openCreateMember}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Add member
            </Button>
          ) : null
        }
      />

      <Tabs
        value={mainTab}
        onValueChange={(v) => {
          if (
            v === "tasks" ||
            v === "team" ||
            v === "templates" ||
            v === "inbox"
          ) {
            setMainTab(v)
          }
        }}
      >
        <TabsList className="h-auto bg-transparent p-0">
          <TabsTrigger value="tasks">
            <span className="inline-flex items-center gap-1.5">
              <ListTodo className="h-3.5 w-3.5" aria-hidden />
              Tasks
            </span>
          </TabsTrigger>
          <TabsTrigger value="inbox">
            <span className="inline-flex items-center gap-1.5">
              <Inbox className="h-3.5 w-3.5" aria-hidden />
              Inbox
              {inboxPendingCount > 0 ? (
                <Badge variant="secondary" size="sm" className="num">
                  {inboxPendingCount}
                </Badge>
              ) : null}
            </span>
          </TabsTrigger>
          <TabsTrigger value="templates">
            <span className="inline-flex items-center gap-1.5">
              <LayoutTemplate className="h-3.5 w-3.5" aria-hidden />
              Templates
            </span>
          </TabsTrigger>
          <TabsTrigger value="team">
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" aria-hidden />
              Team
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="mt-6 space-y-6">
          <div className="mx-auto max-w-6xl space-y-6">
          <TaskQuickAdd
            team={teamMembers
              .filter((member) => member.active)
              .map((member) => ({ email: member.email, name: member.name }))}
            clients={clients.map((c) => ({
              id: c.id,
              label: getClientDisplayName(c) || String(c.id),
              slug: c.slug,
            }))}
            defaultAssigneeEmail={meEmail}
            defaultAssigneeName={meName}
            fallbackClientId={clientId ? Number(clientId) : null}
            fallbackClientLabel={
              clientId
                ? clientNameById.get(Number(clientId)) ?? clientId
                : null
            }
            fallbackMbaNumber={mbaFilter.trim() || null}
            fallbackCategory={categoryFilter.trim() || null}
            clientsUnavailable={Boolean(clientsError)}
            onCreate={quickCreateTask}
          />

          <TasksFilterBar
            search={search}
            clientId={clientId}
            mbaFilter={mbaFilter}
            mbaPlans={mbaPlans}
            assigneeEmail={assigneeEmail}
            categoryFilter={categoryFilter}
            statusFilter={statusFilter}
            priorities={priorities}
            overdue={overdue}
            unassigned={unassigned}
            noClient={noClient}
            createdByEmail={createdByEmail}
            dueFrom={dueFrom}
            dueTo={dueTo}
            sources={sources}
            mine={mine}
            myWeek={myWeek}
            tasksLayout={tasksLayout}
            sort={sort}
            onSort={setSort}
            clients={clients
              .map((c) => ({
                id: c.id,
                label: getClientDisplayName(c) || String(c.id),
              }))
              .sort((a, b) =>
                a.label.localeCompare(b.label, undefined, {
                  sensitivity: "base",
                })
              )}
            members={teamMembers.map((m) => ({
              email: m.email,
              name: m.name,
              active: m.active,
            }))}
            onSearch={(v) =>
              commitFilters(applyTasksFilterChange(filterState(), { search: v }))
            }
            onClient={(v) =>
              commitFilters(
                applyTasksFilterChange(filterState(), {
                  clientId: v,
                  noClient: false,
                  mbaNumber: "",
                })
              )
            }
            onMba={(v) =>
              commitFilters(applyTasksFilterChange(filterState(), { mbaNumber: v }))
            }
            onAssignee={(v) =>
              commitFilters(
                applyTasksFilterChange(filterState(), {
                  assigneeEmail: v,
                  unassigned: false,
                  mine: false,
                })
              )
            }
            onUnassigned={() =>
              commitFilters(
                applyTasksFilterChange(filterState(), {
                  unassigned: true,
                  mine: false,
                  assigneeEmail: "",
                })
              )
            }
            onCategory={(v) =>
              commitFilters(applyTasksFilterChange(filterState(), { category: v }))
            }
            onStatus={(v) =>
              commitFilters(applyTasksFilterChange(filterState(), { statuses: v }))
            }
            onPriorities={(v) =>
              commitFilters(applyTasksFilterChange(filterState(), { priorities: v }))
            }
            onOverdue={(on) =>
              commitFilters(applyTasksFilterChange(filterState(), { overdue: on }))
            }
            onNoClient={(on) =>
              commitFilters(
                applyTasksFilterChange(filterState(), {
                  noClient: on,
                  ...(on ? { clientId: "", mbaNumber: "" } : {}),
                })
              )
            }
            onCreatedBy={(v) =>
              commitFilters(
                applyTasksFilterChange(filterState(), { createdByEmail: v })
              )
            }
            onDueFrom={(v) =>
              commitFilters(applyTasksFilterChange(filterState(), { dueFrom: v }))
            }
            onDueTo={(v) =>
              commitFilters(applyTasksFilterChange(filterState(), { dueTo: v }))
            }
            onSources={(v) =>
              commitFilters(applyTasksFilterChange(filterState(), { sources: v }))
            }
            onMineToggle={(allTasks) =>
              commitFilters(
                applyTasksFilterChange(filterState(), {
                  mine: !allTasks,
                  unassigned: false,
                  ...(allTasks ? { assigneeEmail: "" } : {}),
                })
              )
            }
            onMyWeek={applyMyWeek}
            onLayout={(v) => {
              writeStoredTasksLayout(v)
              setTasksLayout(v)
            }}
            onClearAll={clearTaskFilters}
          />

          {selectedIds.size > 0 && tasksLayout === "list" ? (
            <TaskBulkBar
              count={selectedIds.size}
              teamMembers={teamMembers}
              busy={bulkBusy}
              onClear={() => setSelectedIds(new Set())}
              onSetStatus={async (status) => {
                await bulkApply({ patch: { status } }, "set status")
              }}
              onSetAssignee={async (email, name) => {
                await bulkApply(
                  { patch: { assignee_email: email, assignee_name: name } },
                  "set assignee"
                )
              }}
              onSetDueDate={async (due_date) => {
                await bulkApply({ patch: { due_date } }, "set due date")
              }}
              onSetPriority={async (priority) => {
                await bulkApply({ patch: { priority } }, "set priority")
              }}
              onSetCategory={async (category) => {
                await bulkApply({ patch: { category } }, "set category")
              }}
              onDelete={async () => {
                await bulkApply({ action: "delete" }, "delete")
              }}
            />
          ) : null}
          </div>

          <ViewStateBoundary
            state={tasksViewState}
            errorTitle={
              clientsError ? "Client list unavailable" : "Couldn't load tasks"
            }
            emptyTitle="No tasks yet — create the first one"
            emptyMessage="Create a task to track follow-ups across clients and campaigns."
            emptyAction={
              <Button type="button" onClick={openCreate}>
                <PlusCircle className="mr-2 h-4 w-4" />
                New task
              </Button>
            }
            filteredEmptyTitle="No tasks match these filters"
            filteredEmptyMessage="Try clearing filters or broadening the search."
            loadingRows={5}
          >
            {() =>
              tasksLayout === "board" ? (
                <TaskBoard
                  columns={boardColumns}
                  counts={statusCounts}
                  statusFilter={myWeek ? MY_WEEK_STATUSES : statusFilter}
                  onLoadMore={(status) => {
                    void loadMoreBoard(status)
                  }}
                  loadingMoreStatus={loadingMoreStatus}
                  sort={sort}
                  clientNameById={clientNameById}
                  onOpenTask={openTaskDetail}
                  onStatusChange={(task, status) => {
                    void patchBoardStatus(task, status)
                  }}
                  teamMembers={teamMembers}
                  meEmail={meEmail}
                  onHelpAsked={() => setBoardReload((n) => n + 1)}
                />
              ) : (
              <div className="mx-auto max-w-6xl overflow-hidden rounded-card border border-border bg-card shadow-e1">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/20">
                      {table.getHeaderGroups().map((headerGroup) => (
                        <TableRow
                          key={headerGroup.id}
                          className="hover:bg-muted/20"
                        >
                          {headerGroup.headers.map((header) => (
                            <TableHead key={header.id}>
                              {header.isPlaceholder
                                ? null
                                : flexRender(
                                    header.column.columnDef.header,
                                    header.getContext()
                                  )}
                            </TableHead>
                          ))}
                        </TableRow>
                      ))}
                    </TableHeader>
                    <TableBody className="[&_tr:nth-child(even)]:bg-muted/5">
                      {table.getRowModel().rows.map((row) => (
                        <TableRow
                          key={row.id}
                          className="interactive-row cursor-pointer border-b border-border/20"
                          onClick={() => openTaskDetail(row.original)}
                        >
                          {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id}>
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {itemsTotal > PER_PAGE ? (
                  <div className="flex items-center justify-between border-t border-border/40 px-4 py-3">
                    <span className="text-sm text-muted-foreground">
                      Page {page}
                      {itemsTotal > 0
                        ? ` · ${itemsTotal.toLocaleString("en-AU")} total`
                        : ""}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={page <= 1 || isLoading}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        Prev
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!nextPage || isLoading}
                        onClick={() => {
                          if (nextPage) setPage(nextPage)
                        }}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
              )
            }
          </ViewStateBoundary>
        </TabsContent>

        <TabsContent value="inbox" className="mt-6 space-y-6">
          {inboxStaleCount > 0 ? (
            <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-card px-4 py-3 shadow-e0">
              <p className="text-sm text-foreground">
                <span className="num">{inboxStaleCount}</span> older than 21 days
              </p>
              {confirmExpireStale ? (
                <>
                  <p className="text-sm text-foreground">
                    Expire <span className="num">{inboxStaleCount}</span> proposals?
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={inboxExpiring}
                    onClick={() => void expireStaleInbox()}
                  >
                    Expire them
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={inboxExpiring}
                    onClick={() => setConfirmExpireStale(false)}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={inboxExpiring}
                  onClick={() => setConfirmExpireStale(true)}
                >
                  Expire them
                </Button>
              )}
            </div>
          ) : null}
          <ViewStateBoundary
            state={inboxViewState}
            errorTitle="Couldn't load inbox"
            emptyTitle="No meeting proposals"
            emptyMessage="Action items from synced Fireflies meetings appear here until you accept or dismiss them. Nothing creates a task without you."
            loadingRows={4}
          >
            {() => (
              <div className="space-y-6">
                {inboxGroups.map((group) => (
                  <div
                    key={group.note_id}
                    className="overflow-hidden rounded-card border border-border bg-card shadow-e1"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3">
                      <div className="min-w-0 space-y-1">
                        <p className="truncate font-medium text-foreground">
                          {group.meeting_title?.trim() || "Untitled meeting"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {group.meeting_date
                            ? formatDueYmd(toSydneyCivilYmd(group.meeting_date))
                            : "No date"}
                          {group.mba_number
                            ? ` · ${group.mba_number}`
                            : ""}
                          {group.transcript_url ? (
                            <>
                              {" · "}
                              <a
                                href={group.transcript_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary underline-offset-4 hover:underline"
                              >
                                Transcript
                              </a>
                            </>
                          ) : null}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={inboxBusyId != null}
                          onClick={() =>
                            setDismissAllTarget({
                              noteId: group.note_id,
                              label:
                                group.meeting_title?.trim() || "Untitled meeting",
                              count: group.proposals.length,
                            })
                          }
                        >
                          Dismiss all ({group.proposals.length})
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={inboxBusyId != null}
                          onClick={() => void batchAcceptMeeting(group.note_id)}
                        >
                          Accept all
                        </Button>
                      </div>
                    </div>
                    <ul className="divide-y divide-border">
                      {group.proposals.map((p) => (
                        <li
                          key={p.id}
                          className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
                        >
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="font-medium text-foreground">
                              {p.proposed_title}
                            </p>
                            {p.proposed_assignee_email ? (
                              <p className="text-sm text-muted-foreground">
                                {p.proposed_assignee_email}
                              </p>
                            ) : null}
                            {p.possible_duplicate ? (
                              <Badge variant="outline" size="sm">
                                Possible duplicate
                              </Badge>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              disabled={inboxBusyId != null}
                              onClick={() => void acceptInboxProposal(p.id)}
                            >
                              Accept
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={inboxBusyId != null}
                              onClick={() => {
                                setEditProposal(p)
                                setEditTitle(p.proposed_title)
                                setEditDescription(p.proposed_description ?? "")
                                setEditAssignee(
                                  p.proposed_assignee_email ?? ""
                                )
                                setEditMba(p.proposed_mba_number ?? "")
                                setEditClientId(
                                  p.client_id != null ? String(p.client_id) : ""
                                )
                                setEditDue(
                                  toSydneyCivilYmd(p.proposed_due_date) ?? ""
                                )
                                setEditCategory(
                                  p.proposed_category &&
                                    isTaskCategory(p.proposed_category)
                                    ? p.proposed_category
                                    : ""
                                )
                              }}
                            >
                              Edit & accept
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={inboxBusyId != null}
                              onClick={() => void dismissInboxProposal(p.id)}
                            >
                              Dismiss
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {inboxPageTotal > 1 ? (
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={inboxPage <= 1 || inboxLoading}
                      onClick={() => setInboxPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground num">
                      {inboxPage} / {inboxPageTotal}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={inboxNextPage == null || inboxLoading}
                      onClick={() => {
                        if (inboxNextPage) setInboxPage(inboxNextPage)
                      }}
                    >
                      Next
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </ViewStateBoundary>
        </TabsContent>

        <TabsContent value="team" className="mt-6 space-y-6">
          <Auth0RosterSyncButton onComplete={() => void fetchTeam()} />
          {neverLoggedIn.length > 0 ? (
            <div
              className="rounded-card border border-border bg-surface-panel px-4 py-3 text-sm shadow-e0"
              role="status"
            >
              <p className="font-medium text-foreground">
                Active roster emails that have never logged in
              </p>
              <p className="mt-1 text-muted-foreground">
                Roster emails are Auth0 admin emails. Report-only — these people
                cannot be assigned in-app until they sign in.
              </p>
              <ul className="mt-2 space-y-0.5">
                {neverLoggedIn.map((email) => (
                  <li key={email} className="font-mono text-xs text-muted-foreground">
                    {email}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {aliasCollisions.length > 0 ? (
            <div
              className="rounded-card border border-border bg-surface-panel px-4 py-3 text-sm shadow-e0"
              role="status"
            >
              <p className="font-medium text-foreground">Shared email aliases</p>
              <p className="mt-1 text-muted-foreground">
                AVA will not guess who a shared alias belongs to. Meeting tasks
                and time drafts skip that address until you pick who keeps it.
                Existing roster rows are unchanged.
              </p>
              <ul className="mt-2 space-y-1">
                {aliasCollisions.map((collision) => (
                  <li key={collision.alias} className="text-muted-foreground">
                    <span className="font-mono text-xs text-foreground">
                      {collision.alias}
                    </span>
                    {" "}
                    is on{" "}
                    {collision.holders
                      .map((h) => `${h.name} (${h.email})`)
                      .join(" and ")}
                    .
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {teamWeek && teamWeek.unmapped_count > 0 ? (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface-panel px-4 py-3 text-sm shadow-e0"
              role="status"
            >
              <p className="text-foreground">
                <span className="num font-semibold">{teamWeek.unmapped_count}</span>{" "}
                unmapped time{" "}
                {teamWeek.unmapped_count === 1 ? "entry" : "entries"} this week
                ({teamWeek.week_start} – {teamWeek.week_end}).
              </p>
              <Link
                href="/admin/myhours-mapping"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Map in admin
              </Link>
            </div>
          ) : null}
          <ViewStateBoundary
            state={teamViewState}
            errorTitle="Couldn't load team"
            emptyTitle="Add the team to enable assignment"
            emptyMessage="Roster members power the assignee picker on tasks."
            emptyAction={
              <Button type="button" onClick={openCreateMember}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add member
              </Button>
            }
            loadingRows={4}
          >
            {() => (
              <div className="overflow-hidden rounded-card border border-border bg-card shadow-e1">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/20">
                      {teamTable.getHeaderGroups().map((headerGroup) => (
                        <TableRow
                          key={headerGroup.id}
                          className="hover:bg-muted/20"
                        >
                          {headerGroup.headers.map((header) => (
                            <TableHead key={header.id}>
                              {header.isPlaceholder
                                ? null
                                : flexRender(
                                    header.column.columnDef.header,
                                    header.getContext()
                                  )}
                            </TableHead>
                          ))}
                        </TableRow>
                      ))}
                    </TableHeader>
                    <TableBody className="[&_tr:nth-child(even)]:bg-muted/5">
                      {teamTable.getRowModel().rows.map((row) => (
                        <TableRow
                          key={row.id}
                          className="interactive-row cursor-pointer border-b border-border/20"
                          onClick={() => openEditMember(row.original)}
                        >
                          {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id}>
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </ViewStateBoundary>
          <TimesheetDraftsPanel
            active={mainTab === "team"}
            weekStart={teamWeek?.week_start}
            onConfirmed={fetchTeamWeek}
          />
        </TabsContent>

        <TabsContent value="templates" className="mt-6 space-y-6">
          <ViewStateBoundary
            state={templatesViewState}
            errorTitle="Couldn't load templates"
            emptyTitle="No templates yet"
            emptyMessage="Templates are ordered checklist blueprints. Apply one when creating a task, or attach a recurring rule to seed retainer rhythm."
            emptyAction={
              <Button type="button" onClick={openCreateTemplate}>
                <PlusCircle className="mr-2 h-4 w-4" />
                New template
              </Button>
            }
            loadingRows={4}
          >
            {() => (
              <div className="overflow-hidden rounded-card border border-border bg-card shadow-e1">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/20">
                      <TableRow className="hover:bg-muted/20">
                        <TableHead>Name</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-28">Checklist</TableHead>
                        <TableHead className="w-24"> </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="[&_tr:nth-child(even)]:bg-muted/5">
                      {templates.map((tpl) => (
                        <TableRow
                          key={tpl.id}
                          className="interactive-row cursor-pointer border-b border-border/20"
                          onClick={() => openEditTemplate(tpl)}
                        >
                          <TableCell className="font-medium">
                            {tpl.name}
                          </TableCell>
                          <TableCell className="max-w-md truncate text-muted-foreground">
                            {tpl.description?.trim() || "—"}
                          </TableCell>
                          <TableCell className="num text-muted-foreground">
                            {(tpl.items ?? []).length}
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation()
                                setDeleteTemplateTarget(tpl)
                              }}
                              aria-label={`Delete ${tpl.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </ViewStateBoundary>
        </TabsContent>
      </Tabs>

      <TaskFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={null}
        clients={clients}
        teamMembers={teamMembers}
        templates={templates}
        createPrefill={{
          client_id:
            !noClient && Number(clientId) > 0 ? Number(clientId) : undefined,
          mba_number: mbaFilter.trim() || undefined,
          category: isTaskCategory(categoryFilter) ? categoryFilter : undefined,
        }}
        onSaved={() => {
          void fetchTasks()
        }}
      />

      <TeamMemberFormDialog
        open={teamDialogOpen}
        onOpenChange={setTeamDialogOpen}
        member={editingMember}
        onSaved={() => {
          void fetchTeam()
        }}
      />

      <TemplateFormDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        template={editingTemplate}
        onSaved={() => {
          void fetchTemplates()
        }}
      />

      <AlertDialog
        open={dismissAllTarget != null}
        onOpenChange={(open) => {
          if (!open && inboxBusyId == null) setDismissAllTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dismiss all proposals?</AlertDialogTitle>
            <AlertDialogDescription>
              {dismissAllTarget
                ? `Dismiss ${dismissAllTarget.count} proposals in ${dismissAllTarget.label}?`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={inboxBusyId != null}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={inboxBusyId != null}
              onClick={(e) => {
                e.preventDefault()
                if (!dismissAllTarget) return
                void dismissAllForMeeting(
                  dismissAllTarget.noteId,
                  dismissAllTarget.label,
                  dismissAllTarget.count
                )
              }}
            >
              Dismiss all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `“${deleteTarget.title}” will be removed from all lists. This is a soft delete — it can be recovered later if needed.`
                : "This task will be removed from all lists."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteTemplateTarget != null}
        onOpenChange={(open) => {
          if (!open && !deletingTemplate) setDeleteTemplateTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTemplateTarget
                ? `“${deleteTemplateTarget.name}” and its checklist labels will be removed. Existing tasks keep their copied checklists.`
                : "This template will be removed."}
              {templateSeedsLoading
                ? " Checking live series…"
                : templateSeeds.length > 0
                  ? " These live series will stop."
                  : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {templateSeeds.length > 0 ? (
            <ul className="max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-foreground">
              {templateSeeds.map((seed) => (
                <li key={seed.id}>{seed.title}</li>
              ))}
            </ul>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingTemplate}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingTemplate}
              onClick={(e) => {
                e.preventDefault()
                void confirmDeleteTemplate()
              }}
            >
              {deletingTemplate ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={editProposal != null}
        onOpenChange={(open) => {
          if (!open) setEditProposal(null)
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit proposal then accept</DialogTitle>
          </DialogHeader>
          <ComboboxModalProvider>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="proposal-edit-title">Title</Label>
                <Input
                  id="proposal-edit-title"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proposal-edit-description">Description</Label>
                <Textarea
                  id="proposal-edit-description"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proposal-edit-client">Client</Label>
                <Combobox
                  id="proposal-edit-client"
                  options={editClientOptions}
                  value={editClientId}
                  onValueChange={(next) => {
                    if (next === editClientId) return
                    setEditClientId(next)
                    setEditMba("")
                  }}
                  placeholder="Select a client"
                  searchPlaceholder="Search clients…"
                  emptyText="No clients found."
                />
              </div>
              <TaskMbaSelect
                id="proposal-edit-mba"
                clientId={
                  editClientId && Number.isFinite(Number(editClientId))
                    ? Number(editClientId)
                    : null
                }
                value={editMba}
                plans={editMbaPlans}
                onChange={(mba) => setEditMba(mba ?? "")}
                buttonClassName="w-full"
              />
              <div className="space-y-1.5">
                <Label htmlFor="proposal-edit-assignee">Assignee</Label>
                <Combobox
                  id="proposal-edit-assignee"
                  options={editAssigneeOptions}
                  value={editAssignee || EDIT_ASSIGNEE_NONE}
                  onValueChange={(next) => {
                    setEditAssignee(
                      next === EDIT_ASSIGNEE_NONE ? "" : next
                    )
                  }}
                  placeholder="Select an assignee"
                  searchPlaceholder="Search people…"
                  emptyText="No active people found."
                  preserveOrder
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proposal-edit-due">Due date</Label>
                <Input
                  id="proposal-edit-due"
                  type="date"
                  value={editDue}
                  onChange={(e) => setEditDue(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proposal-edit-category">Category</Label>
                <Select
                  value={editCategory || EDIT_CATEGORY_NONE}
                  onValueChange={(next) => {
                    setEditCategory(
                      next === EDIT_CATEGORY_NONE ? "" : next
                    )
                  }}
                >
                  <SelectTrigger id="proposal-edit-category">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EDIT_CATEGORY_NONE}>None</SelectItem>
                    {TASK_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {categoryLabel(category)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {editProposal?.possible_duplicate ? (
                <Badge variant="outline" size="sm">
                  Possible duplicate
                </Badge>
              ) : null}
            </div>
          </ComboboxModalProvider>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditProposal(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                inboxBusyId != null ||
                !editTitle.trim() ||
                !editClientId.trim() ||
                !Number.isFinite(Number(editClientId)) ||
                Number(editClientId) < 1
              }
              onClick={() => {
                if (!editProposal) return
                void acceptInboxProposal(
                  editProposal.id,
                  inboxAcceptEdits(editProposal, {
                    title: editTitle,
                    description: editDescription,
                    clientId: editClientId,
                    mba: editMba,
                    assignee: editAssignee,
                    due: editDue,
                    category: editCategory,
                  })
                )
              }}
            >
              Accept
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <TaskDetailSlideOver
        open={overlayTaskId != null}
        taskId={overlayTaskId}
        onClose={closeTaskPanel}
      />
    </div>
  )
}
