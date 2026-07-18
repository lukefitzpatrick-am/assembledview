"use client"

import { useCallback, useEffect, useMemo } from "react"
import { ChevronDown } from "lucide-react"
import { FinanceFilterToolbar } from "@/components/finance/FinanceFilterToolbar"
import { ReceivablesClientCard } from "@/components/finance/receivables/ReceivablesClientCard"
import { ReceivablesSummaryStrip } from "@/components/finance/receivables/ReceivablesSummaryStrip"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { useFinanceStore } from "@/lib/finance/useFinanceStore"
import { markBilled } from "@/lib/finance/api"
import { useReceivablesData, type MonthGroup } from "@/lib/finance/useReceivablesData"
import { useToast } from "@/components/ui/use-toast"
import { expandMonthRange } from "@/lib/finance/monthRange"
import { formatAUD } from "@/lib/format/money"
import type { BillingRecord } from "@/lib/types/financeBilling"

export type ReceivablesHubBridge = {
  synced: boolean
  loading: boolean
  bump: () => void
  visibleMonthGroups: MonthGroup[]
}

type ReceivablesPageClientProps = {
  /** When true, omit page chrome / duplicate filter bar (hub already provides them). */
  embedded?: boolean
  /** Hub bridge for toolbar sync + finance report export. */
  onHubBridge?: (bridge: ReceivablesHubBridge) => void
}

function formatMonthRangeSubtitle(from: string, to: string): string {
  const months = expandMonthRange({ from, to })
  if (months.length === 0) return ""
  if (months.length === 1) {
    const d = new Date(`${months[0]}-01T00:00:00`)
    return d.toLocaleString("en-AU", { month: "long", year: "numeric" })
  }
  const first = new Date(`${months[0]}-01T00:00:00`)
  const last = new Date(`${months[months.length - 1]}-01T00:00:00`)
  const a = first.toLocaleString("en-AU", { month: "short", year: "numeric" })
  const b = last.toLocaleString("en-AU", { month: "short", year: "numeric" })
  return `${a} – ${b}`
}

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
        if (mediaPlans.length === 0 && scopeOfWorks.length === 0 && retainers.length === 0) return null
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

