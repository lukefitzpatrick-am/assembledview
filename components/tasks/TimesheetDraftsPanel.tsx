"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Ban, Check, Clock3 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ViewStateBoundary } from "@/components/ui/ViewStateBoundary"
import { useToast } from "@/components/ui/use-toast"
import type { TimeEntryProposalStatus } from "@/db/schema/myhours"
import {
  formatTimesheetDuration,
  timesheetDraftStatusMeta,
} from "@/lib/myhours/timesheetDraftUi"
import { resolveListViewState } from "@/lib/ui/viewState"

type TimesheetDraft = {
  id: number
  memberEmail: string
  entryDate: string
  durationMinutes: number
  note: string
  clientName: string | null
  mbaNumber: string | null
  campaignName: string | null
  status: TimeEntryProposalStatus
  blockReason: string | null
}

type TimesheetDraftsResponse = {
  week_start: string
  week_end: string
  proposals?: TimesheetDraft[]
}

type TimesheetDraftsPanelProps = {
  active: boolean
  weekStart?: string
  onConfirmed: () => void | Promise<void>
}

const dateFormatter = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  weekday: "short",
  day: "2-digit",
  month: "short",
})

function formatEntryDate(value: string): string {
  const parsed = new Date(`${value}T12:00:00+10:00`)
  return Number.isNaN(parsed.getTime()) ? value : dateFormatter.format(parsed)
}

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null)
  if (body && typeof body === "object" && "message" in body) {
    return String((body as { message?: string }).message || fallback)
  }
  return fallback
}

export function TimesheetDraftsPanel({
  active,
  weekStart,
  onConfirmed,
}: TimesheetDraftsPanelProps) {
  const { toast } = useToast()
  const [drafts, setDrafts] = useState<TimesheetDraft[]>([])
  const [period, setPeriod] = useState<{ start: string; end: string } | null>(
    null
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const fetchDrafts = useCallback(async () => {
    if (!active) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (weekStart) params.set("week_start", weekStart)
      const query = params.toString()
      const response = await fetch(
        `/api/codex/time/proposals${query ? `?${query}` : ""}`
      )
      if (!response.ok) {
        throw new Error(
          await responseError(response, "Could not load timesheet drafts.")
        )
      }
      const data = (await response.json()) as TimesheetDraftsResponse
      setDrafts(Array.isArray(data.proposals) ? data.proposals : [])
      setPeriod({ start: data.week_start, end: data.week_end })
    } catch (cause) {
      console.error("Failed to load timesheet drafts:", cause)
      setDrafts([])
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load timesheet drafts."
      )
    } finally {
      setLoading(false)
    }
  }, [active, weekStart])

  useEffect(() => {
    if (!active) return
    void fetchDrafts()
  }, [active, fetchDrafts])

  const viewState = useMemo(
    () =>
      resolveListViewState({
        loading,
        error,
        items: drafts,
        visible: drafts,
        filtersActive: false,
        clear: () => undefined,
        retry: () => void fetchDrafts(),
      }),
    [loading, error, drafts, fetchDrafts]
  )

  const actOnDraft = useCallback(
    async (draft: TimesheetDraft, action: "confirm" | "skip") => {
      setBusyId(draft.id)
      try {
        const response = await fetch(
          `/api/codex/time/proposals/${encodeURIComponent(String(draft.id))}/${action}`,
          { method: "POST" }
        )
        if (!response.ok) {
          throw new Error(
            await responseError(
              response,
              action === "confirm"
                ? "Could not confirm this draft."
                : "Could not skip this draft."
            )
          )
        }
        const result = (await response.json()) as {
          status?: string
          blockReason?: string
        }
        if (action === "confirm" && result.status !== "confirmed") {
          toast({
            title: "Draft could not be confirmed",
            description:
              result.blockReason ||
              "The draft is blocked. Review its status and try again.",
            variant: "destructive",
          })
        } else {
          toast({
            title:
              action === "confirm"
                ? "Timesheet draft confirmed"
                : "Timesheet draft skipped",
          })
        }
        await fetchDrafts()
        if (action === "confirm" && result.status === "confirmed") {
          await onConfirmed()
        }
      } catch (cause) {
        console.error(`Failed to ${action} timesheet draft:`, cause)
        toast({
          title: action === "confirm" ? "Confirm failed" : "Skip failed",
          description:
            cause instanceof Error ? cause.message : "Please try again.",
          variant: "destructive",
        })
      } finally {
        setBusyId(null)
      }
    },
    [fetchDrafts, onConfirmed, toast]
  )

  return (
    <section
      className="overflow-hidden rounded-card border border-border bg-card shadow-e1"
      aria-labelledby="timesheet-drafts-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3">
        <div>
          <h2
            id="timesheet-drafts-title"
            className="flex items-center gap-2 font-semibold text-foreground"
          >
            <Clock3 className="h-4 w-4 text-primary" aria-hidden />
            Timesheet drafts
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {period
              ? `${formatEntryDate(period.start)} – ${formatEntryDate(period.end)}`
              : "Current Sydney week"}
          </p>
        </div>
      </div>

      <ViewStateBoundary
        state={viewState}
        errorTitle="Couldn't load timesheet drafts"
        emptyTitle="No timesheet drafts this week"
        emptyMessage="Meeting-based draft time entries will appear here for review."
        loadingRows={4}
        className="p-4"
      >
        {() => (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/20">
                <TableRow className="hover:bg-muted/20">
                  <TableHead>Member</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Client / MBA</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="[&_tr:nth-child(even)]:bg-muted/5">
                {drafts.map((draft) => {
                  const status = timesheetDraftStatusMeta(draft.status)
                  const actionable =
                    draft.status === "proposed" || status.blocked
                  return (
                    <TableRow
                      key={draft.id}
                      className="border-b border-border/20"
                    >
                      <TableCell className="font-medium text-foreground">
                        {draft.memberEmail}
                      </TableCell>
                      <TableCell className="num whitespace-nowrap">
                        {formatEntryDate(draft.entryDate)}
                      </TableCell>
                      <TableCell className="num whitespace-nowrap">
                        {formatTimesheetDuration(draft.durationMinutes)}
                      </TableCell>
                      <TableCell className="min-w-64">
                        <p className="font-medium text-foreground">
                          {draft.note}
                        </p>
                        {draft.campaignName ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {draft.campaignName}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <p>{draft.clientName || "Unmapped client"}</p>
                        <p className="num text-xs text-muted-foreground">
                          {draft.mbaNumber || "No MBA"}
                        </p>
                      </TableCell>
                      <TableCell className="min-w-48">
                        <Badge variant={status.variant} size="sm">
                          {status.label}
                        </Badge>
                        {status.blocked && draft.blockReason ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {draft.blockReason}
                          </p>
                        ) : null}
                        {status.showMappingLink ? (
                          <Link
                            href="/admin/myhours-mapping"
                            className="mt-1 inline-block text-xs font-medium text-primary underline-offset-4 hover:underline"
                          >
                            Open MyHours mapping
                          </Link>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {actionable ? (
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              size="sm"
                              disabled={busyId != null}
                              onClick={() => void actOnDraft(draft, "confirm")}
                            >
                              <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                              Confirm
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busyId != null}
                              onClick={() => void actOnDraft(draft, "skip")}
                            >
                              <Ban className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                              Skip
                            </Button>
                          </div>
                        ) : (
                          <span className="block text-right text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </ViewStateBoundary>
    </section>
  )
}
