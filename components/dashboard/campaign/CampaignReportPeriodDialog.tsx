"use client"

import { useEffect, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import type { CampaignReportPeriodKind } from "@/lib/reports/campaignReport/periods"
import {
  DECK_POLL_DEADLINE_MS,
  DECK_POLL_MS,
  deckPanelPhase,
  formatDeckElapsed,
  reviewReportStart,
} from "@/lib/reports/deckJobs/deckBuildPanel"
import { cn } from "@/lib/utils"
import { DeckBuildStatus } from "@/components/dashboard/campaign/DeckBuildStatus"

export type CampaignReportPeriodDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mbaNumber: string
  /** Callers may still pass these. The deck job resolves them on the server. */
  clientName?: string | null
  campaignName?: string | null
  versionNumber?: number
  campaignStartISO?: string | null
  campaignEndISO?: string | null
}

const PERIOD_OPTIONS: Array<{ kind: CampaignReportPeriodKind; label: string; hint: string }> = [
  {
    kind: "this_month",
    label: "This month",
    hint: "From the first of the current Melbourne month to today.",
  },
  {
    kind: "last_month",
    label: "Last month",
    hint: "Full previous Melbourne calendar month.",
  },
  {
    kind: "campaign_to_date",
    label: "Campaign to date",
    hint: "Campaign start through today (or campaign end).",
  },
  {
    kind: "custom",
    label: "Custom range",
    hint: "Choose inclusive start and end dates.",
  },
]

type DeckRunView = {
  runId: string
  status: string
  fileName: string | null
  downloadUrl: string | null
  error: string | null
  note: string | null
  createdAt: string
}

async function readFailure(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown; message?: unknown }
    if (typeof body.message === "string" && body.message.trim()) return body.message.trim()
    if (body.error === "create_failed") return "The deck could not be started."
    if (typeof body.error === "string" && body.error.trim()) return body.error.trim()
  } catch {
    // The status panel still has a sentence when the body is empty.
  }
  return "The deck could not be started."
}

async function fetchDeckStatus(runId: string): Promise<DeckRunView | null> {
  const response = await fetch(`/api/reports/on-demand/${encodeURIComponent(runId)}`)
  if (!response.ok) return null
  const body = (await response.json()) as Omit<DeckRunView, "runId">
  return { runId, ...body }
}

