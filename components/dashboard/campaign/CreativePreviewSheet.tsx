"use client"

import { ExternalLink } from "lucide-react"

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { CreativePerformanceRow } from "@/lib/creative/performance/metrics"
import {
  adSetNoun,
  creativeFacts,
  creativeSubtitle,
  platformLabel,
} from "@/lib/creative/performance/present"
import { formatDateShort } from "@/lib/format/date"

import { CreativeFormatThumb } from "./CreativeFormatThumb"

function windowText(row: CreativePerformanceRow): string {
  if (!row.firstDate || !row.lastDate) return ""
  const start = formatDateShort(row.firstDate)
  const end = formatDateShort(row.lastDate)
  return start === end ? start : `${start} to ${end}`
}

export function CreativePreviewBody({ creative }: { creative: CreativePerformanceRow }) {
  const name = creative.name?.trim() || "Untitled ad"
  const span = windowText(creative)
  const viewLabel =
    creative.platform === "meta" ? "View ad on Facebook" : `View ad on ${platformLabel(creative.platform)}`
  return (
    <div className="space-y-5" data-creative-panel={creative.creativeKey}>
      <CreativeFormatThumb
        format={creative.format}
        previewUrl={creative.previewUrl}
        previewKind={creative.previewKind}
        size="panel"
        name={name}
      />
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Platform</dt>
        <dd className="text-foreground">{creativeSubtitle(creative)}</dd>
        {creative.adSetName ? (
          <>
            <dt className="text-muted-foreground">{adSetNoun(creative.platform)}</dt>
            <dd className="break-words text-foreground">{creative.adSetName}</dd>
          </>
        ) : null}
        {span ? (
          <>
            <dt className="text-muted-foreground">Window</dt>
            <dd className="num text-foreground">{span}</dd>
          </>
        ) : null}
      </dl>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {creativeFacts(creative).map((fact) => (
          <div key={fact.label} className="rounded-input border border-border bg-card px-3 py-2">
            <dt className="text-xs text-muted-foreground">{fact.label}</dt>
            <dd className="num text-sm font-semibold text-foreground">{fact.value}</dd>
          </div>
        ))}
      </dl>
      {creative.viewUrl ? (
        <a
          href={creative.viewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="interactive-tint inline-flex items-center gap-2 rounded-input border border-border bg-card px-3 py-2 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {viewLabel}
          <ExternalLink className="h-4 w-4" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ) : null}
    </div>
  )
}

/** Read-only creative detail. Open when `creative` is set; closing calls `onClose`. */
export function CreativePreviewSheet({
  creative,
  onClose,
}: {
  creative: CreativePerformanceRow | null
  onClose: () => void
}) {
  const name = creative?.name?.trim() || "Untitled ad"
  return (
    <Sheet open={creative != null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        {creative ? (
          <>
            <SheetHeader className="pr-8">
              <SheetTitle className="break-words">{name}</SheetTitle>
              <SheetDescription>{creativeSubtitle(creative)}</SheetDescription>
            </SheetHeader>
            <div className="mt-5">
              <CreativePreviewBody creative={creative} />
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
