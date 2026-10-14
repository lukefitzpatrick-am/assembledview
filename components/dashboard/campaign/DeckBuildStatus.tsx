"use client"

import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  basicLayoutReason,
  DECK_BUILDING_COPY,
  DECK_REPORTS_HREF,
  deckPanelPhase,
  plainDeckError,
  reviewReportStart,
  type DeckPanelPhase,
} from "@/lib/reports/deckJobs/deckBuildPanel"

export function DeckBuildStatus({
  phase,
  elapsedLabel,
  fileName,
  downloadUrl,
  note,
  error,
  showBuildNew,
  onTryAgain,
  onBuildNew,
}: {
  phase: DeckPanelPhase
  elapsedLabel: string
  fileName: string | null
  downloadUrl: string | null
  note: string | null
  error: string | null
  showBuildNew: boolean
  onTryAgain: () => void
  onBuildNew: () => void
}) {
  const reason = phase === "ready" ? basicLayoutReason(note) : null

  return (
    <div data-phase={phase} className="space-y-3 rounded-card border border-border bg-card p-3">
      {phase === "building" ? (
        <div role="status" className="space-y-2">
          <div className="flex items-start gap-2 text-sm text-foreground">
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
            <p>{DECK_BUILDING_COPY}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            Elapsed <span className="num text-foreground">{elapsedLabel}</span>
          </p>
        </div>
      ) : null}

      {phase === "still" ? (
        <p role="status" className="text-sm text-foreground">
          Still building. Check{" "}
          <a href={DECK_REPORTS_HREF} className="text-primary underline underline-offset-4">
            Reports
          </a>{" "}
          shortly.
        </p>
      ) : null}

      {phase === "ready" ? (
        <div className="space-y-2">
          {fileName ? <p className="text-sm text-foreground">{fileName}</p> : null}
          {downloadUrl ? (
            <Button asChild variant="success" size="sm">
              <a href={downloadUrl}>Download deck</a>
            </Button>
          ) : null}
          {reason != null ? (
            <div>
              <p className="text-sm font-semibold text-foreground">Basic layout</p>
              {reason ? <p className="text-sm text-muted-foreground">{reason}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {phase === "failed" ? (
        <div className="space-y-2">
          <p className="text-sm text-foreground">{plainDeckError(error)}</p>
          <Button type="button" variant="outline" size="sm" onClick={onTryAgain}>
            Try again
          </Button>
        </div>
      ) : null}

      {showBuildNew ? (
        <Button type="button" variant="outline" size="sm" onClick={onBuildNew}>
          Build a new deck
        </Button>
      ) : null}
    </div>
  )
}

/** Renders the reopen choice: a recent run, or the button that starts one. */
export function ReviewReportStart({
  createdAt,
  nowMs,
  fileName,
  downloadUrl,
  note,
}: {
  createdAt: string | null
  nowMs: number
  fileName: string
  downloadUrl: string
  note: string | null
}) {
  if (reviewReportStart({ createdAt, nowMs }) === "reopen") {
    return (
      <DeckBuildStatus
        phase="ready"
        elapsedLabel=""
        fileName={fileName}
        downloadUrl={downloadUrl}
        note={note}
        error={null}
        showBuildNew
        onTryAgain={() => {}}
        onBuildNew={() => {}}
      />
    )
  }
  return (
    <button type="button" className="text-sm font-semibold">
      Download report
    </button>
  )
}

/** Renders whatever the poll rule decides for this status and watch time. */
export function DeckPollView({
  status,
  watchedMs,
  elapsedLabel,
  error,
}: {
  status: string
  watchedMs: number
  elapsedLabel: string
  error: string | null
}) {
  return (
    <DeckBuildStatus
      phase={deckPanelPhase({ status, watchedMs })}
      elapsedLabel={elapsedLabel}
      fileName={null}
      downloadUrl={null}
      note={null}
      error={error}
      showBuildNew={false}
      onTryAgain={() => {}}
      onBuildNew={() => {}}
    />
  )
}
