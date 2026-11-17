"use client"

/**
 * Workload tab (B42, plan 5.5, `codex_projects`): open tasks per person by
 * week of due date, with overdue (critical), no due date and later. Counts
 * only tasks you can see. `WorkloadTable` is presentational (render-tested).
 */
import { useCallback, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import type { Workload } from "@/lib/codex/workload"

function weekLabel(start: string): string {
  const [, m, d] = start.split("-")
  return `${Number(d)}/${Number(m)}`
}

export function WorkloadTable({ data }: { data: Workload }) {
  if (data.people.length === 0) return <p className="text-sm text-muted-foreground">No active people on the team list.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Person</th>
            <th className="py-2 pr-3 text-right font-medium">Open</th>
            <th className="py-2 pr-3 text-right font-medium">Overdue</th>
            {data.weeks.map((w, i) => (
              <th key={w.start} className="py-2 pr-3 text-right font-medium" title={`${w.start} to ${w.end}`}>
                {i === 0 ? "This week" : `Week of ${weekLabel(w.start)}`}
              </th>
            ))}
            <th className="py-2 pr-3 text-right font-medium">Later</th>
            <th className="py-2 text-right font-medium">No due date</th>
          </tr>
        </thead>
        <tbody>
          {data.people.map((p) => (
            <tr key={p.email} className="border-b border-border/60">
              <td className="py-2 pr-3">{p.name}</td>
              <td className="num py-2 pr-3 text-right">{p.open}</td>
              <td className={`num py-2 pr-3 text-right ${p.overdue > 0 ? "font-semibold text-destructive" : ""}`}>{p.overdue}</td>
              {p.by_week.map((n, i) => (
                <td key={data.weeks[i].start} className="num py-2 pr-3 text-right">
                  {n}
                </td>
              ))}
              <td className="num py-2 pr-3 text-right">{p.later}</td>
              <td className="num py-2 text-right">{p.no_due}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type LoadState = { kind: "loading" } | { kind: "ready"; data: Workload } | { kind: "error"; message: string }

export function WorkloadPanel({ active }: { active: boolean }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" })
  const load = useCallback(async () => {
    setState({ kind: "loading" })
    try {
      const res = await fetch("/api/codex/workload", { cache: "no-store" })
      if (!res.ok) {
        setState({ kind: "error", message: `The workload did not load (${res.status}).` })
        return
      }
      setState({ kind: "ready", data: (await res.json()) as Workload })
    } catch {
      setState({ kind: "error", message: "Could not reach the server." })
    }
  }, [])
  useEffect(() => {
    if (active) void load()
  }, [active, load])
  return (
    <div className="space-y-3 rounded-card border border-border bg-surface-panel p-4 shadow-e0">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Workload</h2>
          <p className="text-xs text-muted-foreground">Open tasks per person by week due. Only tasks you can see are counted.</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
          Refresh
        </Button>
      </div>
      {state.kind === "loading" ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {state.kind === "error" ? <p className="text-sm text-destructive">{state.message}</p> : null}
      {state.kind === "ready" ? <WorkloadTable data={state.data} /> : null}
    </div>
  )
}
