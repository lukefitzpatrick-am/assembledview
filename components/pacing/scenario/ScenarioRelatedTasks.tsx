"use client"

/**
 * Read-only Codex panel for the scenario planner (B44, C-200, switch
 * `codex_contained_writes`): the campaign's tasks, each linking into /tasks.
 *
 * Reads `GET /api/codex/tasks?mba_number=`, which applies the one visibility
 * rule (B42, C-211): tasks in a private project the person cannot see never
 * come back. Staff gates are the route's own (admins only today, decision 3 B);
 * any refusal shows a quiet line. This panel never writes: acting happens in
 * /tasks.
 */
import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { formatDueYmd } from "@/lib/codex/dueDate"
import { codexGet } from "@/lib/codex/readFetch"
import { statusMeta, type CodexTask } from "@/lib/codex/types"

export const SCENARIO_RELATED_TASKS_LIMIT = 10

type Loaded =
  | { state: "loading" }
  | { state: "unavailable" }
  | { state: "ready"; items: CodexTask[]; total: number }

export function ScenarioRelatedTasks({ mba }: { mba: string }) {
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" })

  useEffect(() => {
    const mbaNumber = mba.trim()
    if (!mbaNumber) {
      setLoaded({ state: "ready", items: [], total: 0 })
      return
    }
    let cancelled = false
    setLoaded({ state: "loading" })
    const qs = new URLSearchParams({ mba_number: mbaNumber, per_page: String(SCENARIO_RELATED_TASKS_LIMIT) })
    codexGet(`tasks?${qs.toString()}`, { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = (await res.json()) as { items?: unknown; itemsTotal?: unknown }
        const items = Array.isArray(body.items) ? (body.items as CodexTask[]) : []
        const total =
          typeof body.itemsTotal === "number" && Number.isFinite(body.itemsTotal) ? body.itemsTotal : items.length
        if (!cancelled) setLoaded({ state: "ready", items, total })
      })
      .catch(() => {
        if (!cancelled) setLoaded({ state: "unavailable" })
      })
    return () => {
      cancelled = true
    }
  }, [mba])

  return (
    <section aria-label="Tasks for this campaign" className="space-y-2">
      <h3 className="text-sm font-medium text-foreground">Tasks for this campaign</h3>
      {loaded.state === "loading" ? (
        <p className="text-xs text-muted-foreground">Loading tasks…</p>
      ) : loaded.state === "unavailable" ? (
        <p className="text-xs text-muted-foreground">Tasks are not available here.</p>
      ) : loaded.items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No tasks on this campaign yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-card border border-border text-sm">
          {loaded.items.map((task) => (
            <li key={task.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <a href={`/tasks/${task.id}`} className="min-w-0 flex-1 truncate text-foreground hover:underline">
                {task.title}
              </a>
              <Badge variant={statusMeta(String(task.status)).badgeVariant} size="sm">
                {statusMeta(String(task.status)).label}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {task.assignee_name || task.assignee_email || "Unassigned"}
              </span>
              <span className="num text-xs text-muted-foreground">{formatDueYmd(task.due_date ?? null)}</span>
            </li>
          ))}
        </ul>
      )}
      {loaded.state === "ready" && loaded.total > loaded.items.length ? (
        <p className="text-xs text-muted-foreground">
          Showing {loaded.items.length} of {loaded.total}. Open in Tasks for the rest.
        </p>
      ) : null}
    </section>
  )
}
