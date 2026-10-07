"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { CheckSquare, MessageSquare, Plus } from "lucide-react"
import { useUser } from "@/components/AuthWrapper"
import { TaskAskHelpButton } from "@/components/tasks/TaskAskHelpDialog"
import { isOpenHelpChildStatus } from "@/lib/codex/helpRoster"
import { formatDistanceToNow, isValid, parseISO } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
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
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  categoryLabel,
  isTaskCategory,
  isTaskStatus,
  statusMeta,
  type ChecklistItem,
  type CodexActivity,
  type CodexPagedResponse,
  type CodexTask,
  type TaskComment,
  type TaskPriority,
  type TaskTemplate,
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
const CATEGORY_NONE = "__none__"
const NO_TEMPLATE = "__none__"
const NO_RECURRING = "__none__"

const RECURRING_OPTIONS = [
  { value: NO_RECURRING, label: "Does not recur" },
  { value: "monthly:lbd", label: "Monthly — last business day" },
  { value: "monthly:1", label: "Monthly — day 1" },
  { value: "monthly:15", label: "Monthly — day 15" },
  { value: "weekly:mon", label: "Weekly — Monday" },
  { value: "weekly:fri", label: "Weekly — Friday" },
] as const

function dueDateToFormValue(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  return isValid(date) ? date : null
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

function recoverableText(parts: Array<string | null | undefined>): string {
  return parts.filter((part) => typeof part === "string" && part.trim()).join("\n\n")
}

type TextPatch = { title?: string; description?: string | null }

function sameTextPatch(a: TextPatch, b: TextPatch): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if (a[key as keyof TextPatch] !== b[key as keyof TextPatch]) return false
  }
  return true
}

type Props = { taskId: number }

