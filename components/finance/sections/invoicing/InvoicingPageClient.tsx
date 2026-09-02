"use client"

/**
 * Invoicing section page — adapted COPY of hub `ReceivablesPageClient`.
 * Wired to `useFinanceScope` + auto-load (no Load gate). Legacy files untouched.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"
import { BulkApproveReadyButton } from "@/components/finance/sections/invoicing/BulkApproveReadyButton"
import { InvoicingClientCard } from "@/components/finance/sections/invoicing/InvoicingClientCard"
import { InvoicingToolbar } from "@/components/finance/sections/invoicing/InvoicingToolbar"
import { ReceivablesSummaryStrip } from "@/components/finance/receivables/ReceivablesSummaryStrip"
import { FinanceSectionsShell } from "@/components/finance/sections/FinanceSectionsShell"
import { EmptyState } from "@/components/finance/sections/EmptyState"
import { ErrorState } from "@/components/finance/sections/ErrorState"
import { LoadingState } from "@/components/finance/sections/LoadingState"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { exportBillingRecordsCsv } from "@/lib/finance/export"
import { hasBillingEvidence } from "@/lib/finance/billingLifecycle"
import { INVOICING_EXCEL_DISABLED_REASON } from "@/lib/finance/sections/invoicingBulkApproveCopy"
import {
  formatFunnelCountCaption,
  summariseInvoicingFunnel,
} from "@/lib/finance/sections/invoicingFunnel"
import {
  filterApprovedReceivablesForExport,
  invoiceKeysReadyToMarkSent,
  summariseLastExport,
} from "@/lib/finance/approvedReceivablesExport"
import { grainFromBillingRecord } from "@/lib/finance/billingApproveGrain"
import { approveBillingRecords, markBillingRecordsExported } from "@/lib/finance/api"
import { markSentResultToast } from "@/lib/finance/markSentToFinanceCopy"
import { exportReceivablesWorkbook } from "@/lib/finance/exportFinanceHub"
import { expandMonthRange } from "@/lib/finance/monthRange"
import { formatAUD } from "@/lib/format/money"
import { formatDateShort } from "@/lib/format/date"
import {
  INVOICING_CLIENT_GRID_CLASS,
  INVOICING_EX_GST_HEADER,
  type InvoicingClientBlockerMeta,
} from "@/lib/finance/sections/invoicingRowPresentation"
import { loadInvoicingClientBlockerMeta } from "@/lib/finance/sections/invoicingClientBlockerMeta"
import type { BillingRecord } from "@/lib/types/financeBilling"
import type { MonthGroup } from "@/lib/finance/useReceivablesData"
import {
  DEFAULT_INVOICING_LOCAL_FILTERS,
  useInvoicingReceivablesData,
  type InvoicingLocalFilters,
} from "@/lib/finance/sections/useInvoicingReceivablesData"
import { useFinanceScopeApplied } from "@/lib/finance/sections/useFinanceScope"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"

function filterReceivablesMonthGroups(
  groups: MonthGroup[],
  predicate: (r: BillingRecord) => boolean
): MonthGroup[] {
  const out: MonthGroup[] = []
  for (const mg of groups) {
    const clients = mg.clients
      .map((client) => {
        const mediaPlans = client.mediaPlans
          .map((mp) => {
            const records = mp.records.filter(predicate)
            if (records.length === 0) return null
            return { ...mp, records, total: records.reduce((s, r) => s + r.total, 0) }
          })
          .filter((mp): mp is NonNullable<typeof mp> => mp != null)
        const scopeOfWorks = client.scopeOfWorks
          .map((mp) => {
            const records = mp.records.filter(predicate)
            if (records.length === 0) return null
            return { ...mp, records, total: records.reduce((s, r) => s + r.total, 0) }
          })
          .filter((mp): mp is NonNullable<typeof mp> => mp != null)
        const retainers = client.retainers.filter(predicate)
        if (mediaPlans.length === 0 && scopeOfWorks.length === 0 && retainers.length === 0) {
          return null
        }
        return {
          ...client,
          mediaPlans,
          scopeOfWorks,
          retainers,
          total:
            mediaPlans.reduce((s, mp) => s + mp.total, 0) +
            scopeOfWorks.reduce((s, mp) => s + mp.total, 0) +
            retainers.reduce((s, r) => s + r.total, 0),
        }
      })
      .filter((c): c is NonNullable<typeof c> => c != null)
    if (clients.length === 0) continue
    out.push({ ...mg, clients, total: clients.reduce((s, c) => s + c.total, 0) })
  }
  return out
}

function collectBillingRecordsFromMonthGroups(groups: MonthGroup[]): BillingRecord[] {
  const out: BillingRecord[] = []
  for (const mg of groups) {
    for (const c of mg.clients) {
      for (const mp of [...c.mediaPlans, ...c.scopeOfWorks]) out.push(...mp.records)
      out.push(...c.retainers)
    }
  }
  return out
}

function countInvoicesInMonthGroups(groups: MonthGroup[]): number {
  return collectBillingRecordsFromMonthGroups(groups).length
}

function collectBillingRecordsFromMonthGroup(mg: MonthGroup): BillingRecord[] {
  return collectBillingRecordsFromMonthGroups([mg])
}

function monthReadyStats(mg: MonthGroup): { count: number; amountDollars: number } {
  let count = 0
  let amountDollars = 0
  for (const record of collectBillingRecordsFromMonthGroup(mg)) {
    if ((record.state ?? "ready") !== "ready") continue
    count += 1
    amountDollars += record.total
  }
  return { count, amountDollars }
}

function sumMonthGroupsTotal(groups: MonthGroup[]): number {
  return groups.reduce((s, mg) => s + mg.total, 0)
}

function InvoicingMonthSections({
  groups,
  refetch,
  onNotesSaved,
  onLineAmountCommitted,
  clientMetaById,
  approveBusy,
  onApproveReady,
}: {
  groups: MonthGroup[]
  refetch: () => void
  onNotesSaved?: (result: {
    invoice_key: string
    notes: string
    persisted_record_id: number
  }) => void
  onLineAmountCommitted?: (
    line: import("@/lib/types/financeBilling").BillingLineItem,
    next: { amount: number; billing_mode?: "auto" | "manual" | null },
    ctx: import("@/lib/finance/commitInlineScheduleAmountEdit").InlineScheduleEditContext
  ) => void
  clientMetaById: Map<number, InvoicingClientBlockerMeta>
  approveBusy?: boolean
  onApproveReady?: (monthIso: string) => void
}) {
  if (groups.length === 0) return null
  return (
    <div className="space-y-8">
      {groups.map((mg) => {
        const invoiceCount = collectBillingRecordsFromMonthGroup(mg).length
        const ready = onApproveReady ? monthReadyStats(mg) : null
        return (
        <section key={mg.monthIso} className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-border/50 pb-2">
            <p className="text-sm font-medium text-foreground">
              {mg.monthLabel}
              <span className="num"> · {formatAUD(mg.total)}</span>
              <span className="font-normal text-muted-foreground">
                {" "}
                · {invoiceCount} {invoiceCount === 1 ? "invoice" : "invoices"}
              </span>
            </p>
            {ready ? (
              <BulkApproveReadyButton
                count={ready.count}
                amountDollars={ready.amountDollars}
                monthLabel={mg.monthLabel}
                busy={approveBusy}
                onConfirm={() => onApproveReady?.(mg.monthIso)}
              />
            ) : null}
          </div>
          <div data-invoicing-client-grid="" className={INVOICING_CLIENT_GRID_CLASS}>
            {mg.clients.map((client) => (
              <InvoicingClientCard
                key={`${mg.monthIso}-${client.clientsId}`}
                client={client}
                monthLabel={mg.monthLabel}
                refetch={refetch}
                onNotesSaved={onNotesSaved}
                onLineAmountCommitted={onLineAmountCommitted}
                clientMeta={clientMetaById.get(client.clientsId) ?? null}
              />
            ))}
          </div>
        </section>
        )
      })}
    </div>
  )
}

export function InvoicingPageClient() {
  const applied = useFinanceScopeApplied()
  const [localFilters, setLocalFilters] = useState<InvoicingLocalFilters>(
    () => DEFAULT_INVOICING_LOCAL_FILTERS
  )
  const {
    loading,
    isUpdating,
    visibleMonthGroups,
    loadError,
    bumpFetch,
    updateNotesByInvoiceKey,
    updateReceivableLineAmount,
  } = useInvoicingReceivablesData(localFilters)

  const { toast } = useToast()
  const [lastExportName, setLastExportName] = useState<string | null>(null)
  const [approveBusy, setApproveBusy] = useState(false)
  const [markSentBusy, setMarkSentBusy] = useState(false)
  const [clientMetaById, setClientMetaById] = useState<Map<number, InvoicingClientBlockerMeta>>(
    () => new Map()
  )

  useEffect(() => {
    let cancelled = false
    void loadInvoicingClientBlockerMeta().then((map) => {
      if (!cancelled) setClientMetaById(map)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleNotesSaved = useCallback(
    (result: { invoice_key: string; notes: string; persisted_record_id: number }) => {
      updateNotesByInvoiceKey(result.invoice_key, {
        notes: result.notes || null,
        persisted_record_id: result.persisted_record_id,
      })
    },
    [updateNotesByInvoiceKey]
  )

  const handleLineAmountCommitted = useCallback(
    (
      line: import("@/lib/types/financeBilling").BillingLineItem,
      next: { amount: number; billing_mode?: "auto" | "manual" | null },
      ctx: import("@/lib/finance/commitInlineScheduleAmountEdit").InlineScheduleEditContext
    ) => {
      updateReceivableLineAmount(
        {
          mba_number: ctx.mbaNumber,
          billing_month: ctx.billingMonthIso,
          schedule_line_item_id: line.schedule_line_item_id,
          item_code: line.item_code,
          line_type: line.line_type,
        },
        next
      )
    },
    [updateReceivableLineAmount]
  )

  const allRecords = useMemo(
    () => collectBillingRecordsFromMonthGroups(visibleMonthGroups),
    [visibleMonthGroups]
  )
  const approvedRecords = useMemo(
    () => filterApprovedReceivablesForExport(allRecords),
    [allRecords]
  )
  const readyGrains = useMemo(
    () =>
      allRecords.flatMap((r) => {
        if ((r.state ?? "ready") !== "ready") return []
        const grain = grainFromBillingRecord(r)
        return grain ? [grain] : []
      }),
    [allRecords]
  )
  const markSentKeys = useMemo(() => invoiceKeysReadyToMarkSent(allRecords), [allRecords])
  const lastExport = useMemo(() => summariseLastExport(allRecords), [allRecords])
  const lastExportLine = useMemo(() => {
    if (!lastExport) return null
    const name = lastExport.exportedByName ?? lastExportName ?? "finance admin"
    const clients =
      lastExport.clientCount === 1 ? "1 client" : `${lastExport.clientCount} clients`
    return `Last exported ${formatDateShort(lastExport.exportedAt)} by ${name} · ${clients} · ${formatAUD(lastExport.total)}`
  }, [lastExport, lastExportName])

  const funnel = useMemo(() => summariseInvoicingFunnel(allRecords), [allRecords])

  const unbilledGroups = useMemo(
    () => filterReceivablesMonthGroups(visibleMonthGroups, (r) => !hasBillingEvidence(r.state)),
    [visibleMonthGroups]
  )
  const billedGroups = useMemo(
    () => filterReceivablesMonthGroups(visibleMonthGroups, (r) => hasBillingEvidence(r.state)),
    [visibleMonthGroups]
  )

  const billedInvoiceCount = countInvoicesInMonthGroups(billedGroups)
  const billedTotal = sumMonthGroupsTotal(billedGroups)
  const unbilledInvoiceCount = countInvoicesInMonthGroups(unbilledGroups)

  const monthLabel = useMemo(() => {
    const months = expandMonthRange(applied.monthRange)
    if (months.length === 0) return "period"
    if (months.length === 1) return months[0]!
    return `${months[0]}_${months[months.length - 1]}`
  }, [applied.monthRange])

  const exportCsv = useCallback(() => {
    exportBillingRecordsCsv(allRecords, `Finance_invoicing_${monthLabel}.csv`)
  }, [allRecords, monthLabel])

  const exportExcel = useCallback(async () => {
    if (approvedRecords.length === 0) return
    try {
      // Bookkeeper / Xero invoice-style workbook (hub "Export to Excel"), not the flat grid.
      const { missingLegalBusinessNames } = await exportReceivablesWorkbook(
        approvedRecords,
        monthLabel,
        "Finance_invoicing"
      )
      if (missingLegalBusinessNames.length > 0) {
        const names = missingLegalBusinessNames.map((c) => c.displayName).join(", ")
        console.warn(
          "[FIN-6] Clients missing legalbusinessname (Excel used display name):",
          missingLegalBusinessNames
        )
        toast({
          title: "Export ready",
          description: `Invoicing workbook downloaded. ${missingLegalBusinessNames.length} client(s) missing legal business name (used display name): ${names}.`,
        })
      } else {
        toast({ title: "Export ready", description: "Invoicing workbook downloaded." })
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description: e instanceof Error ? e.message : "Unknown error",
      })
    }
  }, [approvedRecords, monthLabel, toast])

  const approveReadyForMonth = useCallback(
    async (billing_month: string) => {
      const grains = readyGrains.filter((g) => g.billing_month === billing_month)
      if (grains.length === 0 || approveBusy) return
      setApproveBusy(true)
      try {
        const res = await approveBillingRecords({
          invoice_keys: grains.map((g) => g.invoice_key),
          billing_month,
        })
        const notFoundKeys = (res.errors ?? [])
          .filter((err) => err.error === "not_found")
          .map((err) => err.invoice_key)
        toast({
          title: `Approved ${res.records.length} invoice${res.records.length === 1 ? "" : "s"}`,
          description:
            notFoundKeys.length > 0
              ? `${notFoundKeys.length} could not be derived on the server.`
              : undefined,
        })
        bumpFetch()
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Could not approve",
          description: e instanceof Error ? e.message : "Unknown error",
        })
      } finally {
        setApproveBusy(false)
      }
    },
    [readyGrains, approveBusy, toast, bumpFetch]
  )

  const markSentToFinance = useCallback(async () => {
    if (markSentKeys.length === 0 || markSentBusy) return
    setMarkSentBusy(true)
    try {
      const exported = await markBillingRecordsExported({ invoice_keys: markSentKeys })
      if (exported.records.length > 0) {
        setLastExportName(exported.exported_by_name)
      }
      toast({
        title: markSentResultToast({
          marked: exported.records.length,
          skippedNotApproved: exported.skipped?.length ?? 0,
        }),
      })
      bumpFetch()
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not mark as sent",
        description: e instanceof Error ? e.message : "Unknown error",
      })
    } finally {
      setMarkSentBusy(false)
    }
  }, [markSentKeys, markSentBusy, toast, bumpFetch])

  const coldLoading = loading && visibleMonthGroups.length === 0 && !loadError
  const showNoReceivables =
    !loading && !isUpdating && !loadError && visibleMonthGroups.length === 0

  return (
    <FinanceSectionsShell
      title="To bill"
      headerNote={INVOICING_EX_GST_HEADER}
      scopeBarFramed={false}
      scopeBar={
        <InvoicingToolbar
          showingLabel={`Receivables · ${applied.monthRange.from} → ${applied.monthRange.to}`}
          lastExportLine={lastExportLine}
          localFilters={localFilters}
          onLocalFiltersChange={setLocalFilters}
          onExportCsv={exportCsv}
          onExportExcel={() => void exportExcel()}
          csvDisabled={allRecords.length === 0 || isUpdating}
          excelDisabled={approvedRecords.length === 0 || isUpdating}
          excelDisabledReason={
            approvedRecords.length === 0 ? INVOICING_EXCEL_DISABLED_REASON : undefined
          }
          onMarkSentToFinance={() => void markSentToFinance()}
          markSentDisabled={markSentKeys.length === 0 || isUpdating}
          markSentBusy={markSentBusy || isUpdating}
        />
      }
    >
      <div className="space-y-4">
        {isUpdating ? (
          <div
            className="flex items-center gap-2 rounded-input border border-border bg-surface-panel px-3 py-1.5"
            aria-live="polite"
          >
            <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-[var(--fill-track)]">
              <div className="h-full w-1/3 animate-pulse rounded-pill bg-primary" />
            </div>
            <span className="text-xs font-medium text-muted-foreground">Updating…</span>
          </div>
        ) : null}

        {coldLoading || loadError || showNoReceivables || visibleMonthGroups.length > 0 ? (
          <ReceivablesSummaryStrip
            view={
              coldLoading
                ? "loading"
                : loadError
                  ? "error"
                  : showNoReceivables
                    ? "empty"
                    : "ready"
            }
            errorMessage={loadError ?? undefined}
            readyCents={funnel.ready.cents}
            approvedCents={funnel.approved.cents}
            sentToFinanceCents={funnel.sentToFinance.cents}
            readyCaption={formatFunnelCountCaption(
              funnel.ready.invoiceCount,
              funnel.ready.monthCount
            )}
            approvedCaption={formatFunnelCountCaption(
              funnel.approved.invoiceCount,
              funnel.approved.monthCount
            )}
            sentToFinanceCaption={formatFunnelCountCaption(
              funnel.sentToFinance.invoiceCount,
              funnel.sentToFinance.monthCount
            )}
          />
        ) : null}

        {coldLoading ? <LoadingState rows={5} /> : null}

        {loadError && !coldLoading ? (
          <ErrorState title="Could not load receivables" message={loadError} onRetry={bumpFetch} />
        ) : null}

        {showNoReceivables ? (
          <EmptyState
            title="No receivables"
            message="No receivables for the current scope and filters."
          />
        ) : null}

        {!coldLoading && visibleMonthGroups.length > 0 ? (
          <div
            className={cn(isUpdating && "pointer-events-none opacity-60")}
            aria-busy={isUpdating || undefined}
          >
            <div className="relative mt-4 space-y-6 pt-1">
              {unbilledInvoiceCount === 0 && billedInvoiceCount > 0 ? (
                <p className="text-sm text-muted-foreground">
                  All invoices have moved past ready for this period.
                </p>
              ) : null}

              <InvoicingMonthSections
                groups={unbilledGroups}
                refetch={bumpFetch}
                onNotesSaved={handleNotesSaved}
                onLineAmountCommitted={handleLineAmountCommitted}
                clientMetaById={clientMetaById}
                approveBusy={approveBusy || isUpdating}
                onApproveReady={(monthIso) => void approveReadyForMonth(monthIso)}
              />

              {billedInvoiceCount > 0 ? (
                <Collapsible defaultOpen={false} className="group/billed">
                  <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-card border border-border bg-surface-panel px-4 py-3 text-left hover:bg-table-row-hover">
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/billed:rotate-180" />
                    <span className="text-sm font-medium">
                      Approved & beyond · {billedInvoiceCount}{" "}
                      {billedInvoiceCount === 1 ? "invoice" : "invoices"} · {formatAUD(billedTotal)}
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-4">
                    <InvoicingMonthSections
                      groups={billedGroups}
                      refetch={bumpFetch}
                      onNotesSaved={handleNotesSaved}
                      onLineAmountCommitted={handleLineAmountCommitted}
                      clientMetaById={clientMetaById}
                    />
                  </CollapsibleContent>
                </Collapsible>
              ) : null}
            </div>
          </div>
        ) : null}

        <p className="text-[11px] text-muted-foreground">
          Source: schedules (legacy read) — rows read arrives with M8
        </p>
      </div>
    </FinanceSectionsShell>
  )
}
