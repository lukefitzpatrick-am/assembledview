"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckSquare,
  ListTodo,
  MessageSquare,
  Plus,
  Trash2,
} from "lucide-react"
import { formatDistanceToNow, isValid, parseISO } from "date-fns"
import { MediaPlanEditorHero } from "@/components/mediaplans/MediaPlanEditorHero"
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
import { cn } from "@/lib/utils"

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
  const [mbaDraft, setMbaDraft] = useState("")
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
      setMbaDraft(taskJson.mba_number ?? "")

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
        setMbaDraft(next.mba_number ?? "")
        void refreshActivity()
      } catch (error) {
        setTask(previous)
        setTitleDraft(previous.title ?? "")
        setDescriptionDraft(previous.description ?? "")
        setMbaDraft(previous.mba_number ?? "")
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

  const commitMba = () => {
    if (!task) return
    const next = mbaDraft.trim()
    if ((task.mba_number ?? "") === next) return
    void patchTask({ mba_number: next || null }, "mba")
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
    const nextDone = !item.done
    setChecklist((prev) =>
      prev.map((c) => (c.id === item.id ? { ...c, done: nextDone } : c))
    )
    try {
      const res = await fetch(
        `/api/codex/tasks/${taskId}/checklist/${item.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ done: nextDone }),
        }
      )
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(errorMessage(body, "Could not update item"))
      }
      const updated = (await res.json()) as ChecklistItem
      setChecklist((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c))
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
      <div className="w-full max-w-3xl space-y-6 px-4 pb-12 pt-6 md:px-6">
        <LoadingState rows={6} />
      </div>
    )
  }

  if (loadError || !task) {
    return (
      <div className="w-full max-w-3xl space-y-6 px-4 pb-12 pt-6 md:px-6">
        <Button type="button" variant="ghost" asChild>
          <Link href="/tasks">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Codex
          </Link>
        </Button>
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

  return (
    <div className="w-full max-w-3xl space-y-8 px-4 pb-16 pt-0 md:px-6">
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
        detail={<p>Task #{task.id}</p>}
        actions={
          <Button type="button" variant="outline" asChild>
            <Link href="/tasks">
              <ArrowLeft className="mr-2 h-4 w-4" />
              All tasks
            </Link>
          </Button>
        }
      />

      {/* Title */}
      <div className="space-y-2">
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
          className="h-auto border-0 bg-transparent px-0 text-2xl font-extrabold tracking-tight shadow-none focus-visible:ring-0"
        />
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
              void patchTask({ client_id: Number(v) }, "client")
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

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="task-mba">MBA number</Label>
          <Input
            id="task-mba"
            value={mbaDraft}
            onChange={(e) => setMbaDraft(e.target.value)}
            onBlur={commitMba}
            disabled={savingField === "mba"}
            className="num max-w-xs"
          />
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
        <ul className="space-y-2">
          {checklist.map((item, index) => (
            <li
              key={item.id}
              className="flex items-start gap-2 rounded-input border border-border/60 px-2 py-1.5"
            >
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => void toggleCheck(item)}
                className="mt-1 h-4 w-4 accent-primary"
                aria-label={item.label}
              />
              <span
                className={cn(
                  "min-w-0 flex-1 text-sm",
                  item.done && "text-muted-foreground line-through"
                )}
              >
                {item.label}
              </span>
              <div className="flex shrink-0 gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={index === 0}
                  onClick={() => void moveCheck(item.id, -1)}
                  aria-label="Move up"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={index === checklist.length - 1}
                  onClick={() => void moveCheck(item.id, 1)}
                  aria-label="Move down"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => void deleteCheck(item)}
                  aria-label="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
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
