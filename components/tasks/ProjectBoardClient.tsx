"use client"

/**
 * /tasks/projects/[id] (B39): loads the project board and owns its requests.
 * Card moves are optimistic and roll back when the server refuses; after a
 * 409 the board loads again so the next drag starts from fresh columns.
 * Behind codex_projects; before migration 0118 it says the database needs
 * an update and nothing else is requested.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { BulkPasteDialog, SectionDialog, type SectionDialogState } from "@/components/tasks/ProjectBoardDialogs"
import { ProjectBoardView } from "@/components/tasks/ProjectBoardView"
import { ProjectFieldsDialog } from "@/components/tasks/ProjectFieldsDialog"
import {
  cardFieldKey,
  valueLabels,
  visibleCardFields,
  type CardFieldSetting,
  type CodexCustomField,
} from "@/lib/codex/customFields"
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
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { useToast } from "@/components/ui/use-toast"
import {
  COMPLETED_PARAM,
  commitBoardMove,
  parseCompletedParam,
  reorderForMove,
  sectionColumnKey,
  sectionIdFromColumnKey,
  type BoardMove,
  type BoardState,
  type MoveResult,
} from "@/lib/codex/projectBoard"
import type { CodexProject, CodexSection, SectionStatusCategory } from "@/lib/codex/projects"
import type { CodexTask } from "@/lib/codex/types"

type ColumnPage = { items: CodexTask[]; total: number; completed: number }
type BoardResponse = {
  project: CodexProject
  sections: CodexSection[]
  columns: Record<string, ColumnPage>
  unsectioned: ColumnPage
  hide_completed: boolean
  /** B40 (older servers may leave these out). */
  fields?: CodexCustomField[]
  card_fields?: CardFieldSetting[]
}

/** The chip labels a card shows: values of the fields set to show on cards, in field order. */
export function cardChipLabels(
  fields: readonly CodexCustomField[],
  settings: readonly CardFieldSetting[],
  task: Pick<CodexTask, "custom_values">
): string[] {
  return visibleCardFields(fields, settings).flatMap((f) => valueLabels(f, task.custom_values ?? null))
}

export type BoardLoadState =
  | { kind: "loading" }
  | { kind: "needs_migration" }
  | { kind: "not_found" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: BoardResponse }

/** What a failed board load shows. 503 migration_not_applied is the 0118 message, never an error. */
export function boardLoadFailure(status: number, body: unknown): BoardLoadState {
  const error = body && typeof body === "object" ? (body as { error?: unknown }).error : null
  if (status === 503 && error === "migration_not_applied") return { kind: "needs_migration" }
  if (status === 404) return { kind: "not_found" }
  if (status === 401 || status === 403) return { kind: "error", message: "Codex is available to admins only." }
  return { kind: "error", message: `The board did not load (${status}).` }
}

async function readJson(res: Response): Promise<unknown> {
  return res.json().catch(() => null)
}

function messageOf(body: unknown, fallback: string): string {
  const m = body && typeof body === "object" ? (body as { message?: unknown }).message : null
  return typeof m === "string" && m ? m : fallback
}

const COLLAPSE_KEY = (projectId: number) => `codex.projectBoard.${projectId}.collapsed`

function readCollapsed(projectId: number): string[] | null {
  try {
    const raw = window.localStorage.getItem(COLLAPSE_KEY(projectId))
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : null
  } catch {
    return null
  }
}

function writeCollapsed(projectId: number, keys: Set<string>): void {
  try {
    window.localStorage.setItem(COLLAPSE_KEY(projectId), JSON.stringify([...keys]))
  } catch {
    // Convenience only.
  }
}

function toBoardState(data: BoardResponse): BoardState {
  const columns: Record<string, CodexTask[]> = {}
  const counts: Record<string, number> = {}
  for (const s of data.sections) {
    const page = data.columns[String(s.id)] ?? { items: [], total: 0, completed: 0 }
    columns[sectionColumnKey(s.id)] = page.items
    counts[sectionColumnKey(s.id)] = page.total
  }
  return { columns, counts }
}

