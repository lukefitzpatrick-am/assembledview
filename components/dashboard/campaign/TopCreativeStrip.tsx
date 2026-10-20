"use client"

import { useState } from "react"

import { Section } from "@/components/layout/Section"
import { ErrorState } from "@/components/ui/states"
import { Skeleton } from "@/components/ui/skeleton"
import type { CreativePerformanceRow } from "@/lib/creative/performance/metrics"
import {
  creativeSubtitle,
  platformWindowNote,
  selectTopCreatives,
  topCreativeMetricLine,
  type TopCreativePick,
} from "@/lib/creative/performance/present"

import { CreativeFormatThumb } from "./CreativeFormatThumb"
import { useCreativePerformance, type CreativeLoadStatus } from "./CreativePerformanceProvider"
import { CreativePreviewSheet } from "./CreativePreviewSheet"

function CreativeCard({
  pick,
  onOpen,
}: {
  pick: TopCreativePick
  onOpen: (row: CreativePerformanceRow) => void
}) {
  const { headline, supports } = topCreativeMetricLine(pick)
  const row = pick.creative
  const name = row.name?.trim() || "Untitled ad"
  const where = creativeSubtitle(row)
  return (
    <article
      className="interactive relative flex cursor-pointer flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-e1 focus-within:ring-2 focus-within:ring-ring"
      data-creative-key={row.creativeKey}
      data-creative-reason={pick.reason}
    >
      <CreativeFormatThumb
        format={row.format}
        previewUrl={row.previewUrl}
        previewKind={row.previewKind}
                videoUrl={row.videoUrl}
        size="card"
        name={name}
      />
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{pick.reason}</p>
        <h3 className="mt-1 truncate text-sm font-semibold text-foreground" title={name}>
          <button
            type="button"
            onClick={() => onOpen(row)}
            aria-haspopup="dialog"
            className="block w-full truncate text-left after:absolute after:inset-0 after:rounded-card after:content-[''] focus-visible:outline-none"
          >
            {name}
          </button>
        </h3>
        <p className="truncate text-sm text-muted-foreground">{where}</p>
        <p className="mt-2 text-sm text-foreground">
          <span className="num font-semibold">{headline}</span>
          <span className="num text-muted-foreground">
            {" · "}
            {supports[0]}
            {" · "}
            {supports[1]}
          </span>
        </p>
      </div>
    </article>
  )
}

export function TopCreativeStripView({
  status,
  creatives,
  onRetry,
}: {
  status: CreativeLoadStatus
  creatives: CreativePerformanceRow[]
  onRetry?: () => void
}) {
  const [selected, setSelected] = useState<CreativePerformanceRow | null>(null)
  if (status === "off") return null
  const picks = status === "ready" ? selectTopCreatives(creatives) : []
  const windows = status === "ready" ? platformWindowNote(creatives) : ""

  return (
    <Section
      as="h2"
      title="Top 3"
      accent="creative"
      description="The three ads doing the most for this campaign. Every ad sits inside its delivery line below."
    >
      <div data-creative-status={status}>
        {windows ? (
          <p className="num -mt-2 mb-4 text-[13px] text-muted-foreground">{windows}</p>
        ) : null}
        {status === "loading" ? (
          <div className="grid gap-4 md:grid-cols-3" aria-busy="true">
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-48 rounded-card" />
            ))}
          </div>
        ) : null}
        {status === "unavailable" ? (
          <div className="rounded-card border border-border bg-surface-panel px-5 py-4">
            <p className="text-sm font-semibold text-foreground">Creative data isn&apos;t set up yet</p>
          </div>
        ) : null}
        {status === "error" ? (
          <ErrorState
            title="Creative performance could not be loaded."
            message="Try again in a moment."
            onRetry={onRetry}
          />
        ) : null}
        {status === "ready" && picks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No creative reported for this campaign in this window.</p>
        ) : null}
        {status === "ready" && picks.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-3">
            {picks.map((pick) => (
              <CreativeCard
                key={`${pick.reason}-${pick.creative.platform}-${pick.creative.creativeKey}`}
                pick={pick}
                onOpen={setSelected}
              />
            ))}
          </div>
        ) : null}
        <CreativePreviewSheet creative={selected} onClose={() => setSelected(null)} />
      </div>
    </Section>
  )
}

export function TopCreativeStrip() {
  const { status, creatives, reload } = useCreativePerformance()
  return <TopCreativeStripView status={status} creatives={creatives} onRetry={reload} />
}
