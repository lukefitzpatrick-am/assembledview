"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ChevronDown, ChevronRight, Download, ExternalLink } from "lucide-react"
import { CostsLocalFilters } from "@/components/finance/sections/costs/CostsLocalFilters"
import { CostsSubNav } from "@/components/finance/sections/costs/CostsSubNav"
import { EmptyState } from "@/components/finance/sections/EmptyState"
import { ErrorState } from "@/components/finance/sections/ErrorState"
import { LoadingState } from "@/components/finance/sections/LoadingState"
import { SectionScopeBar } from "@/components/finance/sections/SectionScopeBar"
import { FinanceSectionsShell } from "@/components/finance/sections/FinanceSectionsShell"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { fetchFinanceSectionsJson } from "@/lib/finance/sections/api"
import type { FinanceCostsSummaryPayload } from "@/lib/finance/sections/costsQuery"
import { exportCostsInvoicesExcel } from "@/lib/finance/sections/exportCostsInvoices"
import { fyDisplayLabel } from "@/lib/finance/months"
import { formatMoney } from "@/lib/format/money"
import {
  useFinanceScopeApplied,
  useFinanceScopeStore,
  useFinanceScopeVersion,
} from "@/lib/finance/sections/useFinanceScope"
import type { ViewState } from "@/lib/ui/viewState"
import { cn } from "@/lib/utils"