export function TaskDetailClient({ taskId }: Props) {
  const { toast } = useToast()
  const { user } = useUser()
  const meEmail = (user?.email ?? "").trim().toLowerCase() || null

  const [task, setTask] = useState<CodexTask | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)
  const [loading, setLoading] = useState(true)

  const [clients, setClients] = useState<ClientOption[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [comments, setComments] = useState<TaskComment[]>([])
  const [activity, setActivity] = useState<CodexActivity[]>([])
  const [parentChecklist, setParentChecklist] = useState<ChecklistItem[]>([])
  const [parentComments, setParentComments] = useState<TaskComment[]>([])

  const [titleDraft, setTitleDraft] = useState("")
  const [descriptionDraft, setDescriptionDraft] = useState("")
  const titleDraftRef = useRef("")
  const descriptionDraftRef = useRef("")
  const savedTextRef = useRef({ title: "", description: "" })
  const textFlightRef = useRef<TextPatch | null>(null)
  const taskRef = useRef<CodexTask | null>(null)
  const draftTaskIdRef = useRef<number | null>(null)
  const loadGen = useRef(0)
  const toastRef = useRef(toast)
  toastRef.current = toast
  const [templates, setTemplates] = useState<TaskTemplate[]>([])
  const [recurringIntent, setRecurringIntent] = useState<string | null>(null)
  const [intentTaskId, setIntentTaskId] = useState(taskId)
  if (intentTaskId !== taskId) {
    setIntentTaskId(taskId)
    setRecurringIntent(null)
  }
  const [estimateDraft, setEstimateDraft] = useState("")
  const [mbaPlans, setMbaPlans] = useState<MbaPlanRow[]>([])
  const [newCheckLabel, setNewCheckLabel] = useState("")
  const [newComment, setNewComment] = useState("")
  const [savingField, setSavingField] = useState<string | null>(null)
  const [addingCheck, setAddingCheck] = useState(false)
  const [addingComment, setAddingComment] = useState(false)

  const loadAll = useCallback(async () => {
    const gen = ++loadGen.current
    setLoading(true)
    setLoadError(null)
    try {
      const [taskRes, checkRes, commentRes, activityRes, teamRes, clientsResult, templateRes] =
        await Promise.all([
          fetch(`/api/codex/tasks/${taskId}`, { cache: "no-store" }),
          fetch(`/api/codex/tasks/${taskId}/checklist`, { cache: "no-store" }),
          fetch(`/api/codex/tasks/${taskId}/comments`, { cache: "no-store" }),
          fetch(`/api/codex/tasks/${taskId}/activity`, { cache: "no-store" }),
          fetch("/api/codex/team?active=0&per_page=100", { cache: "no-store" }),
          fetchClientsList(),
          fetch("/api/codex/templates?per_page=100", { cache: "no-store" }),
        ])

      if (gen !== loadGen.current) return
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
      if (gen !== loadGen.current) return
      const nextTitle = taskJson.title ?? ""
      const nextDescription = taskJson.description ?? ""
      const incomingId = Number(taskJson.id)
      const sameTask = draftTaskIdRef.current === incomingId
      setTask(taskJson)
      taskRef.current = taskJson
      draftTaskIdRef.current = incomingId
      if (
        !sameTask ||
        titleDraftRef.current.trim() === savedTextRef.current.title ||
        titleDraftRef.current.trim() === nextTitle
      ) {
        titleDraftRef.current = nextTitle
        setTitleDraft(nextTitle)
      }
      if (
        !sameTask ||
        descriptionDraftRef.current === savedTextRef.current.description ||
        descriptionDraftRef.current === nextDescription
      ) {
        descriptionDraftRef.current = nextDescription
        setDescriptionDraft(nextDescription)
      }
      savedTextRef.current = { title: nextTitle, description: nextDescription }
      setRecurringIntent(null)
      setEstimateDraft(formatMinutesAsEstimate(taskJson.estimated_minutes) ?? "")

      if (gen !== loadGen.current) return
      if (taskJson.parent?.id) {
        const [pCheckRes, pCommentRes] = await Promise.all([
          fetch(`/api/codex/tasks/${taskJson.parent.id}/checklist`, {
            cache: "no-store",
          }),
          fetch(`/api/codex/tasks/${taskJson.parent.id}/comments`, {
            cache: "no-store",
          }),
        ])
        if (gen !== loadGen.current) return
        if (pCheckRes.ok) {
          const j = (await pCheckRes.json()) as { items?: ChecklistItem[] }
          setParentChecklist(Array.isArray(j.items) ? j.items : [])
        } else {
          setParentChecklist([])
        }
        if (pCommentRes.ok) {
          const j = (await pCommentRes.json()) as { items?: TaskComment[] }
          setParentComments(Array.isArray(j.items) ? j.items : [])
        } else {
          setParentComments([])
        }
      } else {
        setParentChecklist([])
        setParentComments([])
      }

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
      if (templateRes.ok) {
        const data = (await templateRes.json()) as CodexPagedResponse<TaskTemplate>
        setTemplates(Array.isArray(data.items) ? data.items : [])
      } else {
        setTemplates([])
      }
    } catch (error) {
      if (gen !== loadGen.current) return
      console.error("Task detail load failed:", error)
      setLoadError(
        error instanceof Error ? error.message : "Failed to load task"
      )
    } finally {
      if (gen !== loadGen.current) return
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
      const id = Number(taskRef.current?.id ?? task.id)
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
        ...(patch.template_id !== undefined
          ? { template_id: patch.template_id as number | null }
          : null),
        ...(patch.recurring_rule !== undefined
          ? { recurring_rule: patch.recurring_rule as string | null }
          : null),
        ...(patch.client_visible !== undefined
          ? { client_visible: Boolean(patch.client_visible) }
          : null),
      }
      const gen = loadGen.current
      const textFlight: TextPatch = {}
      if (patch.title !== undefined) textFlight.title = String(patch.title)
      if (patch.description !== undefined) {
        textFlight.description =
          patch.description == null ? null : String(patch.description)
      }
      const tracksText = patch.title !== undefined || patch.description !== undefined
      if (tracksText) textFlightRef.current = textFlight

      setTask(optimistic)
      taskRef.current = optimistic
      if (patch.title !== undefined) {
        titleDraftRef.current = String(patch.title)
        setTitleDraft(titleDraftRef.current)
      }
      if (patch.description !== undefined) {
        descriptionDraftRef.current =
          patch.description == null ? "" : String(patch.description)
        setDescriptionDraft(descriptionDraftRef.current)
      }
      setSavingField(fieldKey)
      try {
        const res = await fetch(`/api/codex/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(errorMessage(body, "Save failed"))
        }
        const next = (await res.json()) as CodexTask
        if (
          textFlightRef.current &&
          sameTextPatch(textFlightRef.current, textFlight)
        ) {
          textFlightRef.current = null
        }
        const stillHere = gen === loadGen.current
        if (patch.title !== undefined) {
          const sent = String(patch.title)
          const serverTitle = next.title ?? ""
          if (savedTextRef.current.title === (previous.title ?? "") || savedTextRef.current.title === sent) {
            savedTextRef.current = { ...savedTextRef.current, title: serverTitle }
          }
          if (stillHere && titleDraftRef.current.trim() === sent) {
            titleDraftRef.current = serverTitle
            setTitleDraft(serverTitle)
          }
        }
        if (patch.description !== undefined) {
          const sent = patch.description == null ? "" : String(patch.description)
          const serverDescription = next.description ?? ""
          if (
            savedTextRef.current.description === (previous.description ?? "") ||
            savedTextRef.current.description === sent
          ) {
            savedTextRef.current = {
              ...savedTextRef.current,
              description: serverDescription,
            }
          }
          if (stillHere && descriptionDraftRef.current === sent) {
            descriptionDraftRef.current = serverDescription
            setDescriptionDraft(serverDescription)
          }
        }
        if (!stillHere) return
        setTask(next)
        taskRef.current = next
        setEstimateDraft(formatMinutesAsEstimate(next.estimated_minutes) ?? "")
        void refreshActivity()
      } catch (error) {
        if (
          textFlightRef.current &&
          sameTextPatch(textFlightRef.current, textFlight)
        ) {
          textFlightRef.current = null
        }
        const stillHere = gen === loadGen.current
        const message = error instanceof Error ? error.message : "Please try again."
        const titleSent = patch.title !== undefined ? String(patch.title) : undefined
        const descriptionSent =
          patch.description !== undefined
            ? patch.description == null
              ? ""
              : String(patch.description)
            : undefined
        const flushOwns =
          tracksText &&
          (titleSent === undefined || savedTextRef.current.title === titleSent) &&
          (descriptionSent === undefined ||
            savedTextRef.current.description === descriptionSent)
        if (stillHere && !flushOwns) {
          setTask(previous)
          taskRef.current = previous
          if (titleSent !== undefined && titleDraftRef.current.trim() === titleSent) {
            titleDraftRef.current = previous.title ?? ""
            setTitleDraft(titleDraftRef.current)
          }
          if (
            descriptionSent !== undefined &&
            descriptionDraftRef.current === descriptionSent
          ) {
            descriptionDraftRef.current = previous.description ?? ""
            setDescriptionDraft(descriptionDraftRef.current)
          }
          setEstimateDraft(formatMinutesAsEstimate(previous.estimated_minutes) ?? "")
        }
        if (!(tracksText && flushOwns)) {
          const recoverable = recoverableText([
            titleSent,
            descriptionSent === "" ? null : descriptionSent,
          ])
          toastRef.current({
            title: "Could not save",
            description: recoverable ? `${message}\n\n${recoverable}` : message,
            variant: "destructive",
          })
        }
      } finally {
        if (gen === loadGen.current) setSavingField(null)
      }
    },
    [task, taskId, toast, refreshActivity]
  )

  const flushTextDrafts = useCallback(() => {
    const current = taskRef.current
    if (!current) return
    const id = Number(current.id)
    if (!Number.isFinite(id) || id < 1) return
    const savedTitle = savedTextRef.current.title
    const savedDescription = savedTextRef.current.description
    const title = titleDraftRef.current.trim()
    const description = descriptionDraftRef.current
    const patch: TextPatch = {}
    if (title && title !== savedTitle) patch.title = title
    if (description !== savedDescription) patch.description = description || null
    if (Object.keys(patch).length === 0) return

    savedTextRef.current = {
      title: patch.title ?? savedTitle,
      description:
        patch.description !== undefined
          ? patch.description ?? ""
          : savedDescription,
    }
    const recoverable = recoverableText([
      patch.title,
      patch.description === undefined ? null : description,
    ])

    void fetch(`/api/codex/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
      keepalive: true,
    })
      .then(async (res) => {
        if (res.ok) return
        const body = await res.json().catch(() => null)
        const message = errorMessage(body, "Save failed")
        toastRef.current({
          title: "Could not save",
          description: recoverable ? `${message}\n\n${recoverable}` : message,
          variant: "destructive",
        })
      })
      .catch(() => {
        toastRef.current({
          title: "Could not save",
          description: recoverable || "Please try again.",
          variant: "destructive",
        })
      })
  }, [])

  useEffect(() => {
    return () => {
      loadGen.current += 1
      flushTextDrafts()
    }
  }, [taskId, flushTextDrafts])

  const assigneeChoices = useMemo(() => {
    const active = teamMembers.filter((member) => member.active)
    const email = task?.assignee_email?.trim() || ""
    if (!email) return active
    const current = teamMembers.find(
      (member) => member.email.toLowerCase() === email.toLowerCase()
    )
    if (current?.active) return active
    const inactive: TeamMember = current ?? {
      id: -1,
      email,
      name: task?.assignee_name?.trim() || email,
      role_title: null,
      active: false,
      capacity_notes: null,
      working_style: null,
      default_client_ids: [],
      created_at: "",
      updated_at: "",
    }
    return [
      inactive,
      ...active.filter(
        (member) => member.email.toLowerCase() !== email.toLowerCase()
      ),
    ]
  }, [teamMembers, task])

  const checklistProgress = useMemo(() => {
    const total = checklist.length
    const done = checklist.filter((c) => c.done).length
    return { done, total }
  }, [checklist])

  const commitTitle = () => {
    const current = taskRef.current
    if (!current || Number(current.id) !== Number(taskId)) return
    const next = titleDraftRef.current.trim()
    const saved = savedTextRef.current.title
    if (!next || next === saved) {
      titleDraftRef.current = saved
      setTitleDraft(saved)
      return
    }
    void patchTask({ title: next }, "title")
  }

  const commitDescription = () => {
    const current = taskRef.current
    if (!current || Number(current.id) !== Number(taskId)) return
    const next = descriptionDraftRef.current
    if (savedTextRef.current.description === next) return
    void patchTask({ description: next || null }, "description")
  }

  useEffect(() => {
    const rule = recurringIntent
    if (!rule || !task || Number(task.id) !== Number(taskId)) return
    if (
      !(task.template_id != null && Number(task.template_id) > 0) ||
      !(Number(task.client_id) > 0)
    ) {
      return
    }
    if ((task.recurring_rule ?? null) === rule) {
      setRecurringIntent(null)
      return
    }
    setRecurringIntent(null)
    void patchTask({ recurring_rule: rule }, "recurring")
  }, [recurringIntent, task, patchTask])

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
  const category = isTaskCategory(task.category) ? task.category : CATEGORY_NONE
  const recurringValue = recurringIntent ?? (task.recurring_rule?.trim() || NO_RECURRING)
  const recurringBlocked =
    recurringValue !== NO_RECURRING &&
    (!(task.template_id != null && task.template_id > 0) ||
      !(task.client_id > 0))
  const assigneeEmail = task.assignee_email?.trim() || ""
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
            onChange={(e) => {
              titleDraftRef.current = e.target.value
              setTitleDraft(e.target.value)
            }}
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
              if (v === CATEGORY_NONE) {
                void patchTask({ category: null }, "category")
                return
              }
              if (isTaskCategory(v)) void patchTask({ category: v }, "category")
            }}
            disabled={savingField === "category"}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CATEGORY_NONE}>None</SelectItem>
              {TASK_CATEGORIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {categoryLabel(value)}
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
          <div className="flex items-center justify-between gap-2">
            <Label>Assignee</Label>
            <TaskAskHelpButton
              task={task}
              members={teamMembers}
              meEmail={meEmail}
              layer="nested"
              onAsked={() => void loadAll()}
            />
          </div>
          <Select
            value={assigneeEmail || UNASSIGNED}
            onValueChange={(v) => {
              if (v === UNASSIGNED) {
                void patchTask(
                  { assignee_email: null, assignee_name: null },
                  "assignee"
                )
                return
              }
              const m = teamMembers.find(
                (member) => member.email.toLowerCase() === v.toLowerCase()
              )
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
              {assigneeChoices.map((member) => {
                const value =
                  assigneeEmail &&
                  member.email.toLowerCase() === assigneeEmail.toLowerCase()
                    ? assigneeEmail
                    : member.email
                const name = member.name?.trim() || value
                return (
                  <SelectItem key={`${member.id}-${value}`} value={value}>
                    {name}
                    {member.id !== -1 && !member.active ? " (Inactive)" : ""}
                  </SelectItem>
                )
              })}
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

      <section className="space-y-4 rounded-card border border-border bg-card p-4 shadow-e1">
        <h2 className="text-sm font-semibold">Series</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Recurring</Label>
            <Select
              value={recurringValue}
              onValueChange={(v) => {
                const next = v === NO_RECURRING ? null : v
                if (
                  next &&
                  (!(task.template_id != null && task.template_id > 0) ||
                    !(task.client_id > 0))
                ) {
                  setRecurringIntent(next)
                  return
                }
                setRecurringIntent(null)
                void patchTask({ recurring_rule: next }, "recurring")
              }}
              disabled={savingField === "recurring"}
            >
              <SelectTrigger>
                <SelectValue placeholder="Does not recur" />
              </SelectTrigger>
              <SelectContent>
                {RECURRING_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
                {recurringValue !== NO_RECURRING &&
                !RECURRING_OPTIONS.some((option) => option.value === recurringValue) ? (
                  <SelectItem value={recurringValue}>{recurringValue}</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Series seed — requires a template. Cron creates one task per
              period (Sydney).
            </p>
            {recurringBlocked ? (
              <p className="text-sm text-status-critical-fg">
                Recurring rule requires a template and a client.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>Template</Label>
            <Select
              value={
                task.template_id != null && task.template_id > 0
                  ? String(task.template_id)
                  : NO_TEMPLATE
              }
              onValueChange={(v) => {
                void patchTask(
                  { template_id: v === NO_TEMPLATE ? null : Number(v) },
                  "template"
                )
              }}
              disabled={savingField === "template"}
            >
              <SelectTrigger>
                <SelectValue placeholder="No template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TEMPLATE}>No template</SelectItem>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={String(template.id)}>
                    {template.name}
                  </SelectItem>
                ))}
                {task.template_id != null &&
                task.template_id > 0 &&
                !templates.some((template) => template.id === task.template_id) ? (
                  <SelectItem value={String(task.template_id)}>
                    Template #{task.template_id}
                  </SelectItem>
                ) : null}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Links this task to a template (does not re-copy checklist).
            </p>
          </div>
        </div>

        <div className="flex flex-row items-center justify-between rounded-input border border-border px-3 py-2">
          <div className="space-y-0.5 pr-3">
            <Label htmlFor="task-client-visible">Client visible</Label>
            <p className="text-xs text-muted-foreground">
              Client can see this task later — leave off for internal work
            </p>
          </div>
          <Switch
            id="task-client-visible"
            checked={Boolean(task.client_visible)}
            onCheckedChange={(checked) =>
              void patchTask({ client_visible: checked }, "client_visible")
            }
            disabled={savingField === "client_visible"}
            aria-label="Client visible"
          />
        </div>
      </section>

      {task.parent ? (
        <section className="space-y-3 rounded-card border border-border bg-surface-panel/50 p-4 shadow-e1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Help for</h2>
            <Link
              href={`/tasks/${task.parent.id}`}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {task.parent.title}
            </Link>
          </div>
          {task.parent.description?.trim() ? (
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {task.parent.description}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No description.</p>
          )}
          {parentChecklist.length > 0 ? (
            <ul className="space-y-1.5">
              {parentChecklist.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                  <span className="num mt-0.5">
                    {item.done ? "☑" : "☐"}
                  </span>
                  <span className={item.done ? "line-through" : ""}>
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {parentComments.length > 0 ? (
            <ul className="space-y-2">
              {parentComments.map((c) => (
                <li
                  key={c.id}
                  className="rounded-input border border-border/50 bg-card px-3 py-2"
                >
                  <div className="mb-1 text-xs text-muted-foreground">
                    {c.author_name || c.author_email || "Someone"}
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{c.body}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {(task.children ?? []).some((c) => isOpenHelpChildStatus(c.status)) ? (
        <section className="space-y-2 rounded-card border border-border bg-card p-4 shadow-e1">
          <h2 className="text-sm font-semibold">Waiting on</h2>
          <ul className="space-y-2">
            {task.children
              ?.filter((c) => isOpenHelpChildStatus(c.status))
              .map((child) => (
                <li key={child.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <Link
                    href={`/tasks/${child.id}`}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {child.assignee_name || child.assignee_email || child.title}
                  </Link>
                  <Badge variant={statusMeta(child.status).badgeVariant} size="sm">
                    {statusMeta(child.status).label}
                  </Badge>
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      {/* Description */}
      <section className="space-y-2">
        <Label htmlFor="task-description">Description</Label>
        <Textarea
          id="task-description"
          rows={8}
          value={descriptionDraft}
          onChange={(e) => {
            descriptionDraftRef.current = e.target.value
            setDescriptionDraft(e.target.value)
          }}
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
