"use client"

import * as React from "react"
import type { ResolvedKPIRow } from "@/lib/kpi/types"
import { KPIEditModal } from "./KPIEditModal"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { MEDIA_TYPE_LABELS, MEDIA_TYPE_COLORS } from "@/lib/media/mediaTypes"

// Re-export for any legacy `from "@/components/kpis/KPISection"` label/color consumers
export { MEDIA_TYPE_LABELS, MEDIA_TYPE_COLORS }

const summaryCountFmt = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 })

type HeadlineKind = "clicks" | "views" | "listens" | "reach" | "none"

const MEDIA_TYPE_HEADLINE: Record<string, HeadlineKind> = {
  search: "clicks",
  socialMedia: "clicks",
  progDisplay: "clicks",
  digiDisplay: "clicks",
  progOoh: "reach",
  progAudio: "listens",
  progVideo: "views",
  progBvod: "views",
  bvod: "views",
  digiAudio: "listens",
  digiVideo: "views",
  integration: "reach",
  influencers: "reach",
  television: "reach",
  radio: "reach",
  cinema: "reach",
  ooh: "reach",
  newspaper: "reach",
  magazines: "reach",
  production: "none",
}

const HEADLINE_LABEL: Record<Exclude<HeadlineKind, "none">, string> = {
  clicks: "clicks",
  views: "views",
  listens: "listens",
  reach: "reach",
}

/**
 * Sum the headline metric for a media type across its resolved KPI rows.
 * Returns `null` when the media type has no meaningful delivery metric (e.g. production).
 */
function summariseHeadlineMetric(
  mediaType: string,
  rows: ResolvedKPIRow[],
): { kind: Exclude<HeadlineKind, "none">; total: number } | null {
  const kind = MEDIA_TYPE_HEADLINE[mediaType] ?? "clicks"
  if (kind === "none") return null
  let total = 0
  for (const r of rows) {
    switch (kind) {
      case "clicks":
        total += r.calculatedClicks
        break
      case "views":
      case "listens":
        total += r.calculatedViews
        break
      case "reach":
        total += r.calculatedReach
        break
    }
  }
  return { kind, total }
}

export interface KPISectionProps {
  kpiRows: ResolvedKPIRow[]
  isLoading: boolean
  onKPIChange?: (updatedRows: ResolvedKPIRow[]) => void
  onSave: (rows: ResolvedKPIRow[]) => void
  onReset: () => void
  className?: string
}

export function KPISection({
  kpiRows,
  isLoading,
  onSave,
  onReset,
  className,
}: KPISectionProps) {
  const [isModalOpen, setIsModalOpen] = React.useState(false)

  const channelCount = React.useMemo(
    () => new Set(kpiRows.map((r) => r.media_type)).size,
    [kpiRows],
  )

  const rowsByMediaType = React.useMemo(() => {
    return kpiRows.reduce(
      (acc, row) => {
        if (!acc[row.media_type]) acc[row.media_type] = []
        acc[row.media_type]!.push(row)
        return acc
      },
      {} as Record<string, ResolvedKPIRow[]>,
    )
  }, [kpiRows])

  return (
    <div className={cn("space-y-3", className)}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          KPIs
        </span>
        <div className="flex items-center gap-2">
          {kpiRows.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {kpiRows.length} row{kpiRows.length !== 1 ? "s" : ""}
              {" · "}
              {channelCount} channel{channelCount !== 1 ? "s" : ""}
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsModalOpen(true)}
            disabled={isLoading}
          >
            {kpiRows.length === 0 ? "KPIs" : "Edit KPIs"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReset}
            disabled={isLoading || kpiRows.length === 0}
            className="text-xs text-muted-foreground"
          >
            Reset
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <div className="h-8 animate-pulse rounded bg-muted" />
          <div className="h-8 animate-pulse rounded bg-muted" />
          <div className="h-8 animate-pulse rounded bg-muted" />
        </div>
      ) : kpiRows.length === 0 ? (
        <p className="py-2 text-center text-sm text-muted-foreground">
          Add line items to generate KPIs
        </p>
      ) : (
        <div className="space-y-1">
          {Object.entries(rowsByMediaType).map(([mediaType, rows]) => {
            const hasDefault = rows.some((r) => r.source === "default")
            const allDefault = rows.every((r) => r.source === "default")
            const dotColor = allDefault
              ? "bg-red-400"
              : hasDefault
                ? "bg-amber-400"
                : "bg-green-400"
            const headline = summariseHeadlineMetric(mediaType, rows)
            return (
              <div
                key={mediaType}
                className="flex cursor-pointer items-center justify-between rounded px-1 py-0.5 text-[11px] hover:bg-muted/30"
                onClick={() => setIsModalOpen(true)}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`}
                  />
                  <span className="font-medium">
                    {MEDIA_TYPE_LABELS[mediaType] ?? mediaType}
                  </span>
                  <span className="text-muted-foreground">({rows.length})</span>
                </div>
                <div className="flex items-center gap-3 tabular-nums text-muted-foreground">
                  {headline === null ? (
                    <span className="text-muted-foreground/70">—</span>
                  ) : headline.total > 0 ? (
                    <span>
                      {summaryCountFmt.format(headline.total)}{" "}
                      {HEADLINE_LABEL[headline.kind]}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/70">
                      0 {HEADLINE_LABEL[headline.kind]}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
          <p className="pt-1 text-center text-[10px] text-muted-foreground">
            Click to edit →
          </p>
        </div>
      )}

      <KPIEditModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        kpiRows={kpiRows}
        onSave={(updatedRows) => {
          onSave(updatedRows)
          setIsModalOpen(false)
        }}
        onReset={() => {
          onReset()
          setIsModalOpen(false)
        }}
        isSaving={false}
      />
    </div>
  )
}
