"use client"

/**
 * Task detail for project tasks (B40, plan 4.4 steps 2 to 4, mock "task
 * detail"): project and section, start date, assigned by, milestone, custom
 * field values and subtasks. Shown inside TaskDetailClient with
 * codex_projects on. Status, priority (ASAP too), assignee, due date and
 * description stay in the detail's own fields; every change here goes to the
 * server and the detail reloads after it.
 *
 * Before migration 0118 the API answers 503 and this panel renders nothing.
 */
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowDown, ArrowUp, ListTree, Plus, Trash2 } from "lucide-react"
import { isValid } from "date-fns"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SingleDatePicker } from "@/components/ui/single-date-picker"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"
import { valueIds, type CodexCustomField, type CustomValues } from "@/lib/codex/customFields"
import { formatDueYmd } from "@/lib/codex/dueDate"
import { sectionCategoryLabel } from "@/lib/codex/projectBoard"
import type { CodexProject, CodexSection } from "@/lib/codex/projects"
import { rosterDisplayName } from "@/lib/codex/rosterResolve"
import type { TeamMember } from "@/lib/codex/types"
import { cn } from "@/lib/utils"

export type SubtaskRow = {
  id: number
  title: string
  status: string
  assignee_email: string | null
  assignee_name: string | null
  start_on: string | null
  due_on: string | null
  sort_order: number | null
}

export type TaskProjectDetailData = {
  task: {
    id: number
    task_type: string
    parent_task_id: number | null
    project_id: number | null
    section_id: number | null
    assigned_by_email: string | null
    start_on: string | null
    due_on: string | null
    custom_values: CustomValues
  }
  project: CodexProject | null
  project_hidden: boolean
  sections: CodexSection[]
  fields: CodexCustomField[]
  subtasks: SubtaskRow[]
  parent: { id: number; title: string } | null
}

const NONE = "__none__"

function ymdToDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  return isValid(date) ? date : null
}