export function CostsInvoicesClient() {
  const applied = useFinanceScopeApplied()
  const scopeVersion = useFinanceScopeVersion()
  const searchParams = useSearchParams()
  const [channel, setChannel] = useState("")
  const [publisher, setPublisher] = useState(
    () => searchParams?.get("publishers")?.trim() ?? ""
  )
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [exporting, setExporting] = useState(false)
  const [view, setView] = useState<ViewState<FinanceCostsSummaryPayload>>({
    status: "loading",
  })

  const [updating, setUpdating] = useState(false)

  const load = useCallback(() => {
    setView((prev) => {
      if (prev.status === "ready") return prev
      return { status: "loading" }
    })
    setUpdating(true)
    const params = useFinanceScopeStore.getState().toSearchParams()
    if (channel) params.set("channels", channel)
    if (publisher.trim()) params.set("publishers", publisher.trim())
    void fetchFinanceSectionsJson<FinanceCostsSummaryPayload>(
      "/api/finance/sections/costs/summary",
      params,
      { retry: () => load() }
    ).then((next) => {
      setUpdating(false)
      setView(next)
    })
  }, [channel, publisher])

  useEffect(() => {
    load()
  }, [
    load,
    scopeVersion,
    applied.fy,
    applied.monthRange.from,
    applied.monthRange.to,
    applied.clients.join(","),
    channel,
    publisher,
  ])

  const showingLabel =
    view.status === "ready"
      ? `Showing invoices for FY${fyDisplayLabel(view.data.scope.fy)} · ${view.data.scope.from} → ${view.data.scope.to}`
      : undefined

  const rows = view.status === "ready" ? view.data.publisherMonths : []
  const unattributed = view.status === "ready" ? view.data.unattributedBills : []

  const totals = useMemo(() => {
    let booked = 0
    let ap = 0
    for (const r of rows) {
      booked += r.bookedCents
      ap += r.apBilledCents
    }
    for (const b of unattributed) ap += b.totalCents
    return { booked, ap, delta: booked - ap }
  }, [rows, unattributed])

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const onExport = async () => {
    if (view.status !== "ready") return
    setExporting(true)
    try {
      const stem = `costs-invoices-FY${view.data.scope.fy}-${view.data.scope.from}_${view.data.scope.to}`
      await exportCostsInvoicesExcel(view.data, `${stem}.xlsx`)
    } finally {
      setExporting(false)
    }
  }

  const dimmed = updating && view.status === "ready"

  return (
    <FinanceSectionsShell
      title="Publisher invoices"
      scopeBar={<SectionScopeBar showingLabel={showingLabel} />}
    >
      <div className="space-y-4">
        <CostsSubNav />
        <p className="text-sm text-muted-foreground">
          Booked, AP billed and Delta are ex-GST. AP billed = Xero AP, ex-GST.
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <CostsLocalFilters
            channel={channel}
            publisher={publisher}
            onChannelChange={setChannel}
            onPublisherChange={setPublisher}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={view.status !== "ready" || exporting}
              onClick={() => void onExport()}
            >
              <Download className="mr-1.5 size-3.5" aria-hidden />
              {exporting ? "Exporting…" : "Export Excel"}
            </Button>
            <Link
              href="/finance/costs"
              className="text-sm text-muted-foreground underline-offset-2 hover:underline"
            >
              ← Publishers overview
            </Link>
          </div>
        </div>

        {view.status === "ready" ? (
          <p className="rounded-card border border-border bg-surface-panel px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Attribution rule: </span>
            {view.data.attributionRule}
          </p>
        ) : null}

        {view.status === "loading" && rows.length === 0 ? <LoadingState rows={6} /> : null}
        {view.status === "error" ? (
          <ErrorState title="Unable to load invoices" message={view.message} onRetry={view.retry} />
        ) : null}

        {view.status === "ready" || dimmed ? (
          <div className={cn("overflow-x-auto rounded-card border border-border bg-card", dimmed && "opacity-60")}>
            {dimmed ? (
              <p className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
                Updating…
              </p>
            ) : null}
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="w-8 px-2 py-2" />
                  <th className="px-2 py-2 font-medium">Publisher</th>
                  <th className="px-2 py-2 font-medium">Month</th>
                  <th className="px-2 py-2 text-right font-medium">Booked (ex-GST)</th>
                  <th className="px-2 py-2 text-right font-medium">AP billed (ex-GST)</th>
                  <th className="px-2 py-2 text-right font-medium">Delta (ex-GST)</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-0">
                      <EmptyState
                        className="min-h-0 border-0 bg-transparent py-8"
                        title="No publisher × month rows"
                        message="Adjust scope or filters."
                      />
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const key = `${row.publisher}|${row.month}`
                    const open = expanded.has(key)
                    const hasBills = row.bills.length > 0
                    return (
                      <FragmentRow
                        key={key}
                        open={open}
                        hasBills={hasBills}
                        onToggle={() => toggle(key)}
                        publisher={row.publisher}
                        month={row.month}
                        bookedCents={row.bookedCents}
                        apBilledCents={row.apBilledCents}
                        deltaCents={row.deltaCents}
                        bills={row.bills}
                      />
                    )
                  })
                )}
                {unattributed.length > 0 ? (
                  <>
                    <tr className="border-t border-border bg-surface-panel">
                      <td className="px-2 py-2" />
                      <td className="px-2 py-2 font-medium" colSpan={2}>
                        Unattributed bills
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          {unattributed.length}
                        </Badge>
                      </td>
                      <td className="num px-2 py-2 text-right">—</td>
                      <td className="num px-2 py-2 text-right">
                        {formatMoney(
                          unattributed.reduce((s, b) => s + b.totalCents, 0) / 100
                        )}
                      </td>
                      <td className="num px-2 py-2 text-right text-muted-foreground">—</td>
                    </tr>
                    {unattributed.map((bill) => (
                      <tr key={`u-${bill.id}`} className="border-b border-border/50 text-muted-foreground">
                        <td className="px-2 py-1.5" />
                        <td className="px-2 py-1.5" colSpan={2}>
                          <span className="text-foreground">{bill.invoiceNumber ?? "—"}</span>
                          {" · "}
                          {bill.contactName ?? "No contact"}
                          {" · "}
                          {bill.status ?? "—"}
                          {bill.heuristic ? (
                            <Badge variant="outline" className="ml-2 text-[10px]">
                              heuristic
                            </Badge>
                          ) : null}
                          {bill.pdfUrl ? (
                            <a
                              href={bill.pdfUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="ml-2 inline-flex items-center gap-0.5 text-foreground underline-offset-2 hover:underline"
                            >
                              PDF <ExternalLink className="size-3" aria-hidden />
                            </a>
                          ) : null}
                        </td>
                        <td className="num px-2 py-1.5 text-right">{bill.activityMonth}</td>
                        <td className="num px-2 py-1.5 text-right">
                          {formatMoney(bill.totalCents / 100)}
                        </td>
                        <td className="num px-2 py-1.5 text-right">
                          due {formatMoney(bill.amountDueCents / 100)}
                          {bill.dueDate ? ` · ${bill.dueDate}` : ""}
                        </td>
                      </tr>
                    ))}
                  </>
                ) : null}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-medium">
                  <td className="px-2 py-2" />
                  <td className="px-2 py-2" colSpan={2}>
                    Totals (ex-GST)
                  </td>
                  <td className="num px-2 py-2 text-right">{formatMoney(totals.booked / 100)}</td>
                  <td className="num px-2 py-2 text-right">{formatMoney(totals.ap / 100)}</td>
                  <td className="num px-2 py-2 text-right">{formatMoney(totals.delta / 100)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : null}
      </div>
    </FinanceSectionsShell>
  )
}