export function ProjectBoardClient({ projectId }: { projectId: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const urlHide = parseCompletedParam(searchParams.get(COMPLETED_PARAM))

  const [load, setLoad] = useState<BoardLoadState>({ kind: "loading" })
  const [board, setBoard] = useState<BoardState>({ columns: {}, counts: {} })
  const boardRef = useRef(board)
  boardRef.current = board
  const [hideCompleted, setHideCompleted] = useState(true)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [loadingMoreKey, setLoadingMoreKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sectionDialog, setSectionDialog] = useState<SectionDialogState>(null)
  const [pasteSection, setPasteSection] = useState<CodexSection | null>(null)
  const [deleteSection, setDeleteSection] = useState<CodexSection | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const [fieldsOpen, setFieldsOpen] = useState(false)

  const base = `/api/codex/projects/${projectId}`
  const reload = useCallback(() => setReloadTick((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    const query = urlHide == null ? "" : `?${COMPLETED_PARAM}=${urlHide ? "hide" : "show"}`
    void (async () => {
      try {
        const res = await fetch(`${base}/board${query}`, { cache: "no-store" })
        const body = await readJson(res)
        if (cancelled) return
        if (!res.ok) {
          setLoad(boardLoadFailure(res.status, body))
          return
        }
        const data = body as BoardResponse
        setLoad({ kind: "ready", data })
        setBoard(toBoardState(data))
        setHideCompleted(data.hide_completed)
        const stored = readCollapsed(projectId)
        setCollapsed(
          new Set(stored ?? data.sections.filter((s) => s.collapsed_default).map((s) => sectionColumnKey(s.id)))
        )
      } catch {
        if (!cancelled) setLoad({ kind: "error", message: "Could not reach the server." })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [base, projectId, urlHide, reloadTick])

  const data = load.kind === "ready" ? load.data : null
  const sections = useMemo(() => data?.sections ?? [], [data])

  const liveCounts = useMemo(() => {
    const out: Record<string, number> = {}
    for (const s of sections) {
      const page = data?.columns[String(s.id)]
      out[sectionColumnKey(s.id)] = page ? (hideCompleted ? page.total + page.completed : page.total) : 0
    }
    return out
  }, [data, sections, hideCompleted])

  const completedCounts = useMemo(() => {
    const out: Record<string, number> = {}
    for (const s of sections) out[sectionColumnKey(s.id)] = hideCompleted ? data?.columns[String(s.id)]?.completed ?? 0 : 0
    return out
  }, [data, sections, hideCompleted])

  const fail = useCallback(
    (title: string, description: string) => toast({ title, description, variant: "destructive" }),
    [toast]
  )

  const sendMove = useCallback(
    async (move: BoardMove): Promise<MoveResult> => {
      const sectionId = sectionIdFromColumnKey(move.toKey)
      if (sectionId == null) return { ok: false, status: 400, message: "Unknown section." }
      const res = await fetch(`${base}/sections/${sectionId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: move.taskId, after_task_id: move.afterTaskId }),
      })
      if (res.ok) return { ok: true }
      return { ok: false, status: res.status, message: messageOf(await readJson(res), "The move was not saved.") }
    },
    [base]
  )

  const onCardMove = useCallback(
    async (_task: CodexTask, move: BoardMove) => {
      const result = await commitBoardMove(boardRef.current, move, sendMove, setBoard, { hideCompleted })
      if (result.error) fail("Card moved back", result.error)
      // A move to another column, or a 409 (this view was stale): load the board again.
      if (result.reload) reload()
    },
    [sendMove, hideCompleted, fail, reload]
  )

  const onLoadMore = useCallback(
    async (key: string) => {
      const sectionId = sectionIdFromColumnKey(key)
      if (sectionId == null) return
      setLoadingMoreKey(key)
      try {
        const offset = boardRef.current.columns[key]?.length ?? 0
        const res = await fetch(
          `${base}/sections/${sectionId}/tasks?offset=${offset}&${COMPLETED_PARAM}=${hideCompleted ? "hide" : "show"}`,
          { cache: "no-store" }
        )
        const body = await readJson(res)
        if (!res.ok) {
          fail("Could not load more", messageOf(body, `The section did not load (${res.status}).`))
          return
        }
        const page = body as { items: CodexTask[]; total: number }
        setBoard((prev) => {
          const seen = new Set((prev.columns[key] ?? []).map((t) => String(t.id)))
          return {
            columns: { ...prev.columns, [key]: [...(prev.columns[key] ?? []), ...page.items.filter((t) => !seen.has(String(t.id)))] },
            counts: { ...prev.counts, [key]: page.total },
          }
        })
      } finally {
        setLoadingMoreKey(null)
      }
    },
    [base, hideCompleted, fail]
  )

  /** Runs a section request; on success reloads the board, on failure toasts the server's message. */
  const sectionRequest = useCallback(
    async (url: string, init: RequestInit, failTitle: string): Promise<boolean> => {
      setBusy(true)
      try {
        const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } })
        if (!res.ok) {
          fail(failTitle, messageOf(await readJson(res), `The change was not saved (${res.status}).`))
          return false
        }
        reload()
        return true
      } catch {
        fail(failTitle, "Could not reach the server.")
        return false
      } finally {
        setBusy(false)
      }
    },
    [fail, reload]
  )

  const onHideCompletedChange = useCallback(
    async (hide: boolean) => {
      setHideCompleted(hide)
      let stored = false
      try {
        const res = await fetch(`${base}/board-config`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hide_completed: hide }),
        })
        stored = res.ok
      } catch {
        stored = false
      }
      const params = new URLSearchParams(searchParams.toString())
      // Stored: the link needs no setting. Not stored: the link carries it.
      if (stored) params.delete(COMPLETED_PARAM)
      else params.set(COMPLETED_PARAM, hide ? "hide" : "show")
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
      // A changed ?completed= reloads through the effect; an unchanged URL needs a reload here.
      if (stored && urlHide == null) reload()
    },
    [base, pathname, router, searchParams, urlHide, reload]
  )

  if (load.kind === "loading") return <LoadingState rows={6} />
  if (load.kind === "needs_migration") {
    return (
      <EmptyState
        title="Projects need a database update"
        message="Migration 0118 (codex_s1_projects) has not run yet. Projects and boards open once it has."
      />
    )
  }
  if (load.kind === "not_found") {
    return <EmptyState title="Project not found" message="It does not exist, or it is private and you are not a member." />
  }
  if (load.kind === "error" || !data) {
    return <ErrorState message={load.kind === "error" ? load.message : undefined} onRetry={reload} />
  }

  const pasteName = pasteSection?.name ?? ""
  const fields = data.fields ?? []
  const cardSettings = data.card_fields ?? []

  return (
    <>
      <ProjectBoardView
        project={data.project}
        sections={sections}
        board={board}
        liveCounts={liveCounts}
        completedCounts={completedCounts}
        unsectionedCount={data.unsectioned.total}
        hideCompleted={hideCompleted}
        onHideCompletedChange={(hide) => void onHideCompletedChange(hide)}
        collapsedKeys={collapsed}
        loadingMoreKey={loadingMoreKey}
        onLoadMore={(key) => void onLoadMore(key)}
        onOpenTask={(task) => router.push(`/tasks/${encodeURIComponent(String(task.id))}`)}
        onCardMove={(task, move) => void onCardMove(task, move)}
        onAddSection={() => setSectionDialog({ mode: "create" })}
        onInlineAdd={(section, title) =>
          sectionRequest(
            `${base}/sections/${section.id}/tasks/create`,
            { method: "POST", body: JSON.stringify({ titles: [title] }) },
            "Task not added"
          )
        }
        busy={busy}
        onRename={(section) => setSectionDialog({ mode: "rename", sectionId: section.id, name: section.name })}
        onMove={(section, direction) => {
          const ordered = reorderForMove(sections, section.id, direction)
          if (!ordered) return
          void sectionRequest(
            `${base}/sections/reorder`,
            { method: "POST", body: JSON.stringify({ ordered_ids: ordered }) },
            "Column not moved"
          )
        }}
        onToggleCollapse={(section) => {
          setCollapsed((prev) => {
            const next = new Set(prev)
            const key = sectionColumnKey(section.id)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            writeCollapsed(projectId, next)
            return next
          })
        }}
        onSetCategory={(section, category: SectionStatusCategory) =>
          void sectionRequest(
            `${base}/sections/${section.id}`,
            { method: "PATCH", body: JSON.stringify({ status_category: category }) },
            "Status not changed"
          )
        }
        onDelete={(section) => setDeleteSection(section)}
        onPaste={(section) => setPasteSection(section)}
        cardChips={(task) => cardChipLabels(fields, cardSettings, task)}
        onOpenFields={() => setFieldsOpen(true)}
      />

      <ProjectFieldsDialog
        open={fieldsOpen}
        onClose={() => setFieldsOpen(false)}
        fields={fields}
        cardFields={cardSettings}
        busy={busy}
        onCreate={(input) => sectionRequest(`${base}/fields`, { method: "POST", body: JSON.stringify(input) }, "Field not added")}
        onUpdate={(fieldId, patch) =>
          sectionRequest(`${base}/fields/${fieldId}`, { method: "PATCH", body: JSON.stringify(patch) }, "Field not saved")
        }
        onDelete={(fieldId) => void sectionRequest(`${base}/fields/${fieldId}`, { method: "DELETE" }, "Field not deleted")}
        onToggleCard={(fieldId, show) => {
          const key = cardFieldKey(fieldId)
          const next = [...cardSettings.filter((c) => c.key !== key), { key, show }]
          void sectionRequest(`${base}/card-fields`, { method: "PUT", body: JSON.stringify({ card_fields: next }) }, "Card setting not saved")
        }}
      />

      <SectionDialog
        state={sectionDialog}
        saving={busy}
        onClose={() => setSectionDialog(null)}
        onSubmit={async (value) => {
          const ok =
            sectionDialog?.mode === "rename"
              ? await sectionRequest(
                  `${base}/sections/${sectionDialog.sectionId}`,
                  { method: "PATCH", body: JSON.stringify({ name: value.name }) },
                  "Section not renamed"
                )
              : await sectionRequest(
                  `${base}/sections`,
                  { method: "POST", body: JSON.stringify(value) },
                  "Section not added"
                )
          if (ok) setSectionDialog(null)
        }}
      />

      <BulkPasteDialog
        sectionName={pasteName}
        open={pasteSection != null}
        saving={busy}
        onClose={() => setPasteSection(null)}
        onSubmit={async (titles) => {
          if (!pasteSection) return
          const ok = await sectionRequest(
            `${base}/sections/${pasteSection.id}/tasks/create`,
            { method: "POST", body: JSON.stringify({ titles }) },
            "Tasks not added"
          )
          if (ok) {
            toast({ title: `${titles.length} task${titles.length === 1 ? "" : "s"} added to ${pasteSection.name}` })
            setPasteSection(null)
          }
        }}
      />

      <AlertDialog open={deleteSection != null} onOpenChange={(o) => (!o ? setDeleteSection(null) : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteSection?.name}?</AlertDialogTitle>
            <AlertDialogDescription>The section is empty. Deleting it cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const section = deleteSection
                setDeleteSection(null)
                if (section) {
                  void sectionRequest(`${base}/sections/${section.id}`, { method: "DELETE" }, "Section not deleted")
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
