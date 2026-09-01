"use client"

/**
 * Invoicing section page — adapted COPY of hub `ReceivablesPageClient`.
 * Wired to `useFinanceScope` + auto-load (no Load gate). Legacy files untouched.
 */

import { useCallback, useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"
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
import {
  filterApprovedReceivablesForExport,
  summariseLastExport,
} from "@/lib/finance/approvedReceivablesExport"
import { grainFromBillingRecord } from "@/lib/finance/billingApproveGrain"
import { approveBillingRecords, markBillingRecordsExported } from "@/lib/finance/api"
import { exportReceivablesWorkbook } from "@/lib/finance/exportFinanceHub"
import { expandMonthRange } from "@/lib/finance/monthRange"
import { formatAUD } from "@/lib/format/money"
import { formatDateShort } from "@/lib/format/date"
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

function sumMonthGroupsTotal(groups: MonthGroup[]): number {
  return groups.reduce((s, mg) => s + mg.total, 0)
}

function InvoicingMonthSections({
  groups,
  refetch,
  onNotesSaved,
  onLineAmountCommitted,
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
}) {
  if (groups.length === 0) return null
  return (
    <div className="space-y-8">
      {groups.map((mg) => (
        <section key={mg.monthIso} className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-border/50 pb-2">
            <p className="text-sm font-medium text-foreground">{mg.monthLabel}</p>
            <p className="num text-xs font-medium text-foreground">{formatAUD(mg.total)}</p>
          </div>
          <div className="space-y-4">
            {mg.clients.map((client) => (
              <InvoicingClientCard
                key={`${mg.monthIso}-${client.clientsId}`}
                client={client}
                monthLabel={mg.monthLabel}
                refetch={refetch}
                onNotesSaved={onNotesSaved}
                onLineAmountCommitted={onLineAmountCommitted}
              />
            ))}
          </div>
        </section>
      ))}
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
  const lastExport = useMemo(() => summariseLastExport(allRecords), [allRecords])
  const lastExportLine = useMemo(() => {
    if (!lastExport) return null
    const name = lastExport.exportedByName ?? lastExportName ?? "finance admin"
    const clients =
      lastExport.clientCount === 1 ? "1 client" : `${lastExport.clientCount} clients`
    return `Last exported ${formatDateShort(lastExport.exportedAt)} by ${name} · ${clients} · ${formatAUD(lastExport.total)}`
  }, [lastExport, lastExportName])

  const kpi = useMemo(() => {
    const totalToBill = allRecords.reduce((s, r) => s + r.total, 0)
    const billed = allRecords
      .filter((r) => hasBillingEvidence(r.state))
      .reduce((s, r) => s + r.total, 0)
    return {
      totalToBill: Math.round(totalToBill * 100) / 100,
      billed: Math.round(billed * 100) / 100,
      outstanding: Math.round((totalToBill - billed) * 100) / 100,
    }
  }, [allRecords])

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
      const keys = approvedRecords
        .map((r) => r.invoice_key)
        .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
      if (keys.length > 0) {
        const exported = await markBillingRecordsExported({ invoice_keys: keys })
        setLastExportName(exported.exported_by_name)
        bumpFetch()
      }
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
  }, [approvedRecords, monthLabel, toast, bumpFetch])

  const approveReady = useCallback(async () => {
    if (readyGrains.length === 0 || approveBusy) return
    setApproveBusy(true)
    try {
      await approveBillingRecords({
        invoice_keys: readyGrains.map((g) => g.invoice_key),
        grains: readyGrains,
      })
      toast({ title: `Approved ${readyGrains.length} invoice${readyGrains.length === 1 ? "" : "s"}` })
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
  }, [readyGrains, approveBusy, toast, bumpFetch])

  const coldLoading = loading && visibleMonthGroups.length === 0 && !loadError
  const showNoReceivables =
    !loading && !isUpdating && !loadError && visibleMonthGroups.length === 0

  return (
    <FinanceSectionsShell
      title="Clients billing"
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
            approvedRecords.length === 0 ? "Approve invoices before exporting." : undefined
          }
          onApproveReady={() => void approveReady()}
          approveReadyCount={readyGrains.length}
          approveBusy={approveBusy || isUpdating}
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

        {coldLoading ? <LoadingState rows={5} /> : null}

        {loadError && !coldLoading ? (
          <ErrorState title="Could not load receivables" message={loadError} onRetry={bumpFetch} />
        ) : null}

        {showNoReceivables ? (
          <>
            <ReceivablesSummaryStrip
              totalToBill={0}
              billed={0}
              outstanding={0}
            />
            <EmptyState
              title="No receivables"
              message="No receivables for the current scope and filters."
            />
          </>
        ) : null}

        {!coldLoading && visibleMonthGroups.length > 0 ? (
          <div
            className={cn(isUpdating && "pointer-events-none opacity-60")}
            aria-busy={isUpdating || undefined}
          >
            <ReceivablesSummaryStrip
              totalToBill={kpi.totalToBill}
              billed={kpi.billed}
              outstanding={kpi.outstanding}
            />

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
                    />
                  </CollapsibleContent>
                </Collapsible>
              ) : (
                <Collapsible defaultOpen={false} className="group/billed">
                  <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-card border border-border bg-surface-panel px-4 py-3 text-left hover:bg-table-row-hover">
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=closed]/billed:-rotate-90" />
                    <span className="text-sm font-medium text-muted-foreground">
                      Approved & beyond · 0 invoices · {formatAUD(0)}
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-4">
                    <p className="text-sm text-muted-foreground">
                      No approved, sent, or issued invoices for this period.
                    </p>
                  </CollapsibleContent>
                </Collapsible>
              )}
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
