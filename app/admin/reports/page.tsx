"use client"

import { useCallback, useEffect, useState } from "react"

import { AdminGuard } from "@/components/guards/AdminGuard"
import { PageHeader } from "@/components/layout/PageHeader"
import { PageShell } from "@/components/layout/PageShell"
import { Button } from "@/components/ui/button"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { Input } from "@/components/ui/input"
import { StatusPill } from "@/components/ui/status-pill"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { useToast } from "@/components/ui/use-toast"
import { getMelbourneTodayISO } from "@/lib/dates/melbourne"
import type { Tone } from "@/lib/design/status"
import { formatDateShort } from "@/lib/format/date"
import { previousSydneyMonth } from "@/lib/reports/selectMonthlyReportMbas"

type ReportRunRow = {
  id: string
  clientName: string | null
  mbaNumber: string
  status: string
  skipReason: string | null
  error: string | null
  commentaryGenerated: boolean | null
  finishedAt: string | null
  blobPathname: string | null
}

type ListResponse = {
  periodStart: string
  periodEnd: string
  rows: ReportRunRow[]
}

type EnqueueResponse = {
  selected: number
  queued: number
  alreadyPresent: number
}

function defaultReportMonth(): string {
  return previousSydneyMonth(getMelbourneTodayISO()).periodStart.slice(0, 7)
}

function statusTone(status: string): Tone {
  if (status === "generated") return "outcome"
  if (status === "failed") return "critical"
  return "neutral"
}

function statusLabel(status: string): string {
  switch (status) {
    case "generated":
      return "Generated"
    case "queued":
      return "Queued"
    case "generating":
      return "Generating"
    case "skipped":
      return "Skipped"
    case "failed":
      return "Failed"
    default:
      return status
  }
}

function statusReason(row: ReportRunRow): string | null {
  if (row.status === "skipped") return row.skipReason
  if (row.status === "failed") return row.error
  return null
}

function ReportStatusCell({ row }: { row: ReportRunRow }) {
  const reason = statusReason(row)
  return (
    <div className="flex flex-col items-start gap-1">
      <StatusPill tone={statusTone(row.status)} label={statusLabel(row.status)} />
      {reason ? <span className="max-w-[28ch] text-xs text-muted-foreground">{reason}</span> : null}
    </div>
  )
}

function DownloadCell({ row }: { row: ReportRunRow }) {
  if (row.status !== "generated" || !row.blobPathname) return null
  const href = `/api/reports/download?path=${encodeURIComponent(row.blobPathname)}`
  return (
    <Button variant="link" size="sm" className="h-auto px-0" asChild>
      <a href={href}>Download</a>
    </Button>
  )
}

function GenerateCell({
  row,
  busyId,
  onGenerate,
}: {
  row: ReportRunRow
  busyId: string | null
  onGenerate: (id: string) => void
}) {
  const busy = busyId === row.id
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={busyId !== null}
      onClick={() => onGenerate(row.id)}
    >
      {busy ? "Generating" : "Generate now"}
    </Button>
  )
}

function reportColumns(
  busyId: string | null,
  onGenerate: (id: string) => void,
): DataTableColumn<ReportRunRow>[] {
  return [
    {
      id: "client",
      header: "Client",
      accessor: (row) => row.clientName ?? "",
      cell: (row) => row.clientName || "No client",
    },
    {
      id: "mba",
      header: "MBA",
      accessor: (row) => row.mbaNumber,
    },
    {
      id: "status",
      header: "Status",
      accessor: (row) => row.status,
      cell: (row) => <ReportStatusCell row={row} />,
    },
    {
      id: "commentary",
      header: "Commentary",
      accessor: (row) => (row.commentaryGenerated ? "Yes" : "No"),
    },
    {
      id: "generatedAt",
      header: "Generated at",
      accessor: (row) => row.finishedAt ?? "",
      cell: (row) => (row.finishedAt ? formatDateShort(row.finishedAt) : "Not yet"),
    },
    {
      id: "download",
      header: "Download",
      accessor: () => "",
      cell: (row) => <DownloadCell row={row} />,
      csv: false,
      sortable: false,
    },
    {
      id: "generate",
      header: "Generate",
      accessor: () => "",
      cell: (row) => <GenerateCell row={row} busyId={busyId} onGenerate={onGenerate} />,
      csv: false,
      sortable: false,
    },
  ]
}

