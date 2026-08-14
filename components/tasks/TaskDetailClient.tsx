"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { CheckSquare, MessageSquare, Plus } from "lucide-react"
import { formatDistanceToNow, isValid, parseISO } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SingleDatePicker } from "@/components/ui/single-date-picker"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { useToast } from "@/components/ui/use-toast"
import { formatActivityDiff } from "@/lib/codex/activityDiff"
import {
  STATUSES,
  TASK_CATEGORY_OPTIONS,
  TASK_PRIORITIES,
  isTaskCategory,
  isTaskStatus,
  statusMeta,
  type ChecklistItem,
  type CodexActivity,
  type CodexTask,
  type TaskComment,
  type TaskPriority,
  type TeamMember,
} from "@/lib/codex/types"
import {
  applyClientsFetchResult,
  fetchClientsList,
} from "@/lib/clients/fetchClientsList"
import { getClientDisplayName } from "@/lib/clients/slug"
import {
  applyChecklistToggle,
  persistChecklistToggle,
} from "@/lib/codex/checklistToggle"
import type { MbaPlanRow } from "@/lib/codex/clientMbas"
import {
  formatMinutesAsEstimate,
  parseEstimateToMinutes,
} from "@/lib/codex/estimateParse"
import { TaskChecklist } from "@/components/tasks/TaskChecklist"
import { TaskMbaSelect } from "@/components/tasks/TaskMbaSelect"

type ClientOption = {
  id: number
  mp_client_name?: string
  client_name?: string
  slug?: string
}

const UNASSIGNED = "__unassigned__"

function dueDateToFormValue(value: string | null | undefined): Date | null {
  if (!value) return null
  const raw = value.includes("T") ? value : `${value}T12:00:00`
  const d = parseISO(raw)
  return isValid(d) ? d : null
}

function dueDateToPayload(d: Date | null): string | null {
  if (!d || !isValid(d)) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function relativeTime(value: string | null | undefined): string {
  if (!value) return "—"
  const d = parseISO(value)
  if (!isValid(d)) return value
  return formatDistanceToNow(d, { addSuffix: true })
}

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "message" in body) {
    const m = (body as { message?: unknown }).message
    if (typeof m === "string" && m.trim()) return m
  }
  return fallback
}

type Props = { taskId: number }

