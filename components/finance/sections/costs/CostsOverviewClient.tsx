"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { BaseChartCard, GroupedBarChart, TreemapChart } from "@/components/charts/system"
import { CostsSubNav } from "@/components/finance/sections/costs/CostsSubNav"
import { EmptyState } from "@/components/finance/sections/EmptyState"
import { ErrorState } from "@/components/finance/sections/ErrorState"
import { LoadingState } from "@/components/finance/sections/LoadingState"
import { SectionScopeBar } from "@/components/finance/sections/SectionScopeBar"
import { StatTile, type StatTileMoneyState } from "@/components/finance/sections/StatTile"
import { FinanceSectionsShell } from "@/components/finance/sections/FinanceSectionsShell"
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/layout/Panel"
import { fetchFinanceSectionsJson } from "@/lib/finance/sections/api"
import type { FinanceCostsSummaryPayload } from "@/lib/finance/sections/costsQuery"
import { fyDisplayLabel } from "@/lib/finance/months"
import { formatMoney } from "@/lib/format/money"
import {
  useFinanceScopeApplied,
  useFinanceScopeStore,
  useFinanceScopeVersion,
} from "@/lib/finance/sections/useFinanceScope"
import type { ViewState } from "@/lib/ui/viewState"

function blockToTileState(
  vs: ViewState<FinanceCostsSummaryPayload>,
  pick: (d: FinanceCostsSummaryPayload) => number
): StatTileMoneyState {
  if (vs.status === "loading") return { status: "loading" }
  if (vs.status === "error") return { status: "error", message: vs.message }
  if (vs.status === "empty" || vs.status === "filtered-empty") return { status: "empty" }
  return { status: "ready", cents: pick(vs.data) }
}

