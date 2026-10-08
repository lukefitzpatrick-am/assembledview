"use client"

import { useEffect, useRef, useState } from "react"

import { Section } from "@/components/layout/Section"
import { InvoiceDocumentButton } from "@/components/finance/InvoiceDocumentButton"
import { Button } from "@/components/ui/button"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { StatusPill } from "@/components/ui/status-pill"
import { INVOICE_STATUS } from "@/lib/design/status"
import { formatDateShort } from "@/lib/format/date"
import { formatMoney } from "@/lib/format/money"
import { fromCents } from "@/lib/money"

const PREVIEW_LIMIT = 10

export type ClientInvoiceState = "paid" | "due" | "overdue"

export type ClientInvoiceTableRow = {
  xeroInvoiceId: string
  invoiceNumber: string | null
  issueDate: string | null
  dueDate: string | null
  totalCents: number
  amountPaidCents: number
  hasPdf: boolean
  state: ClientInvoiceState
}

export type ClientInvoicesReady = {
  invoices: ClientInvoiceTableRow[]
  summary: { outstandingCents: number }
}

export type ClientInvoicesView =
  | { status: "loading" }
  | { status: "hidden" }
  | { status: "error" }
  | { status: "ready"; data: ClientInvoicesReady }

export type OutstandingInvoicesFeed = {
  count: number
  totalAmount: number
  nextInvoiceDate?: string
  paymentStatus?: "on-track" | "overdue" | "due-soon"
}

const COLUMNS: DataTableColumn<ClientInvoiceTableRow>[] = [
  {
    id: "invoice",
    header: "Invoice",
    accessor: (row) => row.invoiceNumber,
    cell: (row) => row.invoiceNumber?.trim() || "—",
    sortable: false,
  },
  {
    id: "issued",
    header: "Issued",
    accessor: (row) => row.issueDate,
    cell: (row) => formatDateShort(row.issueDate),
    sortable: false,
  },
  {
    id: "due",
    header: "Due",
    accessor: (row) => row.dueDate,
    cell: (row) => formatDateShort(row.dueDate),
    sortable: false,
  },
  {
    id: "amount",
    header: "Amount",
    accessor: (row) => row.totalCents,
    cell: (row) => formatMoney(fromCents(row.totalCents)),
    align: "right",
    sortable: false,
  },
  {
    id: "paid",
    header: "Paid",
    accessor: (row) => row.amountPaidCents,
    cell: (row) => formatMoney(fromCents(row.amountPaidCents)),
    align: "right",
    sortable: false,
  },
  {
    id: "status",
    header: "Status",
    accessor: (row) => INVOICE_STATUS[row.state].label,
    cell: (row) => {
      const status = INVOICE_STATUS[row.state]
      return <StatusPill tone={status.tone} label={status.label} />
    },
    sortable: false,
  },
  {
    id: "pdf",
    header: "PDF",
    accessor: (row) => row.hasPdf,
    cell: (row) => (
      <InvoiceDocumentButton
        xeroInvoiceId={row.xeroInvoiceId}
        invoiceNumber={row.invoiceNumber}
        available={row.hasPdf}
      />
    ),
    sortable: false,
    csv: false,
  },
]

function isInvoiceRow(value: unknown): value is ClientInvoiceTableRow {
  if (!value || typeof value !== "object") return false
  const row = value as Record<string, unknown>
  return (
    typeof row.xeroInvoiceId === "string" &&
    (row.invoiceNumber === null || typeof row.invoiceNumber === "string") &&
    (row.issueDate === null || typeof row.issueDate === "string") &&
    (row.dueDate === null || typeof row.dueDate === "string") &&
    typeof row.totalCents === "number" &&
    Number.isFinite(row.totalCents) &&
    typeof row.amountPaidCents === "number" &&
    Number.isFinite(row.amountPaidCents) &&
    typeof row.hasPdf === "boolean" &&
    (row.state === "paid" || row.state === "due" || row.state === "overdue")
  )
}

