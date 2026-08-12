"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AdminGuard } from "@/components/guards/AdminGuard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ViewStateBoundary } from "@/components/ui/ViewStateBoundary"
import { useToast } from "@/components/ui/use-toast"
import { getRouteByExactPath } from "@/lib/nav/routeManifest"
import { resolveListViewState } from "@/lib/ui/viewState"
import { minutesToHours } from "@/lib/myhours/hoursMath"

type UnmappedGroup = {
  myhours_project_id: string | null
  myhours_project_name: string | null
  myhours_task_id: string | null
  myhours_task_name: string | null
  entry_count: number
  duration_minutes: number
}

type MappingReport = {
  week_start: string
  week_end: string
  scope: string
  unknown_user_count?: number
  last_sync_finished_at?: string | null
  last_sync_error?: string | null
  groups: UnmappedGroup[]
}

function MyHoursMappingInner() {
  const pageLabel =
    getRouteByExactPath("/admin/myhours-mapping")?.label ?? "MyHours mapping"
  const { toast } = useToast()
  const [report, setReport] = useState<MappingReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [mbaByKey, setMbaByKey] = useState<Record<string, string>>({})
  const [clientByKey, setClientByKey] = useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const retry = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const res = await fetch("/api/admin/myhours-mapping")
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string
          } | null
          throw new Error(body?.error || `HTTP ${res.status}`)
        }
        const data = (await res.json()) as MappingReport
        if (!cancelled) setReport(data)
      } catch (e) {
        if (!cancelled) {
          setReport(null)
          setError(e instanceof Error ? e.message : "Failed to load")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const groups = report?.groups ?? []

  const viewState = useMemo(
    () =>
      resolveListViewState({
        loading,
        error,
        items: groups,
        visible: groups,
        filtersActive: false,
        clear: () => {},
        retry,
      }),
    [error, groups, loading, retry]
  )

  const groupKey = (g: UnmappedGroup) =>
    `${g.myhours_project_id ?? ""}::${g.myhours_task_id ?? ""}`

  const assign = async (g: UnmappedGroup) => {
    const key = groupKey(g)
    setSavingKey(key)
    try {
      const mba = (mbaByKey[key] ?? "").trim()
      const clientRaw = (clientByKey[key] ?? "").trim()
      const client_id = clientRaw ? Number(clientRaw) : null
      const res = await fetch("/api/admin/myhours-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          myhours_project_id: g.myhours_project_id,
          myhours_task_id: g.myhours_task_id,
          mba_number: mba || null,
          client_id:
            client_id != null && Number.isFinite(client_id) ? client_id : null,
        }),
      })
      if (!res.ok) throw new Error("Assign failed")
      const body = (await res.json()) as { updated?: number }
      toast({
        title: "Mapped",
        description: `Updated ${body.updated ?? 0} entries to manual.`,
      })
      setReloadKey((k) => k + 1)
    } catch (e) {
      toast({
        title: "Couldn’t map",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      })
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className="w-full max-w-none space-y-6 px-4 pb-12 pt-6 md:px-6 md:pt-8">
      <div className="space-y-1">
        <h1 className="text-[26px] font-extrabold tracking-tight text-foreground">
          {pageLabel}
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Unmapped MyHours entries for the current Sydney week
          {report
            ? ` (${report.week_start} – ${report.week_end})`
            : ""}. Assign a client/MBA to backfill with mapping source manual.
        </p>
      </div>

      {report && (report.unknown_user_count ?? 0) > 0 ? (
        <div
          className="rounded-card border border-border bg-surface-panel px-4 py-3 text-sm shadow-e0"
          role="status"
        >
          <p className="text-foreground">
            <span className="num font-semibold">
              {report.unknown_user_count}
            </span>{" "}
            activity{" "}
            {(report.unknown_user_count ?? 0) === 1 ? "user" : "users"} missing
            from MyHours Users/getAll on the last sync — entries skipped (not
            silently dropped).
          </p>
        </div>
      ) : null}

      {report?.last_sync_error ? (
        <div
          className="rounded-card border border-border bg-status-blocking-bg px-4 py-3 text-sm text-status-blocking-fg shadow-e0"
          role="alert"
        >
          Last sync error: {report.last_sync_error}
        </div>
      ) : null}

      <ViewStateBoundary
        state={viewState}
        errorTitle="Couldn't load unmapped time"
        emptyTitle="No unmapped entries this week"
        emptyMessage="All mirrored time for this Sydney week is mapped."
        loadingRows={4}
      >
        {() => (
          <div className="overflow-hidden rounded-card border border-border bg-card shadow-e1">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow className="hover:bg-muted/20">
                    <TableHead>Project</TableHead>
                    <TableHead>Task</TableHead>
                    <TableHead className="text-right">Entries</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead>MBA</TableHead>
                    <TableHead>Client id</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody className="[&_tr:nth-child(even)]:bg-muted/5">
                  {groups.map((g) => {
                    const key = groupKey(g)
                    return (
                      <TableRow key={key} className="border-b border-border/20">
                        <TableCell>
                          {g.myhours_project_name || g.myhours_project_id || "—"}
                        </TableCell>
                        <TableCell>
                          {g.myhours_task_name || g.myhours_task_id || "—"}
                        </TableCell>
                        <TableCell className="num text-right">
                          {g.entry_count}
                        </TableCell>
                        <TableCell className="num text-right">
                          {minutesToHours(g.duration_minutes)}
                        </TableCell>
                        <TableCell>
                          <Label className="sr-only" htmlFor={`mba-${key}`}>
                            MBA
                          </Label>
                          <Input
                            id={`mba-${key}`}
                            className="h-8 w-28"
                            placeholder="mba…"
                            value={mbaByKey[key] ?? ""}
                            onChange={(e) =>
                              setMbaByKey((prev) => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Label className="sr-only" htmlFor={`client-${key}`}>
                            Client id
                          </Label>
                          <Input
                            id={`client-${key}`}
                            className="h-8 w-24"
                            placeholder="id"
                            value={clientByKey[key] ?? ""}
                            onChange={(e) =>
                              setClientByKey((prev) => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            size="sm"
                            disabled={savingKey === key}
                            onClick={() => void assign(g)}
                          >
                            Assign
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </ViewStateBoundary>
    </div>
  )
}

export default function MyHoursMappingPage() {
  return (
    <AdminGuard>
      <MyHoursMappingInner />
    </AdminGuard>
  )
}