export function CostsOverviewClient() {
  const applied = useFinanceScopeApplied()
  const scopeVersion = useFinanceScopeVersion()
  const [view, setView] = useState<ViewState<FinanceCostsSummaryPayload>>({
    status: "loading",
  })

  const load = useCallback(() => {
    setView({ status: "loading" })
    const params = useFinanceScopeStore.getState().toSearchParams()
    void fetchFinanceSectionsJson<FinanceCostsSummaryPayload>(
      "/api/finance/sections/costs/summary",
      params,
      { retry: () => load() }
    ).then(setView)
  }, [])

  useEffect(() => {
    load()
  }, [
    load,
    scopeVersion,
    applied.fy,
    applied.monthRange.from,
    applied.monthRange.to,
    applied.clients.join(","),
  ])

  const showingLabel =
    view.status === "ready"
      ? `Showing costs for FY${fyDisplayLabel(view.data.scope.fy)} · ${view.data.scope.from} → ${view.data.scope.to}`
      : undefined

  const trendData =
    view.status === "ready"
      ? view.data.byMonth.map((row) => ({
          month: row.month,
          Booked: row.bookedCents / 100,
          "AP billed": row.apBilledCents / 100,
        }))
      : []

  const treemapData =
    view.status === "ready"
      ? view.data.byPublisher
          .filter((p) => p.bookedCents > 0)
          .slice(0, 24)
          .map((p) => ({
            label: p.publisher,
            value: p.bookedCents / 100,
          }))
      : []

  return (
    <FinanceSectionsShell title="Costs" scopeBar={<SectionScopeBar showingLabel={showingLabel} />}>
      <div className="space-y-6">
        <CostsSubNav />
        <p className="text-sm text-muted-foreground">
          Booked publisher cost (delivery media) vs Xero AP bills.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Booked cost FYTD"
            basisCaption={
              view.status === "ready"
                ? view.data.kpis.basis
                : "Booked cost = media on the delivery schedule · campaign statuses approved/booked/completed"
            }
            state={blockToTileState(view, (d) => d.kpis.bookedCostFytdCents)}
          />
          <StatTile
            label="AP billed FYTD"
            basisCaption="xero_ap_bills.total · activity_month in scope"
            state={blockToTileState(view, (d) => d.kpis.apBilledFytdCents)}
          />
          <StatTile
            label="Unbilled accrual"
            basisCaption="booked cost − AP billed (headline, not period-locked)"
            state={blockToTileState(view, (d) => d.kpis.unbilledAccrualCents)}
          />
          <Link
            href="/finance/costs/client-pays"
            className="interactive block rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <StatTile
              label="Client-paid media"
              basisCaption="Excluded from Assembled payables · open detail"
              state={blockToTileState(view, (d) => d.coverage.clientPaysExcludedCents)}
            />
          </Link>
        </div>

        {view.status === "ready" ? (
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              Fee (delivery): {formatMoney(view.data.kpis.feeCents / 100)} · Adserving (delivery):{" "}
              {formatMoney(view.data.kpis.adservingCents / 100)} — labelled separately; not in booked
              cost.
            </p>
            <p>{view.data.coverage.excludedByStatusCaption}</p>
            <p>
              Coverage: {view.data.coverage.bookedWithPublisherIdentityPct}% of booked cost has a
              publisher identity; {view.data.coverage.bookedInMonthsWithAnyApBillPct}% falls in months
              with any AP bill. Orphan schedule media:{" "}
              {formatMoney(view.data.coverage.orphanLineCents / 100)}.{" "}
              {view.data.coverage.note}
            </p>
          </div>
        ) : null}

        {view.status === "loading" ? <LoadingState rows={5} /> : null}
        {view.status === "error" ? (
          <ErrorState title="Unable to load costs" message={view.message} onRetry={view.retry} />
        ) : null}
        {view.status === "empty" ? (
          <EmptyState title="No cost data" message="Nothing in scope for this FY range." />
        ) : null}

        {view.status === "ready" ? (
          <>
            <div className="grid gap-3 lg:grid-cols-2">
              <BaseChartCard
                title="Publisher spend (booked, delivery)"
                subtitle="From costs/summary — not global-monthly-* dashboard endpoints"
                className="overflow-hidden rounded-card border border-border bg-card shadow-e1"
              >
                {treemapData.length === 0 ? (
                  <EmptyState
                    className="min-h-0 border-0 bg-transparent py-8"
                    title="No publisher spend"
                    message="No delivery-basis booked cost with identity in this scope."
                  />
                ) : treemapData.length >= 4 ? (
                  <TreemapChart data={treemapData} className="min-h-[300px] w-full" />
                ) : (
                  <GroupedBarChart
                    data={treemapData.map((d) => ({
                      publisher: d.label,
                      Booked: d.value,
                    }))}
                    xKey="publisher"
                    series={[{ key: "Booked", label: "Booked", color: "var(--av-chart-1)" }]}
                    valueFormat="dollars"
                    className="min-h-[300px] w-full"
                  />
                )}
              </BaseChartCard>

              <Panel>
                <PanelHeader>
                  <PanelTitle>Top publishers</PanelTitle>
                </PanelHeader>
                <PanelContent>
                  {view.data.topPublishers.length === 0 ? (
                    <EmptyState
                      className="min-h-0 border-0 bg-transparent py-6"
                      title="No publishers"
                      message="No booked delivery cost in this scope."
                    />
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-muted-foreground">
                          <th className="py-2 font-medium">Publisher</th>
                          <th className="py-2 text-right font-medium">Booked</th>
                        </tr>
                      </thead>
                      <tbody>
                        {view.data.topPublishers.map((row) => (
                          <tr
                            key={row.publisher}
                            className="interactive-row border-b border-border/60"
                          >
                            <td className="py-2">
                              <Link
                                href={`/finance/costs/invoices?publishers=${encodeURIComponent(row.publisher)}`}
                                className="text-foreground underline-offset-2 hover:underline"
                              >
                                {row.publisher}
                              </Link>
                            </td>
                            <td className="num py-2 text-right">
                              {formatMoney(row.bookedCents / 100)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </PanelContent>
              </Panel>
            </div>

            <BaseChartCard
              title="Booked vs AP billed by month"
              subtitle={`FY${fyDisplayLabel(view.data.scope.fy)} · delivery booked vs xero_ap_bills`}
              className="overflow-hidden rounded-card border border-border bg-card shadow-e1"
            >
              {trendData.length === 0 ? (
                <EmptyState
                  className="min-h-0 border-0 bg-transparent py-8"
                  title="No months in range"
                  message="Adjust the scope month range and Apply."
                />
              ) : (
                <GroupedBarChart
                  data={trendData}
                  xKey="month"
                  series={[
                    { key: "Booked", label: "Booked", color: "var(--av-chart-1)" },
                    { key: "AP billed", label: "AP billed", color: "var(--av-chart-2)" },
                  ]}
                  valueFormat="dollars"
                  className="min-h-[300px] w-full"
                />
              )}
            </BaseChartCard>
          </>
        ) : null}
      </div>
    </FinanceSectionsShell>
  )
}
