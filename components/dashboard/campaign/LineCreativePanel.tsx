"use client"

import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import type { CreativePerformanceRow } from "@/lib/creative/performance/metrics"
import {
  lineCreativeSlice,
  lineCreativeSubline,
  lineRankingMetric,
  showAllCreativeLabel,
} from "@/lib/creative/performance/present"

import { CreativeFormatThumb } from "./CreativeFormatThumb"
import { useLineCreatives } from "./CreativePerformanceProvider"
import { CreativePreviewSheet } from "./CreativePreviewSheet"

export function LineCreativePanelView({ rows }: { rows: CreativePerformanceRow[] }) {
  const [expanded, setExpanded] = useState(false)
  const [selected, setSelected] = useState<CreativePerformanceRow | null>(null)
  if (rows.length === 0) return null
  const visible = lineCreativeSlice(rows, expanded)
  const showAll = showAllCreativeLabel(rows.length, expanded)

  return (
    <div className="rounded-card border border-border bg-card p-3" data-creative-line="open">
      <h4 className="text-sm font-semibold text-foreground">Creative in this line</h4>
      <ul className="mt-3 space-y-1">
        {visible.map((row) => {
          const name = row.name?.trim() || "Untitled ad"
          return (
            <li
              key={`${row.platform}-${row.creativeKey}`}
              className="interactive-row relative -mx-1 flex cursor-pointer items-center gap-3 rounded-input px-1 py-1 focus-within:ring-2 focus-within:ring-ring"
            >
              <CreativeFormatThumb
                format={row.format}
                previewUrl={row.previewUrl}
                previewKind={row.previewKind}
                videoUrl={row.videoUrl}
                size="row"
                name={name}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground" title={name}>
                  <button
                    type="button"
                    onClick={() => setSelected(row)}
                    aria-haspopup="dialog"
                    className="block w-full truncate text-left after:absolute after:inset-0 after:rounded-input after:content-[''] focus-visible:outline-none"
                  >
                    {name}
                  </button>
                </p>
                {row.sizes.length > 0 ? (
                  <p className="truncate text-xs text-muted-foreground" title={row.sizes.join(", ")}>
                    {row.sizes.join(", ")}
                  </p>
                ) : null}
                <p className="num truncate text-xs text-muted-foreground">{lineCreativeSubline(row)}</p>
              </div>
              <p className="num shrink-0 text-sm font-semibold text-foreground">{lineRankingMetric(row)}</p>
            </li>
          )
        })}
      </ul>
      {showAll ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 px-2"
          onClick={() => setExpanded(true)}
        >
          {showAll}
        </Button>
      ) : null}
      <CreativePreviewSheet creative={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

export function LineCreativePanel({ lineItemId }: { lineItemId?: string }) {
  const rows = useLineCreatives(lineItemId)
  return <LineCreativePanelView rows={rows} />
}

/** Chart stays full width when the line has no creative rows. Below 900px the panel stacks under the chart. */
export function LineCreativeBesideChart({
  lineItemId,
  children,
}: {
  lineItemId?: string
  children: ReactNode
}) {
  const rows = useLineCreatives(lineItemId)
  if (rows.length === 0) return <>{children}</>
  return (
    <div className="grid items-start gap-4 min-[900px]:grid-cols-[minmax(0,1.4fr)_minmax(16rem,22rem)]">
      <div className="min-w-0">{children}</div>
      <LineCreativePanelView rows={rows} />
    </div>
  )
}