export function readClientInvoicesPayload(body: unknown): ClientInvoicesReady | null {
  if (!body || typeof body !== "object") return null
  const record = body as Record<string, unknown>
  if (!Array.isArray(record.invoices) || !record.invoices.every(isInvoiceRow)) return null
  const summary = record.summary
  if (!summary || typeof summary !== "object") return null
  const outstandingCents = (summary as Record<string, unknown>).outstandingCents
  if (typeof outstandingCents !== "number" || !Number.isFinite(outstandingCents)) return null
  return { invoices: record.invoices, summary: { outstandingCents } }
}

/** 404 hides the section. Any other non-200, or a 200 that is not the payload, is an error. */
export function clientInvoicesViewFromHttp(status: number, body: unknown): ClientInvoicesView {
  if (status === 404) return { status: "hidden" }
  if (status !== 200) return { status: "error" }
  const data = readClientInvoicesPayload(body)
  if (!data) return { status: "error" }
  return { status: "ready", data }
}

export function outstandingInvoicesFeed(data: ClientInvoicesReady): OutstandingInvoicesFeed {
  const open = data.invoices.filter((row) => row.state !== "paid")
  const dates = open
    .map((row) => row.dueDate)
    .filter((value): value is string => Boolean(value && value.trim()))
    .sort()
  const overdue = open.some((row) => row.state === "overdue")
  return {
    count: open.length,
    totalAmount: fromCents(data.summary.outstandingCents),
    ...(dates[0] ? { nextInvoiceDate: dates[0] } : {}),
    paymentStatus: open.length === 0 ? "on-track" : overdue ? "overdue" : "due-soon",
  }
}

function summaryLine(data: ClientInvoicesReady): string {
  const count = data.invoices.filter((row) => row.state !== "paid").length
  const amount = formatMoney(fromCents(data.summary.outstandingCents))
  return `${count} outstanding, ${amount} due. Amounts include GST.`
}

export function ClientInvoicesSection({
  view,
  onRetry,
}: {
  view: ClientInvoicesView
  onRetry?: () => void
}) {
  const [showAll, setShowAll] = useState(false)

  if (view.status === "hidden") return null

  if (view.status === "loading") {
    return (
      <Section title="Invoices">
        <LoadingState rows={4} />
      </Section>
    )
  }

  if (view.status === "error") {
    return (
      <Section title="Invoices">
        <ErrorState
          title="Could not load invoices"
          message="Try again in a moment."
          onRetry={onRetry}
        />
      </Section>
    )
  }

  const invoices = view.data.invoices
  const visible = showAll ? invoices : invoices.slice(0, PREVIEW_LIMIT)

  return (
    <Section
      title="Invoices"
      description={invoices.length > 0 ? summaryLine(view.data) : undefined}
    >
      {invoices.length === 0 ? (
        <EmptyState title="No invoices yet." message="" />
      ) : (
        <>
          <DataTable columns={COLUMNS} rows={visible} getRowId={(row) => row.xeroInvoiceId} />
          {invoices.length > PREVIEW_LIMIT && !showAll ? (
            <div className="mt-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowAll(true)}>
                Show all
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Section>
  )
}

export function ClientInvoicesPanel({
  slug,
  onOutstanding,
}: {
  slug: string
  onOutstanding?: (outstanding: OutstandingInvoicesFeed | null) => void
}) {
  const [view, setView] = useState<ClientInvoicesView>({ status: "loading" })
  const [retryToken, setRetryToken] = useState(0)
  const onOutstandingRef = useRef(onOutstanding)
  onOutstandingRef.current = onOutstanding

  useEffect(() => {
    let cancelled = false
    setView({ status: "loading" })
    onOutstandingRef.current?.(null)

    fetch(`/api/dashboard/${encodeURIComponent(slug)}/invoices`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as unknown
        if (cancelled) return
        const next = clientInvoicesViewFromHttp(res.status, body)
        setView(next)
        onOutstandingRef.current?.(
          next.status === "ready" ? outstandingInvoicesFeed(next.data) : null,
        )
      })
      .catch(() => {
        if (cancelled) return
        setView({ status: "error" })
        onOutstandingRef.current?.(null)
      })

    return () => {
      cancelled = true
    }
  }, [slug, retryToken])

  return (
    <ClientInvoicesSection
      view={view}
      onRetry={() => setRetryToken((current) => current + 1)}
    />
  )
}