function FragmentRow({
  open,
  hasBills,
  onToggle,
  publisher,
  month,
  bookedCents,
  apBilledCents,
  deltaCents,
  bills,
}: {
  open: boolean
  hasBills: boolean
  onToggle: () => void
  publisher: string
  month: string
  bookedCents: number
  apBilledCents: number
  deltaCents: number
  bills: FinanceCostsSummaryPayload["publisherMonths"][number]["bills"]
}) {
  return (
    <>
      <tr className="interactive-row border-b border-border/60">
        <td className="px-2 py-2">
          {hasBills ? (
            <button
              type="button"
              className="rounded-input p-0.5 text-muted-foreground hover:text-foreground"
              aria-expanded={open}
              onClick={onToggle}
            >
              {open ? (
                <ChevronDown className="size-4" aria-hidden />
              ) : (
                <ChevronRight className="size-4" aria-hidden />
              )}
            </button>
          ) : null}
        </td>
        <td className="px-2 py-2">{publisher}</td>
        <td className="num px-2 py-2">{month}</td>
        <td className="num px-2 py-2 text-right">{formatMoney(bookedCents / 100)}</td>
        <td className="num px-2 py-2 text-right">{formatMoney(apBilledCents / 100)}</td>
        <td className="num px-2 py-2 text-right">{formatMoney(deltaCents / 100)}</td>
      </tr>
      {open
        ? bills.map((bill) => (
            <tr key={bill.id} className="border-b border-border/40 bg-surface-panel/50 text-muted-foreground">
              <td className="px-2 py-1.5" />
              <td className="px-2 py-1.5" colSpan={2}>
                <span className="text-foreground">{bill.invoiceNumber ?? "—"}</span>
                {" · "}
                {bill.status ?? "—"}
                {bill.heuristic ? (
                  <Badge variant="outline" className="ml-2 text-[10px]">
                    heuristic
                  </Badge>
                ) : null}
                {bill.pdfUrl ? (
                  <a
                    href={bill.pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-2 inline-flex items-center gap-0.5 text-foreground underline-offset-2 hover:underline"
                  >
                    PDF <ExternalLink className="size-3" aria-hidden />
                  </a>
                ) : null}
              </td>
              <td className="num px-2 py-1.5 text-right">{bill.dueDate ?? "—"}</td>
              <td className="num px-2 py-1.5 text-right">
                {formatMoney(bill.totalCents / 100)}
              </td>
              <td className="num px-2 py-1.5 text-right">
                due {formatMoney(bill.amountDueCents / 100)}
              </td>
            </tr>
          ))
        : null}
    </>
  )
}
