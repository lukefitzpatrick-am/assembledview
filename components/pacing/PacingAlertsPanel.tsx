"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { fetchPacingAlertsList } from "@/lib/xano/pacing-client"
import { alertsApiParamsFromSnapshot } from "@/lib/pacing/pacingFilters"
import { usePacingFilterStore } from "@/lib/pacing/usePacingFilterStore"
import { usePacingOverviewData } from "@/components/pacing/PacingOverviewDataContext"
import { formatPacingPct1 } from "@/components/pacing/formatters"
import { StatusPill } from "@/components/dashboard/delivery/shared/StatusPill"
import { computeLineItemPacingDerived } from "@/components/pacing/pacingMetrics"
import { pacingStatusForStatusPill } from "@/components/pacing/pacingStatusForStatusPill"
import type { LineItemPacingRow, PacingAlert } from "@/lib/xano/pacing-types"

export function PacingAlertsPanel() {
  const filters = usePacingFilterStore((s) => s.filters)
  const filtersKey = JSON.stringify(filters)
  const { lineItems, clientNameById, openDrawer } = usePacingOverviewData()

  const [alerts, setAlerts] = useState<PacingAlert[]>([])
  const [loading, setLoading] = useState(true)

  const lineById = useMemo(() => {
    const m = new Map<string, LineItemPacingRow>()
    for (const r of lineItems) {
      m.set(r.av_line_item_id.trim().toLowerCase(), r)
    }
    return m
  }, [lineItems])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const params = { ...alertsApiParamsFromSnapshot(filters), severity: "critical" }
    void fetchPacingAlertsList(params)
      .then((r) => {
        if (!cancelled) setAlerts(Array.isArray(r.data) ? r.data : [])
      })
      .catch(() => {
        if (!cancelled) setAlerts([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filtersKey, filters])

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          Critical alerts
        </CardTitle>
        {loading ? (
          <span className="text-xs text-muted-foreground">Loading…</span>
        ) : (
          <span className="text-xs text-muted-foreground">{alerts.length}</span>
        )}
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        {loading ? (
          <div className="space-y-2">
            <div className="h-14 animate-pulse rounded-md bg-muted" />
            <div className="h-14 animate-pulse rounded-md bg-muted" />
          </div>
        ) : alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No critical alerts for the current filters.</p>
        ) : (
          <ul className="max-h-[min(50vh,480px)] space-y-2 overflow-y-auto pr-1">
            {alerts.map((a, idx) => {
              const id = String(a.av_line_item_id ?? "").trim()
              const row = id ? lineById.get(id.toLowerCase()) ?? null : null
              const client =
                row != null
                  ? clientNameById.get(row.clients_id) ?? `Client ${row.clients_id}`
                  : a.clients_id
                    ? clientNameById.get(a.clients_id) ?? `Client ${a.clients_id}`
                    : "—"
              const variance =
                row != null ? computeLineItemPacingDerived(row, filters.date_to).variancePct : null
              return (
                <li
                  key={`${id}-${idx}`}
                  className="rounded-md border border-border/50 bg-muted/15 px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-xs text-muted-foreground">{client}</p>
                      <p className="font-mono text-xs text-foreground">{id || "—"}</p>
                      {row ? (
                        <StatusPill {...pacingStatusForStatusPill(row.pacing_status)} />
                      ) : a.pacing_status ? (
                        <StatusPill {...pacingStatusForStatusPill(a.pacing_status)} />
                      ) : null}
                      <p className="text-xs text-muted-foreground line-clamp-2">{a.alert_message}</p>
                      {variance != null ? (
                        <p className="text-xs tabular-nums text-muted-foreground">
                          Variance {formatPacingPct1(variance)}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="shrink-0"
                      disabled={!row}
                      onClick={() => row && openDrawer(row)}
                    >
                      Open
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