function dateToYmd(d: Date | null | undefined): string | null {
  if (!d || !isValid(d)) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function personName(email: string | null, members: readonly TeamMember[], meEmail: string | null): string {
  if (!email) return ""
  if (meEmail && email.toLowerCase() === meEmail.toLowerCase()) return "You"
  const m = members.find((x) => x.email.toLowerCase() === email.toLowerCase())
  return rosterDisplayName({ name: m?.name ?? null, email })
}

export type TaskProjectPanelViewProps = {
  data: TaskProjectDetailData
  members: readonly TeamMember[]
  meEmail: string | null
  busy?: boolean
  onMoveSection: (sectionId: number) => void
  onStartDate: (ymd: string | null) => void
  onMilestone: (on: boolean) => void
  onFieldValue: (fieldId: number, value: string | string[] | null) => void
  onAddSubtask: (title: string, assigneeEmail: string | null) => Promise<boolean>
  onToggleSubtask: (subtask: SubtaskRow) => void
  onDeleteSubtask: (subtask: SubtaskRow) => void
  onMoveSubtask: (subtask: SubtaskRow, direction: -1 | 1) => void
}

/** Presentational (render-tested). */
export function TaskProjectPanelView(props: TaskProjectPanelViewProps) {
  const { data, members, meEmail, busy = false } = props
  const { task, project, sections, fields, subtasks, parent } = data
  const isSubtask = task.task_type === "subtask"
  const [newTitle, setNewTitle] = useState("")
  const [newAssignee, setNewAssignee] = useState<string>(NONE)
  const [adding, setAdding] = useState(false)
  const done = subtasks.filter((s) => s.status === "done").length
  const assignedBy = personName(task.assigned_by_email, members, meEmail)

  const addSubtask = async () => {
    const title = newTitle.trim()
    if (!title || adding) return
    setAdding(true)
    const ok = await props.onAddSubtask(title, newAssignee === NONE ? null : newAssignee)
    setAdding(false)
    if (ok) setNewTitle("")
  }

  return (
    <section aria-label="Project details" className="space-y-4 rounded-card border border-border bg-card p-4 shadow-e1">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {project ? (
          <Link href={`/tasks/projects/${project.id}`} className="font-semibold text-foreground hover:underline">
            {project.name}
          </Link>
        ) : data.project_hidden ? (
          <span className="text-muted-foreground">In a private project you are not a member of.</span>
        ) : (
          <span className="text-muted-foreground">Not in a project. Add it from a project board.</span>
        )}
        {task.task_type === "milestone" ? <Badge variant="info" size="sm">Milestone</Badge> : null}
        {isSubtask && parent ? (
          <Link
            href={`/tasks/${parent.id}`}
            className="inline-flex items-center rounded-pill border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Subtask of {parent.title}
          </Link>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {project && !isSubtask ? (
          <div className="space-y-1.5">
            <Label>Section</Label>
            <Select
              value={task.section_id != null ? String(task.section_id) : NONE}
              onValueChange={(v) => {
                if (v !== NONE) props.onMoveSection(Number(v))
              }}
              disabled={busy}
            >
              <SelectTrigger aria-label="Section">
                <SelectValue placeholder="No section" />
              </SelectTrigger>
              <SelectContent>
                {task.section_id == null ? <SelectItem value={NONE}>No section</SelectItem> : null}
                {sections.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name} · {sectionCategoryLabel(s.status_category)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Moving section sets the status.</p>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label>Start date</Label>
          <SingleDatePicker
            value={ymdToDate(task.start_on)}
            onChange={(d) => props.onStartDate(dateToYmd(d ?? null))}
            disabled={busy}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Assigned by</Label>
          <p className="text-sm text-foreground" data-testid="assigned-by">
            {assignedBy || <span className="text-muted-foreground">Not set</span>}
          </p>
        </div>

        {!isSubtask ? (
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={task.task_type === "milestone"}
              onCheckedChange={(on) => props.onMilestone(on)}
              disabled={busy}
              aria-label="Milestone"
            />
            Milestone
          </label>
        ) : null}
      </div>

      {fields.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => {
            const held = valueIds(task.custom_values, field.id)
            if (field.field_type === "single_select") {
              return (
                <div key={field.id} className="space-y-1.5">
                  <Label>{field.name}</Label>
                  <Select
                    value={held[0] ?? NONE}
                    onValueChange={(v) => props.onFieldValue(field.id, v === NONE ? null : v)}
                    disabled={busy}
                  >
                    <SelectTrigger aria-label={field.name}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {field.options.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )
            }
            return (
              <div key={field.id} className="space-y-1.5">
                <Label>{field.name}</Label>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={field.name}>
                  {field.options.map((o) => {
                    const on = held.includes(o.id)
                    return (
                      <button
                        key={o.id}
                        type="button"
                        aria-pressed={on}
                        disabled={busy}
                        onClick={() =>
                          props.onFieldValue(field.id, on ? held.filter((id) => id !== o.id) : [...held, o.id])
                        }
                        className={cn(
                          "rounded-pill border px-2 py-0.5 text-xs",
                          on ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"
                        )}
                      >
                        {o.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      {!isSubtask && !data.project_hidden ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <ListTree className="h-4 w-4" aria-hidden />
              Subtasks
            </h3>
            {subtasks.length > 0 ? (
              <span className="num text-xs text-muted-foreground">
                {done} of {subtasks.length} done
              </span>
            ) : null}
          </div>
          {subtasks.length > 0 ? (
            <ul className="divide-y divide-border rounded-card border border-border">
              {subtasks.map((s, i) => (
                <li key={s.id} className="flex items-center gap-2 px-2 py-1.5">
                  <Checkbox
                    checked={s.status === "done"}
                    onCheckedChange={() => props.onToggleSubtask(s)}
                    disabled={busy}
                    aria-label={`Complete ${s.title}`}
                  />
                  <Link
                    href={`/tasks/${s.id}`}
                    className={cn("min-w-0 flex-1 truncate text-sm hover:underline", s.status === "done" && "text-muted-foreground line-through")}
                  >
                    {s.title}
                  </Link>
                  <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                    {s.assignee_email ? personName(s.assignee_email, members, meEmail) : "Unassigned"}
                  </span>
                  {s.due_on ? <span className="num text-xs text-muted-foreground">{formatDueYmd(s.due_on)}</span> : null}
                  <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label={`Move ${s.title} up`} disabled={busy || i === 0} onClick={() => props.onMoveSubtask(s, -1)}>
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label={`Move ${s.title} down`} disabled={busy || i === subtasks.length - 1} onClick={() => props.onMoveSubtask(s, 1)}>
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label={`Delete ${s.title}`} disabled={busy} onClick={() => props.onDeleteSubtask(s)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void addSubtask()
                }
              }}
              placeholder="Add a subtask"
              aria-label="New subtask"
              disabled={adding || busy}
              className="min-w-[12rem] flex-1"
            />
            <Select value={newAssignee} onValueChange={setNewAssignee} disabled={adding || busy}>
              <SelectTrigger className="w-44" aria-label="New subtask assignee">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Unassigned</SelectItem>
                {members
                  .filter((m) => m.active)
                  .map((m) => (
                    <SelectItem key={m.id} value={m.email}>
                      {rosterDisplayName({ name: m.name, email: m.email })}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button type="button" size="sm" variant="outline" onClick={() => void addSubtask()} disabled={adding || busy || !newTitle.trim()}>
              <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
              Add
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

async function readJson(res: Response): Promise<unknown> {
  return res.json().catch(() => null)
}

function messageOf(body: unknown, fallback: string): string {
  const m = body && typeof body === "object" ? (body as { message?: unknown }).message : null
  return typeof m === "string" && m ? m : fallback
}

/** Loads the panel's data and owns its requests. Renders nothing before 0118 or on a load failure. */
export function TaskProjectPanel({
  taskId,
  members,
  meEmail,
  reloadKey,
  onChanged,
  onLoaded,
}: {
  taskId: number
  members: readonly TeamMember[]
  meEmail: string | null
  /** Changes when the detail reloads, so the panel reloads too. */
  reloadKey?: unknown
  onChanged: () => void
  /** B40fix: true once the read answers (0118 applied), false on 503 or any failure. */
  onLoaded?: (loaded: boolean) => void
}) {
  const { toast } = useToast()
  const [data, setData] = useState<TaskProjectDetailData | null>(null)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/codex/tasks/${taskId}/project`, { cache: "no-store" })
        if (!res.ok) {
          if (!cancelled) {
            setData(null)
            onLoaded?.(false)
          }
          return
        }
        const body = (await res.json()) as TaskProjectDetailData
        if (!cancelled) {
          setData(body)
          onLoaded?.(true)
        }
      } catch {
        if (!cancelled) {
          setData(null)
          onLoaded?.(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [taskId, tick, reloadKey, onLoaded])

  const run = useCallback(
    async (url: string, init: RequestInit, failTitle: string): Promise<boolean> => {
      setBusy(true)
      try {
        const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } })
        if (!res.ok) {
          toast({ title: failTitle, description: messageOf(await readJson(res), `Not saved (${res.status}).`), variant: "destructive" })
          return false
        }
        setTick((n) => n + 1)
        onChanged()
        return true
      } catch {
        toast({ title: failTitle, description: "Could not reach the server.", variant: "destructive" })
        return false
      } finally {
        setBusy(false)
      }
    },
    [toast, onChanged]
  )

  if (!data) return null
  const patchTask = (id: number, body: unknown, failTitle: string) =>
    run(`/api/codex/tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) }, failTitle)

  return (
    <TaskProjectPanelView
      data={data}
      members={members}
      meEmail={meEmail}
      busy={busy}
      onMoveSection={(sectionId) => {
        if (!data.project) return
        void run(
          `/api/codex/projects/${data.project.id}/sections/${sectionId}/tasks`,
          { method: "POST", body: JSON.stringify({ task_id: taskId }) },
          "Section not changed"
        )
      }}
      onStartDate={(ymd) => void patchTask(taskId, { start_on: ymd }, "Start date not saved")}
      onMilestone={(on) => void patchTask(taskId, { task_type: on ? "milestone" : "task" }, "Not saved")}
      onFieldValue={(fieldId, value) => void patchTask(taskId, { custom_values: { [String(fieldId)]: value } }, "Field not saved")}
      onAddSubtask={(title, assigneeEmail) =>
        run(
          `/api/codex/tasks/${taskId}/subtasks`,
          { method: "POST", body: JSON.stringify({ title, assignee_email: assigneeEmail }) },
          "Subtask not added"
        )
      }
      onToggleSubtask={(s) => void patchTask(s.id, { status: s.status === "done" ? "todo" : "done" }, "Subtask not saved")}
      onDeleteSubtask={(s) => void run(`/api/codex/tasks/${s.id}`, { method: "DELETE" }, "Subtask not deleted")}
      onMoveSubtask={(s, direction) => {
        const ids = data.subtasks.map((x) => x.id)
        const at = ids.indexOf(s.id)
        const to = at + direction
        if (at < 0 || to < 0 || to >= ids.length) return
        ;[ids[at], ids[to]] = [ids[to], ids[at]]
        void run(`/api/codex/tasks/${taskId}/subtasks/reorder`, { method: "POST", body: JSON.stringify({ ordered_ids: ids }) }, "Order not saved")
      }}
    />
  )
}