function ReceivablesMonthSections({
  groups,
  refetch,
  onToggleBilled,
  onNotesSaved,
  onLineAmountCommitted,
}: {
  groups: ReturnType<typeof useReceivablesData>["visibleMonthGroups"]
  refetch: () => void
  onToggleBilled: (rec: BillingRecord, nextBilled: boolean) => Promise<void>
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
              <ReceivablesClientCard
                key={`${mg.monthIso}-${client.clientsId}`}
                client={client}
                monthLabel={mg.monthLabel}
                refetch={refetch}
                onToggleBilled={onToggleBilled}
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

export function ReceivablesPageClient({ embedded = false, onHubBridge }: ReceivablesPageClientProps = {}) {
  const filters = useFinanceStore((s) => s.filters)
  const {
    loading,
    visibleMonthGroups,
    filterSig,
    loadedSignature,
    loadError,
    bumpReceivablesFetch,
    updateBilledByInvoiceKey,
    updateNotesByInvoiceKey,
    updateReceivableLineAmount,
  } = useReceivablesData("billing")

  const { toast } = useToast()

  const synced = loadedSignature === filterSig

  useEffect(() => {
    onHubBridge?.({
      synced,
      loading,
      bump: bumpReceivablesFetch,
      visibleMonthGroups,
    })
  }, [onHubBridge, synced, loading, bumpReceivablesFetch, visibleMonthGroups])

  const handleToggleBilled = useCallback(
    async (rec: BillingRecord, nextBilled: boolean) => {
      if (!rec.invoice_key) {
        toast({
          variant: "destructive",
          title: "Cannot mark billed",
          description: "This invoice has no billing key (missing MBA or month).",
        })
        return
      }
      try {
        const res = await markBilled({
          billing_type: rec.billing_type,
          clients_id: rec.clients_id,
          client_name: rec.client_name,
          mba_number: rec.mba_number,
          campaign_name: rec.campaign_name,
          billing_month: rec.billing_month,
          billed: nextBilled,
          total: rec.total,
          line_items: (rec.line_items ?? []).map((li) => ({
            item_code: li.item_code,
            amount: li.amount,
            schedule_line_item_id: li.schedule_line_item_id ?? null,
          })),
        })
        updateBilledByInvoiceKey(res.invoice_key, {
          billed: res.billed,
          billed_at: res.billed_at,
          billed_by: res.billed_by,
          persisted_record_id: res.persisted_record_id,
          billed_amount: res.billed_amount,
          billed_lines_hash: res.billed_lines_hash,
          billed_drift: res.billed_drift,
          billed_drift_delta: res.billed_drift_delta,
        })
      } catch (e) {
        toast({
          variant: "destructive",
          title: nextBilled ? "Mark billed failed" : "Un-mark failed",
          description: e instanceof Error ? e.message : "Unknown error",
        })
      }
    },
    [toast, updateBilledByInvoiceKey]
  )

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

  const awaitingExplicitLoad = !synced

  const allRecords = useMemo(
    () => collectBillingRecordsFromMonthGroups(visibleMonthGroups),
    [visibleMonthGroups]
  )

  const kpi = useMemo(() => {
    const totalToBill = allRecords.reduce((s, r) => s + r.total, 0)
    const billed = allRecords.filter((r) => r.billed === true).reduce((s, r) => s + r.total, 0)
    return {
      totalToBill: Math.round(totalToBill * 100) / 100,
      billed: Math.round(billed * 100) / 100,
      outstanding: Math.round((totalToBill - billed) * 100) / 100,
    }
  }, [allRecords])

  const unbilledGroups = useMemo(
    () => filterReceivablesMonthGroups(visibleMonthGroups, (r) => r.billed !== true),
    [visibleMonthGroups]
  )
  const billedGroups = useMemo(
    () => filterReceivablesMonthGroups(visibleMonthGroups, (r) => r.billed === true),
    [visibleMonthGroups]
  )

  const billedInvoiceCount = countInvoicesInMonthGroups(billedGroups)
  const billedTotal = sumMonthGroupsTotal(billedGroups)
  const unbilledInvoiceCount = countInvoicesInMonthGroups(unbilledGroups)

  const subtitle = formatMonthRangeSubtitle(filters.monthRange.from, filters.monthRange.to)

  const body = (
    <>
      {synced && !loading ? (
        <ReceivablesSummaryStrip
          className={embedded ? undefined : "mt-4"}
          totalToBill={kpi.totalToBill}
          billed={kpi.billed}
          outstanding={kpi.outstanding}
        />
      ) : null}

      <div className={embedded ? "relative mt-4" : "relative mt-4"}>
        {loading && visibleMonthGroups.length === 0 ? (
          <LoadingState rows={5} />
        ) : loadError && !loading ? (
          <ErrorState title="Could not load receivables" message={loadError} onRetry={bumpReceivablesFetch} />
        ) : !loading && awaitingExplicitLoad ? (
          <EmptyState
            title="Load receivables"
            message="Use Load or Refresh to fetch receivables for the selected filters."
          />
        ) : !loading && visibleMonthGroups.length === 0 ? (
          <EmptyState
            title="No receivables"
            message="No receivables for the current filters and billing months in view."
          />
        ) : (
          <div className="space-y-6 pt-1">
            {unbilledInvoiceCount === 0 && billedInvoiceCount > 0 ? (
              <p className="text-sm text-muted-foreground">All invoices billed for this period.</p>
            ) : null}

            <ReceivablesMonthSections
              groups={unbilledGroups}
              refetch={bumpReceivablesFetch}
              onToggleBilled={handleToggleBilled}
              onNotesSaved={handleNotesSaved}
              onLineAmountCommitted={handleLineAmountCommitted}
            />

            {billedInvoiceCount > 0 ? (
              <Collapsible defaultOpen={false} className="group/billed">
                <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-card border border-border bg-surface-panel px-4 py-3 text-left hover:bg-table-row-hover">
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/billed:rotate-180" />
                  <span className="text-sm font-medium">
                    Billed this month · {billedInvoiceCount} {billedInvoiceCount === 1 ? "invoice" : "invoices"} ·{" "}
                    {formatAUD(billedTotal)}
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-4">
                  <ReceivablesMonthSections
                    groups={billedGroups}
                    refetch={bumpReceivablesFetch}
                    onToggleBilled={handleToggleBilled}
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
                    Billed this month · 0 invoices · {formatAUD(0)}
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-4">
                  <p className="text-sm text-muted-foreground">No billed invoices for this period.</p>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        )}
      </div>
    </>
  )

  if (embedded) {
    return <div className="w-full">{body}</div>
  }

  return (
    <div className="w-full max-w-none px-4 pb-10 pt-4 md:px-6 md:pt-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Receivables</h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-muted-foreground">Billing period: {subtitle}</p>
        ) : null}
      </header>

      <div className="rounded-card border border-border bg-card px-3 py-2 shadow-e1">
        <FinanceFilterToolbar
          receivables={{
            synced,
            loading,
            bump: bumpReceivablesFetch,
          }}
        />
      </div>

      {body}
    </div>
  )
}
