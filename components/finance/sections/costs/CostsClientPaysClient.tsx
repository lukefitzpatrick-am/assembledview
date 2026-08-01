"use client"

import { Fragment, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { CostsSubNav } from "@/components/finance/sections/costs/CostsSubNav"
import { EmptyState } from "@/components/finance/sections/EmptyState"
import { ErrorState } from "@/components/finance/sections/ErrorState"
import { LoadingState } from "@/components/finance/sections/LoadingState"
import { SectionScopeBar } from "@/components/finance/sections/SectionScopeBar"
import { StatTile, type StatTileMoneyState } from "@/components/finance/sections/StatTile"
import { FinanceSectionsShell } from "@/components/finance/sections/FinanceSectionsShell"
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/layout/Panel"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { fetchFinanceSectionsJson } from "@/lib/finance/sections/api"
import {
  CLIENT_PAYS_LINE_DETAIL_NOTE,
  CLIENT_PAYS_PAGE_CAPTION,
} from "@/lib/finance/sections/clientPaysCompose"
import type { FinanceClientPaysPayload } from "@/lib/finance/sections/clientPaysQuery"
import { investmentHrefForAccrual } from "@/lib/finance/sections/useCostsAccrualData"
import { fyDisplayLabel } from "@/lib/finance/months"
import { formatMoney } from "@/lib/format/money"
import {
  useFinanceScopeApplied,
  useFinanceScopeStore,
  useFinanceScopeVersion,
} from "@/lib/finance/sections/useFinanceScope"
import type { ViewState } from "@/lib/ui/viewState"

function blockToTileState(
  vs: ViewState<FinanceClientPaysPayload>,
  pick: (d: FinanceClientPaysPayload) => number
): StatTileMoneyState {
  if (vs.status === "loading") return { status: "loading" }
  if (vs.status === "error") return { status: "error", message: vs.message }
  if (vs.status === "empty" || vs.status === "filtered-empty") return { status: "empty" }
  return { status: "ready", cents: pick(vs.data) }
}

function CountTile({
  label,
  basisCaption,
  view,
  pick,
}: {
  label: string
  basisCaption: string
  view: ViewState<FinanceClientPaysPayload>
  pick: (d: FinanceClientPaysPayload) => number
}) {
  if (view.status === "loading") {
    return (
      <div className="overflow-hidden rounded-card border border-border bg-card shadow-e1">
        <div className="h-[3px] w-full bg-primary" aria-hidden />
        <div className="p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-2 h-8 w-16" />
          <p className="mt-2 text-[11px] text-muted-foreground">{basisCaption}</p>
        </div>
      </div>
    )
  }
  if (view.status === "error") {
    return (
      <div className="overflow-hidden rounded-card border border-pacing-critical-bg bg-pacing-critical-bg shadow-e1">
        <div className="h-[3px] w-full bg-status-danger" aria-hidden />
        <div className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-status-critical-fg">
            {label}
          </p>
          <p className="mt-2 text-sm font-semibold text-status-critical-fg">Unavailable</p>
        </div>
      </div>
    )
  }
  if (view.status !== "ready") {
    return (
      <div className="overflow-hidden rounded-card border border-dashed border-border bg-surface-panel shadow-e1">
        <div className="h-[3px] w-full bg-muted" aria-hidden />
        <div className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="num mt-2 text-[28px] font-extrabold leading-none text-muted-foreground">—</p>
        </div>
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-card border border-border bg-card shadow-e1">
      <div className="h-[3px] w-full bg-primary" aria-hidden />
      <div className="p-4 pb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="num mt-2 text-[28px] font-extrabold leading-none text-foreground">
          {pick(view.data)}
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground">{basisCaption}</p>
      </div>
    </div>
  )
}

function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-")
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  const mi = Number.parseInt(m ?? "1", 10) - 1
  return `${months[mi] ?? m} ${String(y ?? "").slice(2)}`
}

export function CostsClientPaysClient() {
  const applied = useFinanceScopeApplied()
  const scopeVersion = useFinanceScopeVersion()
  const [view, setView] = useState<ViewState<FinanceClientPaysPayload>>({
    status: "loading",
  })

  const load = useCallback(() => {
    setView({ status: "loading" })
    const params = useFinanceScopeStore.getState().toSearchParams()
    void fetchFinanceSectionsJson<FinanceClientPaysPayload>(
      "/api/finance/sections/costs/client-pays",
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
      ? `Showing client-pays for FY${fyDisplayLabel(view.data.scope.fy)} · ${view.data.scope.from} → ${view.data.scope.to}`
      : undefined

  const months = view.status === "ready" ? view.data.months : []

  return (
    <FinanceSectionsShell
      title="Client-pays"
      scopeBar={<SectionScopeBar showingLabel={showingLabel} />}
    >
      <div className="space-y-6">
        <CostsSubNav />
        <p className="text-sm text-muted-foreground">{CLIENT_PAYS_PAGE_CAPTION}</p>
        <p className="text-xs text-muted-foreground">{CLIENT_PAYS_LINE_DETAIL_NOTE}</p>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="FY client-paid media"
            basisCaption={
              view.status === "ready"
                ? view.data.kpis.basis
                : "delivery · client-pays media · approved/booked/completed"
            }
            state={blockToTileState(view, (d) => d.kpis.clientPaidMediaCents)}
          />
          <CountTile
            label="Lines"
            basisCaption="Distinct line_items with client_pays_for_media"
            view={view}
            pick={(d) => d.kpis.lineCount}
          />
          <CountTile
            label="MBAs"
            basisCaption="Campaigns with at least one client-pays line"
            view={view}
            pick={(d) => d.kpis.mbaCount}
          />
          <CountTile
            label="Clients"
            basisCaption="Clients with client-paid media in scope"
            view={view}
            pick={(d) => d.kpis.clientCount}
          />
        </div>

        {view.status === "ready" && view.data.kpis.byClient.length > 0 ? (
          <Panel>
            <PanelHeader>
              <PanelTitle>Per-client split</PanelTitle>
            </PanelHeader>
            <PanelContent>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {view.data.kpis.byClient.map((c) => (
                  <li
                    key={c.clientId}
                    className="rounded-input border border-border bg-surface-panel px-3 py-2 text-sm"
                  >
                    <p className="truncate font-medium text-foreground">{c.clientName}</p>
                    <p className="num text-muted-foreground">{formatMoney(c.mediaCents / 100)}</p>
                  </li>
                ))}
              </ul>
            </PanelContent>
          </Panel>
        ) : null}

        {view.status === "ready" ? (
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>{view.data.coverage.excludedByStatusCaption}</p>
            <p>
              Client-pays in draft/planned/cancelled:{" "}
              {formatMoney(view.data.coverage.clientPaysExcludedByStatusCents / 100)}
            </p>
            <p>{view.data.coverage.feeNote}</p>
          </div>
        ) : null}

        {view.status === "loading" ? <LoadingState rows={6} /> : null}
        {view.status === "error" ? (
          <ErrorState
            title="Unable to load client-pays"
            message={view.message}
            onRetry={view.retry}
          />
        ) : null}
        {view.status === "ready" && view.data.clients.length === 0 ? (
          <EmptyState
            title="No client-pays media"
            message="No delivery media flagged client_pays_for_media in this scope (approved/booked/completed tips with line detail)."
          />
        ) : null}

        {view.status === "ready" && view.data.clients.length > 0 ? (
          <div className="overflow-x-auto rounded-card border border-border bg-card shadow-e1">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="sticky left-0 z-10 bg-card px-3 py-2 font-medium">Client / MBA / Line</th>
                  <th className="px-2 py-2 font-medium">Publisher</th>
                  <th className="px-2 py-2 font-medium">Channel</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  {months.map((m) => (
                    <th key={m} className="px-2 py-2 text-right font-medium">
                      {monthLabel(m)}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {view.data.clients.map((client) => (
                  <Fragment key={`c-${client.clientId}`}>
                    <tr className="border-b border-border/80 bg-surface-panel">
                      <td
                        className="sticky left-0 z-10 bg-surface-panel px-3 py-2 font-semibold text-foreground"
                        colSpan={4}
                      >
                        {client.clientName}
                      </td>
                      {months.map((m) => {
                        let sum = 0
                        for (const mba of client.mbas) {
                          for (const line of mba.lines) sum += line.byMonth[m] ?? 0
                        }
                        return (
                          <td key={m} className="num px-2 py-2 text-right text-muted-foreground">
                            {sum ? formatMoney(sum / 100) : "—"}
                          </td>
                        )
                      })}
                      <td className="num px-3 py-2 text-right font-semibold">
                        {formatMoney(client.totalCents / 100)}
                      </td>
                    </tr>
                    {client.mbas.map((mba) => (
                      <Fragment key={`m-${client.clientId}-${mba.mbaNumber}`}>
                        <tr className="border-b border-border/60">
                          <td
                            className="sticky left-0 z-10 bg-card px-3 py-1.5 pl-6 text-foreground"
                            colSpan={3}
                          >
                            <span className="font-medium">{mba.mbaNumber}</span>
                            {mba.campaignName ? (
                              <span className="ml-2 text-muted-foreground">{mba.campaignName}</span>
                            ) : null}
                          </td>
                          <td className="px-2 py-1.5">
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {mba.campaignStatus || "—"}
                            </Badge>
                          </td>
                          {months.map((m) => {
                            let sum = 0
                            for (const line of mba.lines) sum += line.byMonth[m] ?? 0
                            return (
                              <td key={m} className="num px-2 py-1.5 text-right text-muted-foreground">
                                {sum ? formatMoney(sum / 100) : "—"}
                              </td>
                            )
                          })}
                          <td className="num px-3 py-1.5 text-right font-medium">
                            {formatMoney(mba.totalCents / 100)}
                          </td>
                        </tr>
                        {mba.lines.map((line) => (
                          <tr
                            key={`l-${client.clientId}-${mba.mbaNumber}-${line.lineItemId}`}
                            className="interactive-row border-b border-border/40"
                          >
                            <td className="sticky left-0 z-10 bg-card px-3 py-1.5 pl-10 text-muted-foreground">
                              {line.lineItemId}
                            </td>
                            <td className="px-2 py-1.5">{line.publisher}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">
                              {line.channel ?? "—"}
                            </td>
                            <td className="px-2 py-1.5" />
                            {months.map((m) => {
                              const cents = line.byMonth[m] ?? 0
                              if (!cents) {
                                return (
                                  <td
                                    key={m}
                                    className="num px-2 py-1.5 text-right text-muted-foreground"
                                  >
                                    —
                                  </td>
                                )
                              }
                              return (
                                <td key={m} className="num px-2 py-1.5 text-right">
                                  <Link
                                    href={investmentHrefForAccrual(
                                      client.clientName,
                                      client.clientId,
                                      m
                                    )}
                                    className="text-foreground underline-offset-2 hover:underline"
                                  >
                                    {formatMoney(cents / 100)}
                                  </Link>
                                </td>
                              )
                            })}
                            <td className="num px-3 py-1.5 text-right">
                              {formatMoney(line.totalCents / 100)}
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </FinanceSectionsShell>
  )
}
