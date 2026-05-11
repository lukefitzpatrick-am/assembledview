"use client"

import { useMemo } from "react"
import { PacingSummaryRow } from "@/components/pacing/PacingSummaryRow"
import { PacingAlertsAside } from "@/components/pacing/PacingAlertsAside"
import { PacingLineItemTable } from "@/components/pacing/PacingLineItemTable"
import { PacingLineItemDrawer } from "@/components/pacing/PacingLineItemDrawer"
import {
  PacingOverviewDataProvider,
  usePacingOverviewData,
} from "@/components/pacing/PacingOverviewDataContext"
import { usePacingFilterStore } from "@/lib/pacing/usePacingFilterStore"

function PacingOverviewBody() {
  const { drawerLineItem, closeDrawer, clientNameById, historyById } = usePacingOverviewData()
  const filterDateTo = usePacingFilterStore((s) => s.filters.date_to)

  const clientLabel =
    drawerLineItem != null
      ? clientNameById.get(drawerLineItem.clients_id) ?? `Client ${drawerLineItem.clients_id}`
      : ""

  const drawerPacingHistory = useMemo(() => {
    if (!drawerLineItem) return undefined
    return historyById.get(drawerLineItem.av_line_item_id) ?? []
  }, [drawerLineItem, historyById])

  return (
    <>
      <PacingSummaryRow />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_min(340px,100%)] lg:items-start">
        <div className="min-w-0">
          <PacingLineItemTable />
        </div>
        <div className="lg:sticky lg:top-32 lg:self-start">
          <PacingAlertsAside />
        </div>
      </div>

      <PacingLineItemDrawer
        row={drawerLineItem}
        open={drawerLineItem != null}
        onOpenChange={(o) => {
          if (!o) closeDrawer()
        }}
        filterDateTo={filterDateTo}
        clientLabel={clientLabel}
        pacingHistory={drawerPacingHistory}
      />
    </>
  )
}

export default function PacingOverviewPage() {
  return (
    <PacingOverviewDataProvider>
      <PacingOverviewBody />
    </PacingOverviewDataProvider>
  )
}
