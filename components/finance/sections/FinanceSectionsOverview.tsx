"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { BaseChartCard, GroupedBarChart } from "@/components/charts/system"
import { EmptyState } from "@/components/finance/sections/EmptyState"
import { ErrorState } from "@/components/finance/sections/ErrorState"
import { FinanceChromeDemo } from "@/components/finance/sections/FinanceChromeDemo"
import { LoadingState } from "@/components/finance/sections/LoadingState"
import { SectionScopeBar } from "@/components/finance/sections/SectionScopeBar"
import { StatTile, type StatTileMoneyState } from "@/components/finance/sections/StatTile"
import { FinanceSectionsShell } from "@/components/finance/sections/FinanceSectionsShell"
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/layout/Panel"
import { fetchFinanceSectionsJson } from "@/lib/finance/sections/api"
import { formatMoney } from "@/lib/format/money"
import { fyDisplayLabel } from "@/lib/finance/months"
import type { FinanceSectionsSummaryPayload } from "@/lib/finance/sections/summaryQuery"
import {
  useFinanceScopeApplied,
  useFinanceScopeStore,
  useFinanceScopeVersion,
} from "@/lib/finance/sections/useFinanceScope"
import type { ViewState } from "@/lib/ui/viewState"
import { PeriodStatusChip } from "@/components/finance/sections/periods/PeriodStatusChip"
import type { FinancePeriodStatus } from "@/lib/finance/periods/types"

function blockToTileState(
  vs: ViewState<FinanceSectionsSummaryPayload>,
  pick: (d: FinanceSectionsSummaryPayload) => { cents: number }
): StatTileMoneyState {
  if (vs.status === "loading") return { status: "loading" }
  if (vs.status === "error") return { status: "error", message: vs.message }
  if (vs.status === "empty" || vs.status === "filtered-empty") return { status: "empty" }
  return { status: "ready", cents: pick(vs.data).cents }
}

function investmentHref(clientName?: string, publisher?: string): string {
  const p = new URLSearchParams()
  if (clientName) p.set("client", clientName)
  if (publisher) p.set("publisher", publisher)
  const qs = p.toString()
  return qs ? `/finance/investment?${qs}` : "/finance/investment"
}

