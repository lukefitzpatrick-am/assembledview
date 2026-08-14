"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table"
import { Columns3, Inbox, LayoutList, ListTodo, PlusCircle, Trash2, Users, LayoutTemplate } from "lucide-react"
import { isValid, parseISO, startOfDay } from "date-fns"
import { MediaPlanEditorHero } from "@/components/mediaplans/MediaPlanEditorHero"
import { matchText } from "@/lib/search/matchText"
import { useUser } from "@/components/AuthWrapper"
import { TaskBoard } from "@/components/tasks/TaskBoard"
import { TaskBulkBar } from "@/components/tasks/TaskBulkBar"
import { TaskDetailSlideOver } from "@/components/tasks/TaskDetailSlideOver"
import { TaskFormDialog } from "@/components/tasks/TaskFormDialog"
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
import { Input } from "@/components/ui/input"
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Label } from "@/components/ui/label"
import { EmptyState } from "@/components/ui/states"
import { ViewStateBoundary } from "@/components/ui/ViewStateBoundary"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"
import {
  applyClientsFetchResult,
  fetchClientsList,
} from "@/lib/clients/fetchClientsList"
import { getClientDisplayName } from "@/lib/clients/slug"
import { resolveListViewState } from "@/lib/ui/viewState"
import {
  MY_WEEK_STATUSES,
  myWeekDueRange,
} from "@/lib/codex/quickAddParse"
import { parseTasksDeepLinkParams } from "@/lib/codex/queryHelpers"
import {
  STATUSES,
  TASK_CATEGORY_OPTIONS,
  categoryLabel,
  statusMeta,
  type CodexPagedResponse,
  type CodexTask,
  type TaskStatus,
  type TaskTemplate,
  type TeamMember,
  isTaskStatus,
} from "@/lib/codex/types"
import type { TeamWeekTimeSummary } from "@/lib/myhours/timeSummary"

