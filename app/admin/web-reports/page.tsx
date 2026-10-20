"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

import { AdminGuard } from "@/components/guards/AdminGuard"
import { PageHeader } from "@/components/layout/PageHeader"
import { PageShell } from "@/components/layout/PageShell"
import { Button } from "@/components/ui/button"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { StatusPill } from "@/components/ui/status-pill"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { formatDateShort } from "@/lib/format/date"
import type { Tone } from "@/lib/design/status"
import type { AdminWebReportListRow, AdminWebReportStatus } from "@/lib/webReport/admin/list"

type ListResponse = {
  ready: boolean
  rows: AdminWebReportListRow[]
  error?: string
}

function statusTone(status: AdminWebReportStatus): Tone {
  if (status === "published") return "outcome"
  if (status === "draft") return "attention"
  return "neutral"
}

function statusLabel(status: AdminWebReportStatus): string {
  if (status === "published") return "Published"
  if (status === "draft") return "Draft"
  return "None"
}

function UpdatedCell({ row }: { row: AdminWebReportListRow }) {
  if (!row.updatedAt && !row.updatedBy) return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex flex-col">
      <span className="num">{formatDateShort(row.updatedAt)}</span>
      {row.updatedBy ? <span className="text-xs text-muted-foreground">{row.updatedBy}</span> : null}
    </div>
  )
}

function ActionsCell({ row }: { row: AdminWebReportListRow }) {
  if (!row.slug) return <span className="text-muted-foreground">No slug</span>
  const slug = encodeURIComponent(row.slug)
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="link" size="sm" className="h-auto px-0" asChild>
        <Link href={`/admin/web-reports/${slug}`}>Edit report</Link>
      </Button>
      <Button variant="link" size="sm" className="h-auto px-0" asChild>
        <Link href={`/dashboard/${slug}/web`}>View</Link>
      </Button>
      <Button variant="link" size="sm" className="h-auto px-0" asChild>
        <Link href={`/client/${slug}#platform-accounts`}>Edit accounts</Link>
      </Button>
    </div>
  )
}

const columns: DataTableColumn<AdminWebReportListRow>[] = [
  {
    id: "client",
    header: "Client",
    accessor: (row) => row.clientName,
  },
  {
    id: "ga4",
    header: "GA4",
    accessor: (row) => row.ga4Label,
  },
  {
    id: "gsc",
    header: "Search Console",
    accessor: (row) => row.gscLabel,
  },
  {
    id: "status",
    header: "Status",
    accessor: (row) => row.status,
    cell: (row) => <StatusPill tone={statusTone(row.status)} label={statusLabel(row.status)} />,
  },
  {
    id: "updated",
    header: "Updated",
    accessor: (row) => row.updatedAt ?? "",
    cell: (row) => <UpdatedCell row={row} />,
  },
  {
    id: "clientTab",
    header: "Client can see it",
    accessor: (row) => (row.clientTabOn ? "Yes" : "No"),
  },
  {
    id: "actions",
    header: "Actions",
    accessor: () => "",
    cell: (row) => <ActionsCell row={row} />,
    csv: false,
    sortable: false,
  },
]

function WebReportsPageInner() {
  const [rows, setRows] = useState<AdminWebReportListRow[]>([])
  const [ready, setReady] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/admin/web-reports")
      const body = (await response.json().catch(() => null)) as ListResponse | null
      if (!response.ok) {
        setRows([])
        setError(body?.error || "Could not load Web & search reports.")
        return
      }
      setReady(body?.ready !== false)
      setRows(body?.rows ?? [])
    } catch {
      setRows([])
      setError("Could not load Web & search reports.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <PageShell>
      <PageHeader
        title="Web & search reports"
        lede="Every client is listed. Open Edit report to pick their GA4 property and Search Console site and build the report. A client sees their Web & search tab only once the report is saved and published."
      />
      {loading ? <LoadingState /> : null}
      {!loading && error ? (
        <ErrorState title="Web & search reports unavailable" message={error} onRetry={() => void load()} />
      ) : null}
      {!loading && !error && !ready ? (
        <EmptyState
          title="Reports are not ready"
          message="This list reads client_web_reports after migration 0098 is applied."
        />
      ) : null}
      {!loading && !error && ready && rows.length === 0 ? (
        <EmptyState
          title="No linked clients"
          message="No clients have a dashboard slug yet."
        />
      ) : null}
      {!loading && !error && ready && rows.length > 0 ? (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(row) => String(row.clientId)}
          initialSort={{ id: "client", direction: "asc" }}
          csvFilename="web-search-reports"
        />
      ) : null}
    </PageShell>
  )
}

export default function AdminWebReportsPage() {
  return (
    <AdminGuard>
      <WebReportsPageInner />
    </AdminGuard>
  )
}
