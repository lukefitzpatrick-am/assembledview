"use client"

/**
 * Codex containment (C-200, B44, switch `codex_contained_writes`): /tasks opens
 * a new task or Ask for help from a link made on another page (pacing campaign
 * detail, the scenario planner, the creative admin landing).
 *
 * The link's params are read once (`parseTasksComposeParams`), checked against
 * the client list and the client's campaigns (`resolveComposePrefill`), and
 * shown in the usual dialog. Nothing is written on load: the person presses
 * Save or Send, and the write goes through the usual /api/codex route. What
 * was left out shows as a quiet note.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { TaskAskHelpDialog } from "@/components/tasks/TaskAskHelpDialog"
import { TaskFormDialog, type TaskFormCreatePrefill } from "@/components/tasks/TaskFormDialog"
import { useToast } from "@/components/ui/use-toast"
import { fetchClientsList } from "@/lib/clients/fetchClientsList"
import {
  parseTasksComposeParams,
  resolveComposePrefill,
  type TasksComposePrefill,
} from "@/lib/codex/composeLink"
import type { CodexTask, TaskTemplate, TeamMember } from "@/lib/codex/types"

type ClientOption = {
  id: number
  mp_client_name?: string
  client_name?: string
}

type ParamSource = { get(name: string): string | null; getAll(name: string): string[] }

type Opened =
  | { kind: "none" }
  | { kind: "task"; prefill: TaskFormCreatePrefill }
  | { kind: "help"; task: CodexTask; note: string }

function toFormPrefill(prefill: TasksComposePrefill): TaskFormCreatePrefill {
  return {
    title: prefill.title,
    description: prefill.description,
    client_id: prefill.clientId,
    mba_number: prefill.mbaNumber,
    category: prefill.category,
  }
}

async function readClientIds(): Promise<Set<number> | null> {
  const result = await fetchClientsList<{ id?: unknown }>()
  if (!result.ok) return null
  const ids = new Set<number>()
  for (const row of result.data) {
    const id = Number(row?.id)
    if (Number.isInteger(id) && id > 0) ids.add(id)
  }
  return ids
}

async function readClientMbas(clientId: number): Promise<Set<string> | null> {
  try {
    const res = await fetch(`/api/codex/client-mbas?client_id=${encodeURIComponent(String(clientId))}`, {
      cache: "no-store",
    })
    if (!res.ok) return null
    const body = (await res.json()) as { mba_numbers?: unknown; campaigns?: Array<{ mba_number?: unknown }> }
    const out = new Set<string>()
    if (Array.isArray(body.campaigns)) {
      for (const c of body.campaigns) if (typeof c?.mba_number === "string") out.add(c.mba_number)
    }
    if (Array.isArray(body.mba_numbers)) {
      for (const n of body.mba_numbers) if (typeof n === "string") out.add(n)
    }
    return out
  } catch {
    return null
  }
}

/** The campaign's task to ask help on: the first top-level task on the MBA you can see (as the old pacing dialog). */
async function readParentTask(mbaNumber: string): Promise<CodexTask | null> {
  try {
    const res = await fetch(`/api/codex/tasks?mba_number=${encodeURIComponent(mbaNumber)}&per_page=20`, {
      cache: "no-store",
    })
    if (!res.ok) return null
    const body = (await res.json()) as { items?: unknown }
    const items = Array.isArray(body.items) ? (body.items as CodexTask[]) : []
    return items.find((row) => row.parent_task_id == null) ?? null
  } catch {
    return null
  }
}

export function TasksComposeFromLink({
  params,
  clients,
  teamMembers,
  templates,
  meEmail,
  onSaved,
  onConsumed,
}: {
  /** The page's query string when it loaded (read once). */
  params: ParamSource
  clients: ClientOption[]
  teamMembers: TeamMember[]
  templates?: TaskTemplate[]
  meEmail: string | null
  onSaved: () => void
  /** Called once the dialog has opened, so the page can drop the params from the URL. */
  onConsumed?: () => void
}) {
  const { toast } = useToast()
  const parsed = useMemo(() => parseTasksComposeParams(params), [params])
  const started = useRef(false)
  const [opened, setOpened] = useState<Opened>({ kind: "none" })

  useEffect(() => {
    if (!parsed.compose || started.current) return
    started.current = true
    let cancelled = false
    void (async () => {
      const clientIds = parsed.prefill.clientId != null ? await readClientIds() : new Set<number>()
      const clientKnown = parsed.prefill.clientId != null && clientIds != null && clientIds.has(parsed.prefill.clientId)
      const mbas =
        clientKnown && parsed.prefill.mbaNumber != null ? await readClientMbas(parsed.prefill.clientId!) : null
      const resolved = resolveComposePrefill(parsed, { clientIds, mbasForClient: mbas })
      const notes = [...resolved.notes]
      let next: Opened = { kind: "task", prefill: toFormPrefill(resolved.prefill) }
      if (resolved.compose === "help") {
        const mba = resolved.prefill.mbaNumber
        const parent = mba ? await readParentTask(mba) : null
        if (parent) {
          next = { kind: "help", task: parent, note: `Asking for help on "${parent.title}" (${mba}).` }
        } else {
          notes.push(
            mba
              ? `No task you can see is attached to ${mba} yet. Create one here, then ask for help from it.`
              : "No campaign task to ask for help on. Create one here, then ask for help from it.",
          )
        }
      }
      if (cancelled) return
      setOpened(next)
      if (notes.length > 0) {
        toast({ title: "Some details from the link were left out", description: notes.join(" ") })
      }
      onConsumed?.()
    })()
    return () => {
      cancelled = true
    }
    // Read once per page load: the link's params, not later URL changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed])

  const close = (open: boolean) => {
    if (!open) setOpened({ kind: "none" })
  }

  if (opened.kind === "help") {
    return (
      <TaskAskHelpDialog
        open
        onOpenChange={close}
        task={opened.task}
        members={teamMembers}
        meEmail={meEmail}
        note={opened.note}
        onAsked={() => onSaved()}
      />
    )
  }
  return (
    <TaskFormDialog
      open={opened.kind === "task"}
      onOpenChange={close}
      task={null}
      clients={clients}
      teamMembers={teamMembers}
      templates={templates}
      createPrefill={opened.kind === "task" ? opened.prefill : null}
      onSaved={onSaved}
    />
  )
}