type TeamMemberWithWeek = TeamMember & {
  week_hours: number
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
const NOTES_TRUNCATE = 60

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

function truncateNotes(value: string | null | undefined): string {
  if (!value) return "—"
  const trimmed = value.trim()
  if (trimmed.length <= NOTES_TRUNCATE) return trimmed
  return `${trimmed.slice(0, NOTES_TRUNCATE)}…`
}

function toApiSort(sort: string): string {
  if (sort === "due_date desc") return "due_date_desc"
  if (sort === "created_at desc") return "created_at_desc"
  return "due_date_asc"
}

export function TasksPageClient({
  overlayTaskId = null,
}: {
  overlayTaskId?: number | null
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const { user } = useUser()
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
  const [inboxLoading, setInboxLoading] = useState(false)
  const [inboxError, setInboxError] = useState<string | null>(null)
  const [inboxBusyId, setInboxBusyId] = useState<number | null>(null)
  const [editProposal, setEditProposal] = useState<InboxProposalRow | null>(
    null
  )
  const [editTitle, setEditTitle] = useState("")
  const [editAssignee, setEditAssignee] = useState("")
  const [editMba, setEditMba] = useState("")
  const [editClientId, setEditClientId] = useState("")
  /** List and board share the same filter state — switching must not reset it. */
  const [tasksLayout, setTasksLayout] = useState<"list" | "board">("list")

  const [tasks, setTasks] = useState<CodexTask[]>([])
  const [itemsTotal, setItemsTotal] = useState(0)
  const [nextPage, setNextPage] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)

  const [clientId, setClientId] = useState<string>("")
  const [mbaFilter, setMbaFilter] = useState<string>("")
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [categoryFilter, setCategoryFilter] = useState<string>("")
  const [assigneeEmail, setAssigneeEmail] = useState("")
  const [mine, setMine] = useState(true)
  const [myWeek, setMyWeek] = useState(false)
  const [dueAfter, setDueAfter] = useState<string>("")
  const [dueBefore, setDueBefore] = useState<string>("")
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState("due_date")

  const [clients, setClients] = useState<ClientOption[]>([])
  const [clientsError, setClientsError] = useState<string | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [teamLoading, setTeamLoading] = useState(true)
  const [teamError, setTeamError] = useState<string | null>(null)
  const [teamWeek, setTeamWeek] = useState<TeamWeekTimeSummary | null>(null)
  const [teamHoursSortDesc, setTeamHoursSortDesc] = useState(true)
  const [neverLoggedIn, setNeverLoggedIn] = useState<string[]>([])
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
        router.replace(`/tasks/${id}`)
        return
      }
    }
    const deep = parseTasksDeepLinkParams(searchParams)
    if (deep.mbaNumber) setMbaFilter(deep.mbaNumber)
    if (deep.clientId) setClientId(deep.clientId)
  }, [searchParams, router])

  const clientNameById = useMemo(() => {
    const map = new Map<number, string>()
    for (const c of clients) {
      map.set(c.id, getClientDisplayName(c) || String(c.id))
    }
    return map
  }, [clients])

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
      }
      setTeamMembers(Array.isArray(data.items) ? data.items : [])
      setNeverLoggedIn(
        Array.isArray(data.never_logged_in) ? data.never_logged_in : []
      )
    } catch (error) {
      console.error("Error fetching team:", error)
      setTeamError("Something went wrong while loading the team.")
      setTeamMembers([])
      setNeverLoggedIn([])
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

  const fetchInbox = useCallback(async () => {
    setInboxLoading(true)
    setInboxError(null)
    try {
      const res = await fetch("/api/codex/proposals")
      if (res.status === 403) {
        setAccessDenied(true)
        setInboxGroups([])
        return
      }
      if (!res.ok) {
        setInboxError("Something went wrong while loading the inbox.")
        setInboxGroups([])
        return
      }
      const data = (await res.json()) as { groups?: InboxGroup[] }
      setInboxGroups(Array.isArray(data.groups) ? data.groups : [])
    } catch (error) {
      console.error("Error fetching proposals inbox:", error)
      setInboxError("Something went wrong while loading the inbox.")
      setInboxGroups([])
    } finally {
      setInboxLoading(false)
    }
  }, [])

  useEffect(() => {
    if (mainTab !== "inbox") return
    void fetchInbox()
  }, [mainTab, fetchInbox])

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
    setIsLoading(true)
    setLoadError(null)
    try {
      const params = new URLSearchParams()
      params.set("page", String(page))
      params.set("per_page", String(PER_PAGE))
      params.set("sort", toApiSort(sort))
      if (clientId) params.set("client_id", clientId)
      if (mbaFilter) params.set("mba_number", mbaFilter)
      if (statusFilter.length > 0) params.set("status", statusFilter.join(","))
      if (categoryFilter) params.set("category", categoryFilter)
      if (dueAfter) params.set("due_after", dueAfter)
      if (dueBefore) params.set("due_before", dueBefore)
      if (mine) {
        params.set("mine", "1")
      } else if (assigneeEmail.trim()) {
        params.set("assignee_email", assigneeEmail.trim())
      }

      const response = await fetch(`/api/codex/tasks?${params.toString()}`)
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
      setIsLoading(false)
    }
  }, [page, sort, clientId, mbaFilter, statusFilter, categoryFilter, mine, assigneeEmail, dueAfter, dueBefore])

  useEffect(() => {
    void fetchTasks()
  }, [fetchTasks])

  const acceptInboxProposal = useCallback(
    async (
      proposalId: number,
      edits: {
        title?: string
        assignee_email?: string | null
        mba_number?: string | null
        client_id?: number | null
      } | null = null
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
    [fetchInbox, fetchTasks, toast]
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
    [fetchInbox, toast]
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
    [fetchInbox, fetchTasks, toast]
  )

  useEffect(() => {
    setPage(1)
  }, [clientId, mbaFilter, statusFilter, categoryFilter, mine, assigneeEmail, sort, dueAfter, dueBefore])

  useEffect(() => {
    setSelectedIds(new Set())
  }, [page, clientId, mbaFilter, statusFilter, categoryFilter, mine, assigneeEmail, dueAfter, dueBefore, search])

  const filteredTasks = useMemo(() => {
    const q = search.trim()
    if (!q) return tasks
    return tasks.filter((t) => matchText(t.title, q))
  }, [tasks, search])

  const clearTaskFilters = useCallback(() => {
    setClientId("")
    setMbaFilter("")
    setStatusFilter([])
    setCategoryFilter("")
    setAssigneeEmail("")
    setSearch("")
    setMine(true)
    setMyWeek(false)
    setDueAfter("")
    setDueBefore("")
    setPage(1)
  }, [])

  const applyMyWeek = useCallback(
    (on: boolean) => {
      if (!on) {
        setMyWeek(false)
        setDueAfter("")
        setDueBefore("")
        setStatusFilter([])
        setAssigneeEmail("")
        setMine(true)
        return
      }
      if (!meEmail) {
        toast({
          title: "Could not resolve your email",
          description: "Sign in again to use My week.",
          variant: "destructive",
        })
        return
      }
      const range = myWeekDueRange()
      setMyWeek(true)
      setMine(false)
      setAssigneeEmail(meEmail)
      setStatusFilter([...MY_WEEK_STATUSES])
      setDueAfter(range.dueAfter)
      setDueBefore(range.dueBefore)
      setPage(1)
    },
    [meEmail, toast]
  )

  const tasksFiltersActive = Boolean(
    clientId ||
      mbaFilter ||
      statusFilter.length > 0 ||
      categoryFilter ||
      assigneeEmail.trim() ||
      search.trim() ||
      myWeek ||
      dueAfter ||
      dueBefore ||
      !mine
  )

  const tasksViewState = useMemo(
    () =>
      resolveListViewState({
        loading: isLoading,
        error: clientsError ?? loadError,
        items: tasks,
        visible: filteredTasks,
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
      }),
    [
      isLoading,
      clientsError,
      loadError,
      tasks,
      filteredTasks,
      tasksFiltersActive,
      clearTaskFilters,
      fetchClients,
      fetchTasks,
    ]
  )

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

  const patchStatus = async (task: CodexTask, status: TaskStatus) => {
    const previousStatus = task.status
    if (previousStatus === status) return

    setTasks((prev) =>
      prev.map((t) =>
        String(t.id) === String(task.id) ? { ...t, status } : t
      )
    )

    try {
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
      const next = (await res.json()) as CodexTask
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

  const quickCreateTask = async (payload: {
    title: string
    client_id: number
    status: "todo"
    priority: "low" | "normal" | "high"
    assignee_email: string | null
    assignee_name: string | null
    due_date: string | null
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
    toast({ title: "Task created" })
    await fetchTasks()
  }

  const bulkPatch = async (
    patch: Record<string, unknown>,
    label: string
  ) => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    setBulkBusy(true)
    const previous = tasks
    // Optimistic local merge for known fields
    setTasks((prev) =>
      prev.map((t) => {
        if (!selectedIds.has(String(t.id))) return t
        return {
          ...t,
          ...(patch.status !== undefined
            ? { status: String(patch.status) }
            : null),
          ...(patch.assignee_email !== undefined
            ? { assignee_email: patch.assignee_email as string | null }
            : null),
          ...(patch.assignee_name !== undefined
            ? { assignee_name: patch.assignee_name as string | null }
            : null),
          ...(patch.due_date !== undefined
            ? { due_date: patch.due_date as string | null }
            : null),
        }
      })
    )
    try {
      const results = await Promise.all(
        ids.map(async (id) => {
          const res = await fetch(
            `/api/codex/tasks/${encodeURIComponent(id)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(patch),
            }
          )
          return { id, ok: res.ok }
        })
      )
      const failed = results.filter((r) => !r.ok)
      if (failed.length > 0) {
        setTasks(previous)
        toast({
          title: `Could not ${label}`,
          description: `${failed.length} of ${ids.length} updates failed — list restored.`,
          variant: "destructive",
        })
        return
      }
      toast({ title: `Updated ${ids.length} tasks` })
      setSelectedIds(new Set())
      await fetchTasks()
    } catch (error) {
      setTasks(previous)
      toast({
        title: `Could not ${label}`,
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
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
              aria-label="Select all on page"
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
        cell: ({ row }) =>
          row.original.assignee_name ||
          row.original.assignee_email ||
          "—",
      },
      {
        accessorKey: "due_date",
        header: () => (
          <button
            type="button"
            className="font-medium text-muted-foreground hover:text-foreground"
            onClick={() =>
              setSort((current) =>
                current === "due_date" ? "due_date desc" : "due_date"
              )
            }
          >
            Due date
          </button>
        ),
        cell: ({ row }) => (
          <span
            className={cn(
              "num",
              isOverdue(row.original) && "text-destructive font-medium"
            )}
          >
            {formatDueDateSydney(row.original.due_date)}
          </span>
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
    [clientNameById, selectedIds, autoBusyId]
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
        id: "open_tasks",
        header: "Open",
        cell: ({ row }) => (
          <span className="num">{row.original.open_tasks}</span>
        ),
      },
      {
        id: "overdue_tasks",
        header: "Overdue",
        cell: ({ row }) => (
          <span
            className={cn(
              "num",
              row.original.overdue_tasks > 0 && "text-status-danger"
            )}
          >
            {row.original.overdue_tasks}
          </span>
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
    data: filteredTasks,
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
    router.push(`/tasks/${encodeURIComponent(String(task.id))}`)
  }

  const closeTaskPanel = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("task")
    const q = params.toString()
    router.push(q ? `/tasks?${q}` : "/tasks")
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
              {inboxGroups.length > 0 ? (
                <Badge variant="secondary" size="sm" className="num">
                  {inboxGroups.reduce((n, g) => n + g.proposals.length, 0)}
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
          <TaskQuickAdd
            team={teamMembers.map((m) => ({ email: m.email, name: m.name }))}
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
            clientsUnavailable={Boolean(clientsError)}
            onCreate={quickCreateTask}
          />

          <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-e1">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[12rem] space-y-1.5">
                <Label htmlFor="tasks-client">Client</Label>
                <Select
                  value={clientId || "__all__"}
                  onValueChange={(v) => {
                    setMyWeek(false)
                    setClientId(v === "__all__" ? "" : v)
                  }}
                >
                  <SelectTrigger id="tasks-client" className="h-9">
                    <SelectValue placeholder="All clients" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All clients</SelectItem>
                    {clients
                      .map((c) => ({
                        id: c.id,
                        label: getClientDisplayName(c) || String(c.id),
                      }))
                      .sort((a, b) =>
                        a.label.localeCompare(b.label, undefined, {
                          sensitivity: "base",
                        })
                      )
                      .map(({ id, label }) => (
                        <SelectItem key={id} value={String(id)}>
                          {label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {mbaFilter ? (
                <div className="min-w-[10rem] space-y-1.5">
                  <Label htmlFor="tasks-mba-scope">MBA</Label>
                  <div className="flex h-9 items-center gap-2">
                    <Badge variant="secondary" className="num" id="tasks-mba-scope">
                      {mbaFilter}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => setMbaFilter("")}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="min-w-[10rem] flex-1 space-y-1.5">
                <Label htmlFor="tasks-assignee">Assignee email</Label>
                <Input
                  id="tasks-assignee"
                  className="h-9"
                  placeholder="name@assembledmedia.com.au"
                  value={assigneeEmail}
                  disabled={mine || myWeek}
                  onChange={(e) => {
                    setMyWeek(false)
                    setDueAfter("")
                    setDueBefore("")
                    setAssigneeEmail(e.target.value)
                  }}
                />
              </div>

              <div className="min-w-[10rem] flex-1 space-y-1.5">
                <Label htmlFor="tasks-search">Search title</Label>
                <Input
                  id="tasks-search"
                  className="h-9"
                  placeholder="Contains…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2 pb-1">
                <Switch
                  id="tasks-all"
                  checked={!mine && !myWeek}
                  onCheckedChange={(checked) => {
                    setMyWeek(false)
                    setDueAfter("")
                    setDueBefore("")
                    setMine(!checked)
                    if (checked) setAssigneeEmail("")
                  }}
                  aria-label="All tasks"
                />
                <Label htmlFor="tasks-all" className="cursor-pointer">
                  All tasks
                </Label>
                <span className="text-[11px] text-muted-foreground">
                  {myWeek
                    ? "My week: assigned to me, due in 7 days, not done"
                    : mine
                      ? "Showing assigned to me or created by me"
                      : "Showing every task (including unassigned)"}
                </span>
              </div>

              <div className="flex items-center gap-2 pb-1">
                <Button
                  type="button"
                  size="sm"
                  variant={myWeek ? "default" : "outline"}
                  onClick={() => applyMyWeek(!myWeek)}
                >
                  My week
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[12rem] space-y-1.5">
                <Label htmlFor="tasks-category">Category</Label>
                <Select
                  value={categoryFilter || "__all__"}
                  onValueChange={(v) =>
                    setCategoryFilter(v === "__all__" ? "" : v)
                  }
                >
                  <SelectTrigger id="tasks-category" className="h-9">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All categories</SelectItem>
                    {TASK_CATEGORY_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <ToggleGroup
                  type="multiple"
                  variant="outline"
                  size="sm"
                  className="flex flex-wrap justify-start"
                  value={statusFilter}
                  onValueChange={(v) => {
                    setMyWeek(false)
                    setStatusFilter(v)
                  }}
                >
                  {STATUSES.map((s) => (
                    <ToggleGroupItem
                      key={s.value}
                      value={s.value}
                      aria-label={s.label}
                    >
                      {s.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">View</span>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  value={tasksLayout}
                  onValueChange={(v) => {
                    if (v === "list" || v === "board") setTasksLayout(v)
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
          </div>

          {selectedIds.size > 0 && tasksLayout === "list" ? (
            <TaskBulkBar
              count={selectedIds.size}
              teamMembers={teamMembers}
              busy={bulkBusy}
              onClear={() => setSelectedIds(new Set())}
              onSetStatus={async (status) => {
                await bulkPatch({ status }, "set status")
              }}
              onSetAssignee={async (email, name) => {
                await bulkPatch(
                  { assignee_email: email, assignee_name: name },
                  "set assignee"
                )
              }}
              onSetDueDate={async (due_date) => {
                await bulkPatch({ due_date }, "set due date")
              }}
            />
          ) : null}

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
                  tasks={filteredTasks}
                  clientNameById={clientNameById}
                  onOpenTask={openTaskDetail}
                  onStatusChange={(task, status) => {
                    void patchStatus(task, status)
                  }}
                />
              ) : (
              <div className="overflow-hidden rounded-card border border-border bg-card shadow-e1">
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
                            ? formatDueDateSydney(group.meeting_date)
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
                      <Button
                        type="button"
                        size="sm"
                        disabled={inboxBusyId != null}
                        onClick={() => void batchAcceptMeeting(group.note_id)}
                      >
                        Accept all
                      </Button>
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
                                setEditAssignee(
                                  p.proposed_assignee_email ?? ""
                                )
                                setEditMba(p.proposed_mba_number ?? "")
                                setEditClientId(
                                  p.client_id != null ? String(p.client_id) : ""
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
            </AlertDialogDescription>
          </AlertDialogHeader>
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit proposal then accept</DialogTitle>
          </DialogHeader>
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
              <Label htmlFor="proposal-edit-assignee">Assignee email</Label>
              <Input
                id="proposal-edit-assignee"
                value={editAssignee}
                onChange={(e) => setEditAssignee(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proposal-edit-mba">MBA</Label>
              <Input
                id="proposal-edit-mba"
                value={editMba}
                onChange={(e) => setEditMba(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proposal-edit-client">Client id</Label>
              <Input
                id="proposal-edit-client"
                value={editClientId}
                onChange={(e) => setEditClientId(e.target.value)}
              />
            </div>
            {editProposal?.possible_duplicate ? (
              <Badge variant="outline" size="sm">
                Possible duplicate
              </Badge>
            ) : null}
          </div>
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
              disabled={inboxBusyId != null || !editTitle.trim()}
              onClick={() => {
                if (!editProposal) return
                void acceptInboxProposal(editProposal.id, {
                  title: editTitle.trim(),
                  assignee_email: editAssignee.trim() || null,
                  mba_number: editMba.trim() || null,
                  client_id: editClientId.trim()
                    ? Number(editClientId)
                    : null,
                })
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
