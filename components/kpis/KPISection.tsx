"use client"

import * as React from "react"
import type { ResolvedKPIRow } from "@/types/kpi"
import { KPIEditModal } from "./KPIEditModal"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export const MEDIA_TYPE_LABELS: Record<string, string> = {
  television: "Television",
  radio: "Radio",
  newspaper: "Newspaper",
  magazines: "Magazines",
  ooh: "OOH",
  cinema: "Cinema",
  digiDisplay: "Digital Display",
  digiAudio: "Digital Audio",
  digiVideo: "Digital Video",
  bvod: "BVOD",
  integration: "Integration",
  search: "Search",
  socialMedia: "Social Media",
  progDisplay: "Programmatic Display",
  progVideo: "Programmatic Video",
  progBvod: "Programmatic BVOD",
  progAudio: "Programmatic Audio",
  progOoh: "Programmatic OOH",
  influencers: "Influencers",
  production: "Production",
}

export const MEDIA_TYPE_COLORS: Record<string, string> = {
  television: "FF1565C0",
  radio: "FF6A1B9A",
  newspaper: "FF37474F",
  magazines: "FFAD1457",
  ooh: "FFE65100",
  cinema: "FFB71C1C",
  digiDisplay: "FF00695C",
  digiAudio: "FF1A237E",
  digiVideo: "FF4527A0",
  bvod: "FFF57F17",
  integration: "FF2E7D32",
  search: "FF1B5E20",
  socialMedia: "FF0D47A1",
  progDisplay: "FF263238",
  progVideo: "FF311B92",
  progBvod: "FFF9A825",
  progAudio: "FFBF360C",
  progOoh: "FF558B2F",
  influencers: "FF880E4F",
  production: "FF4E342E",
}

const summarySpendFmt = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
})
const summaryClicksFmt = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 })

export interface KPISectionProps {
  kpiRows: ResolvedKPIRow[]
  isLoading: boolean
  onKPIChange: (updatedRows: ResolvedKPIRow[]) => void
  onSave?: (rows: ResolvedKPIRow[]) => void
  onReset: () => void
  className?: string
}

export function KPISection({
  kpiRows,
  isLoading,
  onKPIChange,
  onSave,
  onReset,
  className,
}: KPISectionProps) {
  const [isModalOpen, setIsModalOpen] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)

  const persistKPIs = onSave ?? onKPIChange

  const channelCount = React.useMemo(
    () => new Set(kpiRows.map((r) => r.media_type)).size,
    [kpiRows],
  )

  const rowsByMediaType = React.useMemo(() => {
    return kpiRows.reduce(
      (acc, row) => {
        if (!acc[row.media_type]) acc[row.media_type] = []
        acc[row.media_type].push(row)
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
            const totalSpend = rows.reduce((s, r) => s + r.spend, 0)
            const totalClicks = rows.reduce((s, r) => s + r.calculatedClicks, 0)
            const hasDefault = rows.some((r) => r.source === "default")
            const allDefault = rows.every((r) => r.source === "default")
            const dotColor = allDefault
              ? "bg-red-400"
              : hasDefault
                ? "bg-amber-400"
                : "bg-green-400"
            return (
              <div
                key={mediaType}
                className="flex cursor-pointer items-center justify-between rounded px-1 py-0.5 text-[11px] hover:bg-muted/30"
                onClick={() => setIsModalOpen(true)}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
                  <span className="font-medium">{MEDIA_TYPE_LABELS[mediaType] ?? mediaType}</span>
                  <span className="text-muted-foreground">({rows.length})</span>
                </div>
                <div className="flex items-center gap-3 tabular-nums text-muted-foreground">
                  <span>{summarySpendFmt.format(totalSpend)}</span>
                  {totalClicks > 0 && (
                    <span>{summaryClicksFmt.format(totalClicks)} clicks</span>
                  )}
                </div>
              </div>
            )
          })}
          <p className="pt-1 text-center text-[10px] text-muted-foreground">Click to edit →</p>
        </div>
      )}

      <KPIEditModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        kpiRows={kpiRows}
        onSave={(updatedRows) => {
          persistKPIs(updatedRows)
          setIsModalOpen(false)
        }}
        onReset={() => {
          onReset()
          setIsModalOpen(false)
        }}
        isSaving={isSaving}
      />
    </div>
  )
}
