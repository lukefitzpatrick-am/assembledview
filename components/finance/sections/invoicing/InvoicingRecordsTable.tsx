"use client"

import React, { useMemo } from "react"
import { BillingStateBadge } from "@/components/finance/BillingStateBadge"
import { InvoicingPlanRow } from "@/components/finance/sections/invoicing/InvoicingPlanRow"
import { Badge } from "@/components/ui/badge"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { formatAUD } from "@/lib/format/money"
import { formatDateShort } from "@/lib/format/date"
import { billingDifferencePill, billingMonthChipLabel } from "@/lib/finance/sections/billingPresentation"
import type { InvoicingClientBlockerMeta } from "@/lib/finance/sections/invoicingRowPresentation"
import type { InlineScheduleEditContext } from "@/lib/finance/commitInlineScheduleAmountEdit"
import { receivableRecordSectionLabel, type MediaPlanGroup } from "@/lib/finance/useReceivablesData"
import type { BillingLineItem, BillingRecord } from "@/lib/types/financeBilling"

export type InvoicingTableRow = {
  record: BillingRecord
  kind: "media" | "sow" | "retainer"
  mp: MediaPlanGroup | null
}

function approvedByLabel(record: BillingRecord): string {
  if (!record.approved_at) return "Waiting"
  return formatDateShort(record.approved_at)
}

function referenceLabel(record: BillingRecord): string {
  if (record.mba_number) return `(${record.mba_number})`
  return record.campaign_name || "—"
}

function typeLabel(record: BillingRecord): string {
  const type = receivableRecordSectionLabel(record.billing_type)
  const month = billingMonthChipLabel(record.billing_month)
  return month ? `${type}, ${month}` : type
}

export function InvoicingRecordsTable({
  rows,
  refetch,
  onNotesSaved,
  onLineAmountCommitted,
  clientMetaById,
}: {
  rows: InvoicingTableRow[]
  refetch: () => void
  onNotesSaved?: (result: {
    invoice_key: string
    notes: string
    persisted_record_id: number
  }) => void
  onLineAmountCommitted?: (
    line: BillingLineItem,
    next: { amount: number; billing_mode?: "auto" | "manual" | null },
    ctx: InlineScheduleEditContext
  ) => void
  clientMetaById: Map<number, InvoicingClientBlockerMeta>
}) {
  const columns = useMemo<DataTableColumn<InvoicingTableRow>[]>(
    () => [
      {
        id: "client",
        header: "Client",
        accessor: (row) => row.record.client_name,
      },
      {
        id: "reference",
        header: "Reference",
        accessor: (row) => referenceLabel(row.record),
        cell: (row) => <span className="num">{referenceLabel(row.record)}</span>,
      },
      {
        id: "type",
        header: "Type",
        accessor: (row) => typeLabel(row.record),
      },
      {
        id: "state",
        header: "State",
        accessor: (row) => row.record.state ?? "ready",
        cell: (row) => (
          <BillingStateBadge
            state={row.record.state ?? "ready"}
            reason={row.record.state_reason}
            approvedDrift={row.record.approved_drift === true}
          />
        ),
      },
      {
        id: "expected",
        header: "Expected",
        align: "right",
        accessor: (row) => row.record.total,
        cell: (row) => <span className="num">{formatAUD(row.record.total)}</span>,
      },
      {
        id: "inXero",
        header: "In Xero",
        accessor: () => null,
        sortable: false,
        cell: () => <span className="text-muted-foreground">Not in Xero</span>,
      },
      {
        id: "difference",
        header: "Difference",
        accessor: () => null,
        sortable: false,
        cell: (row) => {
          const pill = billingDifferencePill(row.record.total, null)
          if (!pill) return null
          return (
            <Badge size="sm" variant={pill.tone}>
              {pill.text}
            </Badge>
          )
        },
      },
      {
        id: "approvedBy",
        header: "Approved by",
        accessor: (row) => row.record.approved_at ?? "",
        cell: (row) => approvedByLabel(row.record),
      },
      {
        id: "actions",
        header: "Actions",
        accessor: () => "",
        sortable: false,
        csv: false,
        cell: (row) => (
          <InvoicingPlanRow
            record={row.record}
            mp={row.mp}
            kind={row.kind}
            refetch={refetch}
            onNotesSaved={onNotesSaved}
            onLineAmountCommitted={onLineAmountCommitted}
            clientMeta={clientMetaById.get(row.record.clients_id) ?? null}
            actionsOnly
          />
        ),
      },
    ],
    [clientMetaById, onLineAmountCommitted, onNotesSaved, refetch]
  )

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowId={(row) =>
        row.record.invoice_key ||
        `${row.record.billing_type}:${row.record.id}:${row.record.billing_month}`
      }
      caption="Clients billing"
    />
  )
}