export function FinanceSectionsOverview() {
  const applied = useFinanceScopeApplied()
  const scopeVersion = useFinanceScopeVersion()
  const searchParams = useSearchParams()
  const chromeDemo = searchParams?.get("chromeDemo") === "1"
  const [view, setView] = useState<ViewState<FinanceSectionsSummaryPayload>>({
    status: "loading",
  })

  const load = useCallback(() => {
    setView({ status: "loading" })
    const params = useFinanceScopeStore.getState().toSearchParams()
    void fetchFinanceSectionsJson<FinanceSectionsSummaryPayload>(
      "/api/finance/sections/summary",
      params,
      { retry: () => load() }
    ).then(setView)
  }, [])

  useEffect(() => {
    load()
  }, [load, scopeVersion, applied.fy, applied.monthRange.from, applied.monthRange.to, applied.clients.join(",")])

  const showingLabel =
    view.status === "ready"
      ? `Showing summary for FY${fyDisplayLabel(view.data.scope.fy)} · ${view.data.scope.from} → ${view.data.scope.to}`
      : undefined

  const chartData =
    view.status === "ready"
      ? view.data.monthlySeries.map((row) => ({
          month: row.month,
          Billing: row.billingCents / 100,
          Delivery: row.deliveryCents / 100,
        }))
      : []

  return (
    <FinanceSectionsShell title="Finance" scopeBar={<SectionScopeBar showingLabel={showingLabel} />}>
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatTile
            label="Receivables FYTD"
            basisCaption={
              view.status === "ready"
                ? `${view.data.receivablesFytd.basis} · ${view.data.receivablesFytd.scope}`
                : "billing · media ex client-pays + fee + adserving"
            }
            state={blockToTileState(view, (d) => d.receivablesFytd)}
          />
          <StatTile
            label="Payables FYTD"
            basisCaption={
              view.status === "ready"
                ? `${view.data.payablesFytd.basis} · ${view.data.payablesFytd.scope}`
                : "delivery · agency media (ex client-pays) + fee + adserving"
            }
            state={blockToTileState(view, (d) => d.payablesFytd)}
          />
          <StatTile
            label="Net accrual"
            basisCaption={
              view.status === "ready"
                ? view.data.netAccrual.basis
                : "receivables − payables"
            }
            state={blockToTileState(view, (d) => d.netAccrual)}
          />
          <StatTile
            label="Current month billing"
            basisCaption={
              view.status === "ready"
                ? view.data.currentMonthBilling.basis
                : "billing · current calendar month"
            }
            state={blockToTileState(view, (d) => d.currentMonthBilling)}
          />
          <StatTile
            label="Invoiced to date"
            basisCaption={
              view.status === "ready"
                ? view.data.invoicedToDate.basis
                : "finance_billing_records · billed"
            }
            state={blockToTileState(view, (d) => d.invoicedToDate)}
          />
        </div>

        {view.status === "loading" ? <LoadingState rows={5} /> : null}
        {view.status === "error" ? (
          <ErrorState title="Unable to load overview" message={view.message} onRetry={view.retry} />
        ) : null}
        {view.status === "empty" ? (
          <EmptyState title="No schedule data" message="Nothing in scope for this FY range." />
        ) : null}

        {view.status === "ready" ? (
          <>
            <BaseChartCard
              title="Billing vs delivery by month"
              subtitle={`FY${fyDisplayLabel(view.data.scope.fy)} · published tip · cents→dollars at boundary`}
              className="overflow-hidden rounded-card border border-border bg-card shadow-e1"
            >
              {chartData.length === 0 ? (
                <EmptyState
                  className="min-h-0 border-0 bg-transparent py-8"
                  title="No months in range"
                  message="Adjust the scope month range and Apply."
                />
              ) : (
                <GroupedBarChart
                  data={chartData}
                  xKey="month"
                  series={[
                    { key: "Billing", label: "Billing", color: "var(--av-chart-1)" },
                    { key: "Delivery", label: "Delivery", color: "var(--av-chart-2)" },
                  ]}
                  valueFormat="dollars"
                  className="min-h-[300px] w-full"
                />
              )}
            </BaseChartCard>

            <div className="grid gap-3 lg:grid-cols-2">
              <Panel>
                <PanelHeader>
                  <PanelTitle>Top clients</PanelTitle>
                </PanelHeader>
                <PanelContent>
                  {view.data.topClients.length === 0 ? (
                    <EmptyState
                      className="min-h-0 border-0 bg-transparent py-6"
                      title="No clients"
                      message="No billing in this scope."
                    />
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-muted-foreground">
                          <th className="py-2 font-medium">Client</th>
                          <th className="py-2 text-right font-medium">Billing</th>
                        </tr>
                      </thead>
                      <tbody>
                        {view.data.topClients.map((row) => (
                          <tr key={`${row.clientId}-${row.clientName}`} className="interactive-row border-b border-border/60">
                            <td className="py-2">
                              <Link
                                href={investmentHref(row.clientName)}
                                className="text-foreground underline-offset-2 hover:underline"
                              >
                                {row.clientName}
                              </Link>
                            </td>
                            <td className="num py-2 text-right">
                              {formatMoney(row.billingCents / 100)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </PanelContent>
              </Panel>

              <Panel>
                <PanelHeader>
                  <PanelTitle>Top publishers</PanelTitle>
                </PanelHeader>
                <PanelContent>
                  {view.data.topPublishers.length === 0 ? (
                    <EmptyState
                      className="min-h-0 border-0 bg-transparent py-6"
                      title="No publishers"
                      message="No agency delivery media in this scope."
                    />
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-muted-foreground">
                          <th className="py-2 font-medium">Publisher</th>
                          <th className="py-2 text-right font-medium">Delivery</th>
                        </tr>
                      </thead>
                      <tbody>
                        {view.data.topPublishers.map((row) => (
                          <tr key={row.publisher} className="interactive-row border-b border-border/60">
                            <td className="py-2">
                              <Link
                                href={investmentHref(undefined, row.publisher)}
                                className="text-foreground underline-offset-2 hover:underline"
                              >
                                {row.publisher}
                              </Link>
                            </td>
                            <td className="num py-2 text-right">
                              {formatMoney(row.deliveryCents / 100)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </PanelContent>
              </Panel>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Panel>
                <PanelHeader>
                  <PanelTitle>Period status</PanelTitle>
                </PanelHeader>
                <PanelContent className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {view.data.periodStatus.status ? (
                      <PeriodStatusChip
                        status={view.data.periodStatus.status as FinancePeriodStatus}
                      />
                    ) : null}
                    <span className="num text-xs text-muted-foreground">
                      {view.data.periodStatus.periodMonth}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {view.data.periodStatus.message}
                  </p>
                  <Link
                    href={view.data.periodStatus.href}
                    className="inline-flex text-sm font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    Open periods
                  </Link>
                </PanelContent>
              </Panel>

              <Panel>
                <PanelHeader>
                  <PanelTitle>Xero exceptions</PanelTitle>
                </PanelHeader>
                <PanelContent className="space-y-2">
                  <p className="num text-2xl font-extrabold">{view.data.xeroExceptions.count}</p>
                  <p className="text-xs text-muted-foreground">
                    {view.data.xeroExceptions.basis} · {view.data.xeroExceptions.scope}
                  </p>
                  <Link
                    href={view.data.xeroExceptions.href}
                    className="text-sm font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    Open Xero queue
                  </Link>
                </PanelContent>
              </Panel>
            </div>
          </>
        ) : null}

        {chromeDemo ? <FinanceChromeDemo /> : null}
      </div>
    </FinanceSectionsShell>
  )
}
