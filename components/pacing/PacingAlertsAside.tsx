"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronUp, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { StatusPill } from "@/components/dashboard/delivery/shared/StatusPill"
import { VarianceRibbon } from "@/components/dashboard/delivery/shared/VarianceRibbon"
import {
  computeLineItemPacingDerived,
  isAtRiskStatus,
} from "@/components/pacing/pacingMetrics"
import { usePacingOverviewData } from "@/components/pacing/PacingOverviewDataContext"
import { usePacingFilterStore } from "@/lib/pacing/usePacingFilterStore"
import type { LineItemPacingRow } from "@/lib/xano/pacing-types"

type AlertItem = {
  row: LineItemPacingRow
  variance: number
  clientLabel: string
}

const asideShell =
  "rounded-xl border border-border/60 bg-card md:sticky md:top-24 md:self-start"

export function PacingAlertsAside() {
  const { lineItems, clientNameById, openDrawer, loading } = usePacingOverviewData()
  const filterDateTo = usePacingFilterStore((s) => s.filters.date_to)
  const [collapsedMobile, setCollapsedMobile] = useState(true)

  const alerts: AlertItem[] = useMemo(() => {
    return lineItems
      .filter((r) => isAtRiskStatus(r.pacing_status))
      .map((r) => {
        const d = computeLineItemPacingDerived(r, filterDateTo)
        return {
          row: r,
          variance: (d.variancePct ?? 0) / 100,
          clientLabel: clientNameById.get(r.clients_id) ?? `Client ${r.clients_id}`,
        }
      })
      .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
  }, [lineItems, filterDateTo, clientNameById])

  if (loading) {
    return (
      <aside className={cn(asideShell, "p-4")}>
        <div className="h-32 animate-pulse rounded-lg bg-muted/40" />
      </aside>
    )
  }

  if (alerts.length === 0) {
    return (
      <aside className={cn(asideShell, "p-4")}>
        <h3 className="text-sm font-semibold">All clear</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          No line items currently flagged at risk.
        </p>
      </aside>
    )
  }

  return (
    <aside className={asideShell}>
      <div className="flex items-center justify-between border-b border-border/40 p-3">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
          Alerts ({alerts.length})
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label={collapsedMobile ? "Expand alerts" : "Collapse alerts"}
          onClick={() => setCollapsedMobile((v) => !v)}
        >
          {collapsedMobile ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </Button>
      </div>

      <div
        className={cn(
          "max-h-[60vh] space-y-2 overflow-y-auto p-3",
          collapsedMobile && "hidden md:block"
        )}
      >
        {alerts.map(({ row, variance, clientLabel }) => (
          <button
            key={row.av_line_item_id}
            type="button"
            onClick={() => openDrawer(row)}
            className="w-full rounded-lg border border-border/40 bg-muted/10 p-3 text-left transition-colors hover:bg-muted/30"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs text-muted-foreground">{clientLabel}</p>
              <StatusPill
                status={variance < 0 ? "behind" : variance > 0 ? "ahead" : "on-track"}
              />
            </div>
            <p className="mt-1 truncate text-sm font-medium">
              {row.av_line_item_label || row.av_line_item_id}
            </p>
            <VarianceRibbon variance={variance} className="mt-2" />
          </button>
        ))}
      </div>
    </aside>
  )
}
