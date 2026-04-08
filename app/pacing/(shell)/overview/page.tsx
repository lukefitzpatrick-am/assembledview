"use client"

import { PacingSummaryCards } from "@/components/pacing/PacingSummaryCards"
import { PacingAlertsPanel } from "@/components/pacing/PacingAlertsPanel"
import { LineItemPacingTable } from "@/components/pacing/LineItemPacingTable"
import {
  PacingOverviewDataProvider,
  usePacingOverviewData,
} from "@/components/pacing/PacingOverviewDataContext"
import { DeliveryPacingDrawer } from "@/components/pacing/DeliveryPacingDrawer"
import { usePacingFilterStore } from "@/lib/pacing/usePacingFilterStore"

function PacingOverviewBody() {
  const { drawerLineItem, closeDrawer, clientNameById } = usePacingOverviewData()
  const filterDateTo = usePacingFilterStore((s) => s.filters.date_to)

  const clientLabel =
    drawerLineItem != null
      ? clientNameById.get(drawerLineItem.clients_id) ?? `Client ${drawerLineItem.clients_id}`
      : ""

  return (
    <>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Line-item pacing from Snowflake, scoped to your filters.
        </p>
      </header>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_min(340px,100%)] lg:items-start">
        <div className="min-w-0 space-y-8">
          <PacingSummaryCards />
          <LineItemPacingTable />
        </div>
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <PacingAlertsPanel />
        </aside>
      </div>
      <DeliveryPacingDrawer
        row={drawerLineItem}
        open={drawerLineItem != null}
        onOpenChange={(o) => {
          if (!o) closeDrawer()
        }}
        filterDateTo={filterDateTo}
        clientLabel={clientLabel}
      />
    </>
  )
}

export default function PacingOverviewPage() {
  return (
    <div className="space-y-6">
      <PacingOverviewDataProvider>
        <PacingOverviewBody />
      </PacingOverviewDataProvider>
    </div>
  )
}
