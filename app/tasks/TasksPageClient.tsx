"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table"
import { ListTodo, PlusCircle, Trash2, Users } from "lucide-react"
import { isValid, parseISO, startOfDay } from "date-fns"
import { MediaPlanEditorHero } from "@/components/mediaplans/MediaPlanEditorHero"
import { matchText } from "@/lib/search/matchText"
import { TaskFormDialog } from "@/components/tasks/TaskFormDialog"
import { TeamMemberFormDialog } from "@/components/tasks/TeamMemberFormDialog"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { getClientDisplayName } from "@/lib/clients/slug"
import { resolveListViewState } from "@/lib/ui/viewState"
import {
  STATUSES,
  categoryLabel,
  statusMeta,
  type CodexPagedResponse,
  type CodexTask,
  type TaskStatus,
  type TeamMember,
  isTaskStatus,
} from "@/lib/codex/types"

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

export function TasksPageClient() {
  const { toast } = useToast()
  const [mainTab, setMainTab] = useState<"tasks" | "team">("tasks")

  const [tasks, setTasks] = useState<CodexTask[]>([])
  const [itemsTotal, setItemsTotal] = useState(0)
  const [nextPage, setNextPage] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)

  const [clientId, setClientId] = useState<string>("")
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [assigneeEmail, setAssigneeEmail] = useState("")
  const [mine, setMine] = useState(true)
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState("due_date")

  const [clients, setClients] = useState<ClientOption[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [teamLoading, setTeamLoading] = useState(true)
  const [teamError, setTeamError] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<CodexTask | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CodexTask | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [teamDialogOpen, setTeamDialogOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null)

  const clientNameById = useMemo(() => {
    const map = new Map<number, string>()
    for (const c of clients) {
      map.set(c.id, getClientDisplayName(c) || String(c.id))
    }
    return map
  }, [clients])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch("/api/clients")
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && Array.isArray(data)) {
          setClients(data as ClientOption[])
        }
      } catch (error) {
        console.error("Failed to load clients for tasks filters:", error)
      }
    })()
    return () => {
      cancelled = true
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
      const data = (await res.json()) as CodexPagedResponse<TeamMember>
      setTeamMembers(Array.isArray(data.items) ? data.items : [])
    } catch (error) {
      console.error("Error fetching team:", error)
      setTeamError("Something went wrong while loading the team.")
      setTeamMembers([])
    } finally {
      setTeamLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchTeam()
  }, [fetchTeam])

  const fetchTasks = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const params = new URLSearchParams()
      params.set("page", String(page))
      params.set("per_page", String(PER_PAGE))
      params.set("sort", toApiSort(sort))
      if (clientId) params.set("client_id", clientId)
      if (statusFilter.length > 0) params.set("status", statusFilter.join(","))
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
  }, [page, sort, clientId, statusFilter, mine, assigneeEmail])

  useEffect(() => {
    void fetchTasks()
  }, [fetchTasks])

  useEffect(() => {
    setPage(1)
  }, [clientId, statusFilter, mine, assigneeEmail, sort])

  const filteredTasks = useMemo(() => {
    const q = search.trim()
    if (!q) return tasks
    return tasks.filter((t) => matchText(t.title, q))
  }, [tasks, search])

  const clearTaskFilters = useCallback(() => {
    setClientId("")
    setStatusFilter([])
    setAssigneeEmail("")
    setSearch("")
    setMine(true)
    setPage(1)
  }, [])

  const tasksFiltersActive = Boolean(
    clientId || statusFilter.length > 0 || assigneeEmail.trim() || search.trim()
  )

  const tasksViewState = useMemo(
    () =>
      resolveListViewState({
        loading: isLoading,
        error: loadError,
        items: tasks,
        visible: filteredTasks,
        filtersActive: tasksFiltersActive,
        clear: clearTaskFilters,
        retry: () => {
          setLoadError(null)
          void fetchTasks()
        },
      }),
    [
      isLoading,
      loadError,
      tasks,
      filteredTasks,
      tasksFiltersActive,
      clearTaskFilters,
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

  const patchStatus = async (task: CodexTask, status: TaskStatus) => {
    try {
      const res = await fetch(
        `/api/codex/tasks/${encodeURIComponent(String(task.id))}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      )
      if (!res.ok) throw new Error("Failed to update status")
      await fetchTasks()
    } catch (error) {
      console.error("Inline status patch failed:", error)
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
            className="flex justify-end"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
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
    [clientNameById]
  )

  const teamColumns = useMemo<ColumnDef<TeamMember>[]>(
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
    []
  )

  const table = useReactTable({
    data: filteredTasks,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(row.id),
  })

  const teamTable = useReactTable({
    data: teamMembers,
    columns: teamColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(row.id),
  })

  const openCreate = () => {
    setEditingTask(null)
    setDialogOpen(true)
  }

  const openEdit = (task: CodexTask) => {
    setEditingTask(task)
    setDialogOpen(true)
  }

  const openCreateMember = () => {
    setEditingMember(null)
    setTeamDialogOpen(true)
  }

  const openEditMember = (member: TeamMember) => {
    setEditingMember(member)
    setTeamDialogOpen(true)
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
          ) : (
            <Button type="button" onClick={openCreateMember}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Add member
            </Button>
          )
        }
      />

      <Tabs
        value={mainTab}
        onValueChange={(v) => {
          if (v === "tasks" || v === "team") setMainTab(v)
        }}
      >
        <TabsList className="h-auto bg-transparent p-0">
          <TabsTrigger value="tasks">
            <span className="inline-flex items-center gap-1.5">
              <ListTodo className="h-3.5 w-3.5" aria-hidden />
              Tasks
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
          <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-e1">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[12rem] space-y-1.5">
                <Label htmlFor="tasks-client">Client</Label>
                <Select
                  value={clientId || "__all__"}
                  onValueChange={(v) => setClientId(v === "__all__" ? "" : v)}
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

              <div className="min-w-[10rem] flex-1 space-y-1.5">
                <Label htmlFor="tasks-assignee">Assignee email</Label>
                <Input
                  id="tasks-assignee"
                  className="h-9"
                  placeholder="name@assembledmedia.com.au"
                  value={assigneeEmail}
                  disabled={mine}
                  onChange={(e) => setAssigneeEmail(e.target.value)}
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
                  id="tasks-mine"
                  checked={mine}
                  onCheckedChange={(checked) => setMine(Boolean(checked))}
                  aria-label={mine ? "My tasks" : "All tasks"}
                />
                <Label htmlFor="tasks-mine" className="cursor-pointer">
                  {mine ? "My tasks" : "All tasks"}
                </Label>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <ToggleGroup
                type="multiple"
                variant="outline"
                size="sm"
                className="flex flex-wrap justify-start"
                value={statusFilter}
                onValueChange={setStatusFilter}
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
          </div>

          <ViewStateBoundary
            state={tasksViewState}
            errorTitle="Couldn't load tasks"
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
            {() => (
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
                          onClick={() => openEdit(row.original)}
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
            )}
          </ViewStateBoundary>
        </TabsContent>

        <TabsContent value="team" className="mt-6 space-y-6">
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
        </TabsContent>
      </Tabs>

      <TaskFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editingTask}
        clients={clients}
        teamMembers={teamMembers}
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
    </div>
  )
}