export function CampaignReportPeriodDialog({
  open,
  onOpenChange,
  mbaNumber,
}: CampaignReportPeriodDialogProps) {
  const [periodKind, setPeriodKind] = useState<CampaignReportPeriodKind>("this_month")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")
  const [busy, setBusy] = useState(false)
  const [lookingUp, setLookingUp] = useState(false)
  const [run, setRun] = useState<DeckRunView | null>(null)
  const [showBuildNew, setShowBuildNew] = useState(false)
  const [watchedAt, setWatchedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const runRequest = useRef(0)

  const canSubmit =
    periodKind !== "custom" ||
    (Boolean(customStart.trim()) && Boolean(customEnd.trim()) && customEnd >= customStart)

  const watchedMs = watchedAt == null ? 0 : Math.max(0, now - watchedAt)
  const phase = run ? deckPanelPhase({ status: run.status, watchedMs }) : null
  const elapsedLabel = run ? formatDeckElapsed(now - Date.parse(run.createdAt)) : ""

  useEffect(() => {
    if (!open || !canSubmit) return
    const request = ++runRequest.current
    let cancelled = false
    setLookingUp(true)
    setRun(null)
    setShowBuildNew(false)
    setWatchedAt(null)

    const params = new URLSearchParams({ mbaNumber, kind: periodKind })
    if (periodKind === "custom") {
      params.set("start", customStart)
      params.set("end", customEnd)
    }

    void (async () => {
      try {
        const response = await fetch(`/api/reports/on-demand?${params.toString()}`)
        if (cancelled || request !== runRequest.current) return
        if (!response.ok) return
        const body = (await response.json()) as { run?: DeckRunView | null }
        const found = body.run
        if (
          found?.runId &&
          found.createdAt &&
          reviewReportStart({ createdAt: found.createdAt, nowMs: Date.now() }) === "reopen"
        ) {
          setRun(found)
          setShowBuildNew(true)
          setWatchedAt(Date.now())
          setNow(Date.now())
        }
      } catch {
        // A missed lookup still leaves Download report available.
      } finally {
        if (!cancelled && request === runRequest.current) setLookingUp(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, canSubmit, mbaNumber, periodKind, customStart, customEnd])

  useEffect(() => {
    if (!open || phase !== "building") return
    const tick = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(tick)
  }, [open, phase])

  useEffect(() => {
    if (!open || phase !== "building" || !run?.runId) return
    const runId = run.runId
    const started = watchedAt ?? Date.now()
    let cancelled = false

    const pull = () => {
      if (Date.now() - started >= DECK_POLL_DEADLINE_MS) {
        setNow(Date.now())
        return
      }
      void fetchDeckStatus(runId).then((next) => {
        if (cancelled || !next) return
        setRun(next)
      })
    }

    pull()
    const poll = window.setInterval(pull, DECK_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(poll)
    }
  }, [open, phase, run?.runId, watchedAt])

  const startBuild = async () => {
    if (!canSubmit || busy) return
    const request = ++runRequest.current
    const startedAt = new Date().toISOString()
    setBusy(true)
    setLookingUp(false)
    setShowBuildNew(false)
    setWatchedAt(Date.now())
    setNow(Date.now())
    setRun({
      runId: "",
      status: "queued",
      fileName: null,
      downloadUrl: null,
      error: null,
      note: null,
      createdAt: startedAt,
    })

    try {
      const response = await fetch("/api/reports/on-demand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mbaNumber,
          period: {
            kind: periodKind,
            start: periodKind === "custom" ? customStart : undefined,
            end: periodKind === "custom" ? customEnd : undefined,
          },
        }),
      })
      if (request !== runRequest.current) return
      if (!response.ok) {
        setRun({
          runId: "",
          status: "failed",
          fileName: null,
          downloadUrl: null,
          error: await readFailure(response),
          note: null,
          createdAt: startedAt,
        })
        return
      }
      const created = (await response.json()) as { runId?: string; status?: string }
      const runId = created.runId?.trim() ?? ""
      if (!runId) {
        setRun({
          runId: "",
          status: "failed",
          fileName: null,
          downloadUrl: null,
          error: "The deck could not be started.",
          note: null,
          createdAt: startedAt,
        })
        return
      }
      const status = await fetchDeckStatus(runId)
      if (request !== runRequest.current) return
      setWatchedAt(Date.now())
      setNow(Date.now())
      setRun(
        status ?? {
          runId,
          status: created.status || "queued",
          fileName: null,
          downloadUrl: null,
          error: null,
          note: null,
          createdAt: startedAt,
        },
      )
    } catch {
      if (request !== runRequest.current) return
      setRun({
        runId: "",
        status: "failed",
        fileName: null,
        downloadUrl: null,
        error: "The deck could not be started.",
        note: null,
        createdAt: startedAt,
      })
    } finally {
      if (request === runRequest.current) setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Campaign report</DialogTitle>
          <DialogDescription>
            Choose the reporting window. AVA writes the commentary. Admin only.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.kind}
              type="button"
              onClick={() => setPeriodKind(opt.kind)}
              className={cn(
                "interactive-tint w-full rounded-input border px-3 py-2.5 text-left transition-colors",
                periodKind === opt.kind
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:bg-table-row-hover",
              )}
            >
              <p className="text-sm font-medium text-foreground">{opt.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{opt.hint}</p>
            </button>
          ))}

          {periodKind === "custom" ? (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor="report-start">Start</Label>
                <Input
                  id="report-start"
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="report-end">End</Label>
                <Input
                  id="report-end"
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
            </div>
          ) : null}
        </div>

        {lookingUp && !run ? (
          <p className="text-sm text-muted-foreground">Checking for a recent deck.</p>
        ) : null}

        {run && phase ? (
          <DeckBuildStatus
            phase={phase}
            elapsedLabel={elapsedLabel}
            fileName={run.fileName}
            downloadUrl={run.downloadUrl}
            note={run.note}
            error={run.error}
            showBuildNew={showBuildNew}
            onTryAgain={() => {
              void startBuild()
            }}
            onBuildNew={() => {
              void startBuild()
            }}
          />
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          {run ? null : (
            <Button onClick={() => void startBuild()} disabled={!canSubmit || busy || lookingUp}>
              Download report
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