function ReportsPageInner() {
  const { toast } = useToast()
  const [month, setMonth] = useState(defaultReportMonth)
  const [rows, setRows] = useState<ReportRunRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [queueing, setQueueing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/reports?period=${encodeURIComponent(month)}`)
      const body = (await response.json().catch(() => null)) as
        | (ListResponse & { error?: string })
        | null
      if (!response.ok) {
        setRows([])
        setError(body?.error || "Could not load reports.")
        return
      }
      setRows(body?.rows ?? [])
    } catch {
      setRows([])
      setError("Could not load reports.")
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => {
    void load()
  }, [load])

  async function queueMonth() {
    setQueueing(true)
    try {
      const response = await fetch("/api/admin/reports/enqueue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ period: month }),
      })
      const body = (await response.json().catch(() => null)) as
        | (EnqueueResponse & { error?: string })
        | null
      if (!response.ok) {
        toast({
          title: "Could not queue reports",
          description: body?.error || "Try again.",
          variant: "destructive",
        })
        return
      }
      const queued = body?.queued ?? 0
      const alreadyPresent = body?.alreadyPresent ?? 0
      const selected = body?.selected ?? 0
      toast({
        title: selected === 0 ? "No live MBAs overlap that month" : "Queued for the month",
        description:
          selected === 0
            ? "Nothing was added. The worker still only runs on the 4th and 5th."
            : `Added ${queued}. ${alreadyPresent} already present. The worker generates them on the 4th and 5th.`,
      })
      await load()
    } catch {
      toast({
        title: "Could not queue reports",
        description: "Try again.",
        variant: "destructive",
      })
    } finally {
      setQueueing(false)
    }
  }

  async function generateNow(id: string) {
    setBusyId(id)
    try {
      const response = await fetch(`/api/admin/reports/runs/${encodeURIComponent(id)}/generate`, {
        method: "POST",
      })
      const body = (await response.json().catch(() => null)) as { error?: string; status?: string } | null
      if (!response.ok) {
        toast({
          title: "Generate now failed",
          description: body?.error || "The row has been marked failed.",
          variant: "destructive",
        })
      } else if (body?.status === "skipped") {
        toast({
          title: "Report skipped",
          description: "No deck was stored for this MBA.",
        })
      } else {
        toast({
          title: "Report generated",
          description: "Download is ready on this row.",
        })
      }
      await load()
    } catch {
      toast({
        title: "Generate now failed",
        description: "Try again.",
        variant: "destructive",
      })
    } finally {
      setBusyId(null)
    }
  }

  const columns = reportColumns(busyId, (id) => {
    void generateNow(id)
  })

  return (
    <PageShell>
      <PageHeader
        title="Reports"
        lede="Queue for the month only adds missing rows. The worker generates those reports on the 4th and 5th."
      />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-44 flex-col gap-1 text-sm text-muted-foreground">
          Month
          <Input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            aria-label="Report month"
          />
        </label>
        <Button type="button" onClick={() => void queueMonth()} disabled={queueing || busyId !== null}>
          {queueing ? "Queueing" : "Queue for the month"}
        </Button>
      </div>
      {loading ? <LoadingState /> : null}
      {!loading && error ? (
        <ErrorState title="Reports unavailable" message={error} onRetry={() => void load()} />
      ) : null}
      {!loading && !error && rows.length === 0 ? (
        <EmptyState
          title="No reports for this month"
          message="Queue for the month adds the live MBAs. The worker generates them on the 4th and 5th."
        />
      ) : null}
      {!loading && !error && rows.length > 0 ? (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(row) => row.id}
          initialSort={{ id: "client", direction: "asc" }}
          csvFilename={`report-runs-${month}`}
        />
      ) : null}
    </PageShell>
  )
}

export default function AdminReportsPage() {
  return (
    <AdminGuard>
      <ReportsPageInner />
    </AdminGuard>
  )
}