export function TaskDetailClient({ taskId }: Props) {
  const { toast } = useToast()

  const [task, setTask] = useState<CodexTask | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)
  const [loading, setLoading] = useState(true)

  const [clients, setClients] = useState<ClientOption[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [comments, setComments] = useState<TaskComment[]>([])
  const [activity, setActivity] = useState<CodexActivity[]>([])

  const [titleDraft, setTitleDraft] = useState("")
  const [descriptionDraft, setDescriptionDraft] = useState("")
  const [estimateDraft, setEstimateDraft] = useState("")
  const [mbaPlans, setMbaPlans] = useState<MbaPlanRow[]>([])
  const [newCheckLabel, setNewCheckLabel] = useState("")
  const [newComment, setNewComment] = useState("")
  const [savingField, setSavingField] = useState<string | null>(null)
  const [addingCheck, setAddingCheck] = useState(false)
  const [addingComment, setAddingComment] = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [taskRes, checkRes, commentRes, activityRes, teamRes, clientsResult] =
        await Promise.all([
          fetch(`/api/codex/tasks/${taskId}`, { cache: "no-store" }),
          fetch(`/api/codex/tasks/${taskId}/checklist`, { cache: "no-store" }),
          fetch(`/api/codex/tasks/${taskId}/comments`, { cache: "no-store" }),
          fetch(`/api/codex/tasks/${taskId}/activity`, { cache: "no-store" }),
          fetch("/api/codex/team?active=0&per_page=100", { cache: "no-store" }),
          fetchClientsList(),
        ])

      if (taskRes.status === 403 || teamRes.status === 403) {
        setAccessDenied(true)
        return
      }
      if (taskRes.status === 404) {
        setTask(null)
        setLoadError("Task not found (it may have been deleted).")
        return
      }
      if (!taskRes.ok) {
        const body = await taskRes.json().catch(() => null)
        throw new Error(errorMessage(body, "Failed to load task"))
      }

      const taskJson = (await taskRes.json()) as CodexTask
      setTask(taskJson)
      setTitleDraft(taskJson.title ?? "")
      setDescriptionDraft(taskJson.description ?? "")
      setEstimateDraft(formatMinutesAsEstimate(taskJson.estimated_minutes) ?? "")

      if (checkRes.ok) {
        const j = (await checkRes.json()) as { items?: ChecklistItem[] }
        setChecklist(Array.isArray(j.items) ? j.items : [])
      }
      if (commentRes.ok) {
        const j = (await commentRes.json()) as { items?: TaskComment[] }
        setComments(Array.isArray(j.items) ? j.items : [])
      }
      if (activityRes.ok) {
        const j = (await activityRes.json()) as { items?: CodexActivity[] }
        setActivity(Array.isArray(j.items) ? j.items : [])
      }
      if (teamRes.ok) {
        const j = (await teamRes.json()) as { items?: TeamMember[] }
        setTeamMembers(Array.isArray(j.items) ? j.items : [])
      }
      const clientsUi = applyClientsFetchResult(clientsResult)
      setClients(clientsUi.clients as ClientOption[])
    } catch (error) {
      console.error("Task detail load failed:", error)
      setLoadError(
        error instanceof Error ? error.message : "Failed to load task"
      )
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useEffect(() => {
    const clientId = task?.client_id
    if (clientId == null || !Number.isFinite(Number(clientId)) || Number(clientId) < 1) {
      setMbaPlans([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(
          `/api/codex/client-mbas?client_id=${encodeURIComponent(String(clientId))}`,
          { cache: "no-store" },
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
                  client_id: Number(clientId),
                },
              ]
            }),
          )
          return
        }
        const numbers = Array.isArray(body.mba_numbers)
          ? body.mba_numbers.filter((n): n is string => typeof n === "string")
          : []
        setMbaPlans(
          numbers.map((mba_number) => ({
            mba_number,
            client_id: Number(clientId),
          })),
        )
      } catch {
        if (!cancelled) setMbaPlans([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [task?.client_id])

  const refreshActivity = useCallback(async () => {
    try {
      const res = await fetch(`/api/codex/tasks/${taskId}/activity`, {
        cache: "no-store",
      })
      if (!res.ok) return
      const j = (await res.json()) as { items?: CodexActivity[] }
      setActivity(Array.isArray(j.items) ? j.items : [])
    } catch {
      /* ignore background refresh */
    }
  }, [taskId])

  const patchTask = useCallback(
    async (patch: Record<string, unknown>, fieldKey: string) => {
      if (!task) return
      const previous = task
      const optimistic: CodexTask = {
        ...task,
        ...(patch.title !== undefined
          ? { title: String(patch.title) }
          : null),
        ...(patch.description !== undefined
          ? { description: patch.description as string | null }
          : null),
        ...(patch.status !== undefined
          ? { status: String(patch.status) }
          : null),
        ...(patch.priority !== undefined
          ? { priority: patch.priority as string | null }
          : null),
        ...(patch.category !== undefined
          ? { category: patch.category as string | null }
          : null),
        ...(patch.due_date !== undefined
          ? { due_date: patch.due_date as string | null }
          : null),
        ...(patch.estimated_minutes !== undefined
          ? { estimated_minutes: patch.estimated_minutes as number | null }
          : null),
        ...(patch.assignee_email !== undefined
          ? { assignee_email: patch.assignee_email as string | null }
          : null),
        ...(patch.assignee_name !== undefined
          ? { assignee_name: patch.assignee_name as string | null }
          : null),
        ...(patch.client_id !== undefined
          ? { client_id: Number(patch.client_id) }
          : null),
        ...(patch.mba_number !== undefined
          ? { mba_number: patch.mba_number as string | null }
          : null),
      }
      setTask(optimistic)
      setSavingField(fieldKey)
      try {
        const res = await fetch(`/api/codex/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(errorMessage(body, "Save failed"))
        }
        const next = (await res.json()) as CodexTask
        setTask(next)
        setTitleDraft(next.title ?? "")
        setDescriptionDraft(next.description ?? "")
        setEstimateDraft(formatMinutesAsEstimate(next.estimated_minutes) ?? "")
        void refreshActivity()
      } catch (error) {
        setTask(previous)
        setTitleDraft(previous.title ?? "")
        setDescriptionDraft(previous.description ?? "")
        setEstimateDraft(formatMinutesAsEstimate(previous.estimated_minutes) ?? "")
        toast({
          title: "Could not save",
          description:
            error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        })
      } finally {
        setSavingField(null)
      }
    },
    [task, taskId, toast, refreshActivity]
  )

  const activeMembers = useMemo(
    () => teamMembers.filter((m) => m.active),
    [teamMembers]
  )

  const checklistProgress = useMemo(() => {
    const total = checklist.length
    const done = checklist.filter((c) => c.done).length
    return { done, total }
  }, [checklist])

  const commitTitle = () => {
    const next = titleDraft.trim()
    if (!task || !next || next === task.title) {
      setTitleDraft(task?.title ?? "")
      return
    }
    void patchTask({ title: next }, "title")
  }

  const commitDescription = () => {
    if (!task) return
    const next = descriptionDraft
    if ((task.description ?? "") === next) return
    void patchTask({ description: next || null }, "description")
  }

  const addChecklistItem = async () => {
    const label = newCheckLabel.trim()
    if (!label) return
    setAddingCheck(true)
    try {
      const res = await fetch(`/api/codex/tasks/${taskId}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(errorMessage(body, "Could not add item"))
      }
      const item = (await res.json()) as ChecklistItem
      setChecklist((prev) => [...prev, item])
      setNewCheckLabel("")
      void refreshActivity()
    } catch (error) {
      toast({
        title: "Could not add checklist item",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setAddingCheck(false)
    }
  }

  const toggleCheck = async (item: ChecklistItem) => {
    const previous = checklist
    const applied = applyChecklistToggle(checklist, item.id)
    if (!applied) return
    setChecklist(applied.items)
    try {
      const updated = await persistChecklistToggle({
        taskId,
        itemId: item.id,
        done: applied.nextDone,
      })
      setChecklist((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c)),
      )
      void refreshActivity()
    } catch (error) {
      setChecklist(previous)
      toast({
        title: "Could not update checklist",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    }
  }

  const deleteCheck = async (item: ChecklistItem) => {
    const previous = checklist
    setChecklist((prev) => prev.filter((c) => c.id !== item.id))
    try {
      const res = await fetch(
        `/api/codex/tasks/${taskId}/checklist/${item.id}`,
        { method: "DELETE" }
      )
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(errorMessage(body, "Could not delete item"))
      }
      void refreshActivity()
    } catch (error) {
      setChecklist(previous)
      toast({
        title: "Could not delete checklist item",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    }
  }

  const moveCheck = async (itemId: number, direction: -1 | 1) => {
    const idx = checklist.findIndex((c) => c.id === itemId)
    if (idx < 0) return
    const j = idx + direction
    if (j < 0 || j >= checklist.length) return
    const previous = checklist
    const next = [...checklist]
    const tmp = next[idx]!
    next[idx] = next[j]!
    next[j] = tmp
    setChecklist(next.map((c, i) => ({ ...c, sort: i })))
    try {
      const res = await fetch(`/api/codex/tasks/${taskId}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordered_ids: next.map((c) => c.id) }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(errorMessage(body, "Could not reorder"))
      }
      const jbody = (await res.json()) as { items?: ChecklistItem[] }
      if (Array.isArray(jbody.items)) setChecklist(jbody.items)
      void refreshActivity()
    } catch (error) {
      setChecklist(previous)
      toast({
        title: "Could not reorder checklist",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    }
  }

  const submitComment = async () => {
    const body = newComment.trim()
    if (!body) return
    setAddingComment(true)
    try {
      const res = await fetch(`/api/codex/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => null)
        throw new Error(errorMessage(errBody, "Could not add comment"))
      }
      const comment = (await res.json()) as TaskComment
      setComments((prev) => [...prev, comment])
      setNewComment("")
      void refreshActivity()
    } catch (error) {
      toast({
        title: "Could not add comment",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setAddingComment(false)
    }
  }

  if (accessDenied) {
    return (
      <div className="w-full max-w-none space-y-6 px-4 pb-12 pt-0 md:px-6">
        <EmptyState
          title="Access denied"
          message="Codex is available to admins only."
        />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6 px-6 py-6">
        <LoadingState rows={6} />
      </div>
    )
  }

  if (loadError || !task) {
    return (
      <div className="space-y-6 px-6 py-6">
        <ErrorState
          title="Couldn't load task"
          message={loadError ?? "Not found"}
          onRetry={() => void loadAll()}
        />
      </div>
    )
  }

  const status = isTaskStatus(task.status) ? task.status : "todo"
  const priority = (task.priority as TaskPriority) || "normal"
  const category = isTaskCategory(task.category) ? task.category : "other"
  const isComplete = status === "done"

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-6 overflow-y-auto px-6 pb-10 pt-5">
      <div className="mb-5 flex items-start gap-3 pr-8">
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor="task-title" className="sr-only">
            Title
          </Label>
          <Input
            id="task-title"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur()
              }
            }}
            disabled={savingField === "title"}
            className="h-auto border-0 bg-transparent px-0 text-xl font-extrabold tracking-tight shadow-none focus-visible:ring-0"
          />
          <p className="text-xs text-muted-foreground">Task #{task.id}</p>
        </div>
        <Button
          type="button"
          variant={isComplete ? "outline" : "default"}
          size="sm"
          className="mt-1 shrink-0"
          disabled={isComplete || savingField === "status"}
          onClick={() => void patchTask({ status: "done" }, "status")}
        >
          <CheckSquare className="mr-1.5 h-4 w-4" aria-hidden />
          {isComplete ? "Completed" : "Mark complete"}
        </Button>
      </div>

      {/* Meta fields */}
      <div className="grid gap-4 rounded-card border border-border bg-card p-4 shadow-e1 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select
            value={status}
            onValueChange={(v) => {
              if (isTaskStatus(v)) void patchTask({ status: v }, "status")
            }}
            disabled={savingField === "status"}
          >
            <SelectTrigger>
              <SelectValue>
                <Badge variant={statusMeta(status).badgeVariant} size="sm">
                  {statusMeta(status).label}
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

        <div className="space-y-1.5">
          <Label>Priority</Label>
          <Select
            value={priority}
            onValueChange={(v) => void patchTask({ priority: v }, "priority")}
            disabled={savingField === "priority"}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_PRIORITIES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select
            value={category}
            onValueChange={(v) => {
              if (isTaskCategory(v)) void patchTask({ category: v }, "category")
            }}
            disabled={savingField === "category"}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_CATEGORY_OPTIONS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Due date</Label>
          <SingleDatePicker
            value={dueDateToFormValue(task.due_date)}
            onChange={(d) =>
              void patchTask(
                { due_date: dueDateToPayload(d ?? null) },
                "due_date"
              )
            }
            disabled={savingField === "due_date"}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="task-estimate">Estimate</Label>
          <Input
            id="task-estimate"
            className="num"
            placeholder="1h 30m"
            value={estimateDraft}
            onChange={(e) => setEstimateDraft(e.target.value)}
            onBlur={() => {
              const raw = estimateDraft.trim()
              if (!raw) {
                if (task.estimated_minutes != null) {
                  void patchTask({ estimated_minutes: null }, "estimate")
                }
                return
              }
              const minutes = parseEstimateToMinutes(raw)
              if (minutes == null) {
                setEstimateDraft(
                  formatMinutesAsEstimate(task.estimated_minutes) ?? ""
                )
                toast({
                  title: "Could not parse estimate",
                  description: 'Use “2h”, “45m”, or “1h 30m”.',
                  variant: "destructive",
                })
                return
              }
              if (minutes === task.estimated_minutes) {
                setEstimateDraft(formatMinutesAsEstimate(minutes) ?? "")
                return
              }
              void patchTask({ estimated_minutes: minutes }, "estimate")
            }}
            disabled={savingField === "estimate"}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Assignee</Label>
          <Select
            value={task.assignee_email?.trim() || UNASSIGNED}
            onValueChange={(v) => {
              if (v === UNASSIGNED) {
                void patchTask(
                  { assignee_email: null, assignee_name: null },
                  "assignee"
                )
                return
              }
              const m = activeMembers.find((x) => x.email === v)
              void patchTask(
                {
                  assignee_email: v,
                  assignee_name: m?.name ?? null,
                },
                "assignee"
              )
            }}
            disabled={savingField === "assignee"}
          >
            <SelectTrigger>
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
              {activeMembers.map((m) => (
                <SelectItem key={m.id} value={m.email}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Client</Label>
          <Select
            value={String(task.client_id || "")}
            onValueChange={(v) =>
              void patchTask(
                { client_id: Number(v), mba_number: null },
                "client",
              )
            }
            disabled={savingField === "client"}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select client" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {getClientDisplayName(c) || String(c.id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="sm:col-span-2">
          <TaskMbaSelect
            clientId={task.client_id > 0 ? task.client_id : null}
            value={task.mba_number ?? ""}
            plans={mbaPlans}
            disabled={savingField === "mba" || savingField === "client"}
            onChange={(mbaNumber) =>
              void patchTask({ mba_number: mbaNumber }, "mba")
            }
          />
          {task.mba_number?.trim() ? (
            <Link
              href={`/mediaplans/mba/${encodeURIComponent(task.mba_number.trim())}/edit`}
              className="mt-1.5 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Open campaign
            </Link>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            One-way link into the media plan — campaign pages do not link back
            here.
          </p>
        </div>
      </div>

      {/* Description */}
      <section className="space-y-2">
        <Label htmlFor="task-description">Description</Label>
        <Textarea
          id="task-description"
          rows={8}
          value={descriptionDraft}
          onChange={(e) => setDescriptionDraft(e.target.value)}
          onBlur={commitDescription}
          disabled={savingField === "description"}
          placeholder="Write the actual work here — context, decisions, next steps."
          className="min-h-[10rem]"
        />
      </section>

      {/* Checklist */}
      <section className="space-y-3 rounded-card border border-border bg-card p-4 shadow-e1">
        <div className="flex items-center justify-between gap-3">
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
            <CheckSquare className="h-4 w-4" aria-hidden />
            Checklist
          </h2>
          <span className="num text-sm text-muted-foreground">
            {checklistProgress.done} of {checklistProgress.total}
          </span>
        </div>
        <TaskChecklist
          items={checklist}
          onToggle={(item) => void toggleCheck(item)}
          onDelete={(item) => void deleteCheck(item)}
          onMove={(itemId, direction) => void moveCheck(itemId, direction)}
        />
        <div className="flex gap-2">
          <Input
            value={newCheckLabel}
            onChange={(e) => setNewCheckLabel(e.target.value)}
            placeholder="Add an item…"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void addChecklistItem()
              }
            }}
          />
          <Button
            type="button"
            onClick={() => void addChecklistItem()}
            disabled={addingCheck || !newCheckLabel.trim()}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        </div>
      </section>

      {/* Comments — newest last */}
      <section className="space-y-3 rounded-card border border-border bg-card p-4 shadow-e1">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
          <MessageSquare className="h-4 w-4" aria-hidden />
          Comments
        </h2>
        <ul className="space-y-3">
          {comments.length === 0 ? (
            <li className="text-sm text-muted-foreground">No comments yet.</li>
          ) : (
            comments.map((c) => (
              <li
                key={c.id}
                className="rounded-input border border-border/50 bg-muted/20 px-3 py-2"
              >
                <div className="mb-1 flex flex-wrap items-baseline gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {c.author_name || c.author_email || "Someone"}
                  </span>
                  <span>{relativeTime(c.created_at)}</span>
                  {c.author_kind === "ava" ? (
                    <Badge variant="outline" size="sm">
                      Ava
                    </Badge>
                  ) : null}
                </div>
                <p className="whitespace-pre-wrap text-sm">{c.body}</p>
              </li>
            ))
          )}
        </ul>
        <div className="space-y-2">
          <Textarea
            rows={3}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment…"
          />
          <Button
            type="button"
            onClick={() => void submitComment()}
            disabled={addingComment || !newComment.trim()}
          >
            Comment
          </Button>
        </div>
      </section>

      {/* Activity — newest first */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Activity</h2>
        <ul className="space-y-2 border-l border-border pl-4">
          {activity.length === 0 ? (
            <li className="text-sm text-muted-foreground">No activity yet.</li>
          ) : (
            activity.map((row) => {
              const lines = formatActivityDiff({
                action: row.action,
                before: row.before,
                after: row.after,
              })
              return (
                <li key={row.id} className="relative pb-3">
                  <span className="absolute -left-[1.15rem] top-1.5 h-2 w-2 rounded-full bg-muted-foreground/50" />
                  <div className="text-xs text-muted-foreground">
                    {row.actor_email || "system"} · {relativeTime(row.created_at)}
                  </div>
                  <ul className="mt-0.5 space-y-0.5">
                    {lines.map((line) => (
                      <li key={line} className="text-sm text-foreground">
                        {line}
                      </li>
                    ))}
                  </ul>
                </li>
              )
            })
          )}
        </ul>
      </section>
    </div>
  )
}
