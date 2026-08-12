"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { AdminGuard } from "@/components/guards/AdminGuard"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { LoadingState } from "@/components/ui/states"
import { ViewStateBoundary } from "@/components/ui/ViewStateBoundary"
import { getRouteByExactPath } from "@/lib/nav/routeManifest"
import type { M365ReconciliationReport } from "@/lib/m365/reconciliation"
import { resolveListViewState } from "@/lib/ui/viewState"
import { cn } from "@/lib/utils"

function dash(v: string | null | undefined): string {
  if (v == null || String(v).trim() === "") return "—"
  return String(v)
}

function M365ReconciliationPageInner() {
  const pageLabel =
    getRouteByExactPath("/admin/m365-reconciliation")?.label ??
    "M365 reconciliation"
  const [report, setReport] = useState<M365ReconciliationReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const retry = useCallback(() => {
    setReloadKey((k) => k + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const res = await fetch("/api/admin/m365-reconciliation")
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string
          } | null
          throw new Error(body?.error || `HTTP ${res.status}`)
        }
        const data = (await res.json()) as M365ReconciliationReport
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

  const viewState = useMemo(() => {
    const items = report ? [report] : []
    return resolveListViewState({
      loading,
      error,
      items,
      visible: items,
      filtersActive: false,
      clear: () => {},
      retry,
    })
  }, [error, loading, report, retry])

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8 bg-background p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {pageLabel}
        </h1>
        <p className="text-sm text-muted-foreground">
          Read-only client ↔ M365 identity check. Graph verification stays pending
          until provisioning credentials are live. Unmatched plan MBA numbers
          cannot be provisioned and need a per-row decision.
        </p>
      </header>

      <ViewStateBoundary
        state={viewState}
        errorTitle="Could not load reconciliation"
        emptyTitle="No clients or plans"
        emptyMessage="Nothing to reconcile."
        loadingRows={8}
      >
        {(rows) => {
          const data = rows[0]!
          const clientRows = data.clientRows
          const unmatched = data.unmatchedPlans
          return (
            <div className="space-y-8">
              <section className="space-y-3">
                <div className="flex flex-wrap items-baseline gap-3">
                  <h2 className="text-lg font-medium text-foreground">Clients</h2>
                  <span className="text-sm text-muted-foreground num">
                    {clientRows.length} rows · {data.identifierGroups.length}{" "}
                    identifier groups
                  </span>
                </div>
                <div className="overflow-x-auto rounded-card border border-border bg-card shadow-e1">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Client</TableHead>
                        <TableHead>Identifier</TableHead>
                        <TableHead>Derived site URL</TableHead>
                        <TableHead>Stored SharePoint URL</TableHead>
                        <TableHead>Stored teams group id</TableHead>
                        <TableHead>Dashboard slug</TableHead>
                        <TableHead>Casing anomaly</TableHead>
                        <TableHead>Checked against Graph</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clientRows.map((row, index) => {
                        const prev = index > 0 ? clientRows[index - 1] : null
                        const groupBreak =
                          prev != null &&
                          prev.identifierGroupKey !== row.identifierGroupKey
                        return (
                          <TableRow
                            key={row.clientId}
                            className={cn(
                              "interactive-row",
                              groupBreak && "border-t-2 border-border"
                            )}
                          >
                            <TableCell>
                              <div className="flex flex-col gap-0.5">
                                <span className="font-medium text-foreground">
                                  {dash(row.clientName)}
                                </span>
                                <span className="text-xs text-muted-foreground num">
                                  id {row.clientId}
                                  {row.isAnchor ? " · anchor" : ""}
                                  {row.groupMemberCount > 1
                                    ? ` · group ×${row.groupMemberCount}`
                                    : ""}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-sm num">
                              {dash(row.mbaidentifier)}
                            </TableCell>
                            <TableCell className="font-mono text-sm num">
                              {dash(row.derivedSiteUrl)}
                            </TableCell>
                            <TableCell className="font-mono text-sm num">
                              {dash(row.storedSharepointSiteUrl)}
                            </TableCell>
                            <TableCell className="font-mono text-sm num">
                              {dash(row.storedTeamsGroupId)}
                            </TableCell>
                            <TableCell className="font-mono text-sm num">
                              {dash(row.dashboardSlug)}
                            </TableCell>
                            <TableCell>
                              {row.mbaidentifierCasingAnomaly ? (
                                <Badge variant="warning">Anomaly</Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {row.checkedAgainstGraph}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex flex-wrap items-baseline gap-3">
                  <h2 className="text-lg font-medium text-foreground">
                    Unmatched plan MBA numbers
                  </h2>
                  <span className="text-sm text-muted-foreground num">
                    {unmatched.length} · TI-1 §3a — no client identifier match
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  These masters can never be provisioned via identifier join. Each
                  row needs an explicit decision (remap, retire, or leave orphan).
                </p>
                <div className="overflow-x-auto rounded-card border border-border bg-card shadow-e1">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>MBA number</TableHead>
                        <TableHead>Master id</TableHead>
                        <TableHead>Campaign</TableHead>
                        <TableHead>Stored client name</TableHead>
                        <TableHead>client_id</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unmatched.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="text-center text-muted-foreground"
                          >
                            No unmatched MBA numbers
                          </TableCell>
                        </TableRow>
                      ) : (
                        unmatched.map((row) => (
                          <TableRow key={row.masterId} className="interactive-row">
                            <TableCell className="font-mono text-sm num">
                              {row.mbaNumber}
                            </TableCell>
                            <TableCell className="num">{row.masterId}</TableCell>
                            <TableCell>{dash(row.campaignName)}</TableCell>
                            <TableCell>{dash(row.clientName)}</TableCell>
                            <TableCell className="num">
                              {row.clientId == null ? "—" : row.clientId}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">
                                No client identifier
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </section>
            </div>
          )
        }}
      </ViewStateBoundary>
    </div>
  )
}

export default function M365ReconciliationPage() {
  return (
    <AdminGuard>
      <Suspense fallback={<LoadingState rows={6} />}>
        <M365ReconciliationPageInner />
      </Suspense>
    </AdminGuard>
  )
}
