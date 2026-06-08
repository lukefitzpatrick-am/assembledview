"use client"

import { useCallback, useMemo } from "react"
import { ChevronDown, Loader2 } from "lucide-react"
import { FinanceFilterToolbar } from "@/components/finance/FinanceFilterToolbar"
import { ReceivablesClientCard } from "@/components/finance/receivables/ReceivablesClientCard"
import { ReceivablesSummaryStrip } from "@/components/finance/receivables/ReceivablesSummaryStrip"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useFinanceStore } from "@/lib/finance/useFinanceStore"
import { markBilled } from "@/lib/finance/api"
import { useReceivablesData, type MonthGroup } from "@/lib/finance/useReceivablesData"
import { useToast } from "@/components/ui/use-toast"
import { expandMonthRange } from "@/lib/finance/monthRange"
import { formatMoney } from "@/lib/format/money"
import type { BillingRecord } from "@/lib/types/financeBilling"

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
}: {
  groups: ReturnType<typeof useReceivablesData>["visibleMonthGroups"]
  refetch: () => void
  onToggleBilled: (rec: BillingRecord, nextBilled: boolean) => Promise<void>
}) {
  if (groups.length === 0) return null

  return (
    <div className="space-y-8">
      {groups.map((mg) => (
        <section key={mg.monthIso} className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-border/50 pb-2">
            <p className="text-sm font-medium text-foreground">{mg.monthLabel}</p>
            <p className="text-xs font-medium tabular-nums text-foreground">{formatMoney(mg.total)}</p>
          </div>
          <div className="space-y-4">
            {mg.clients.map((client) => (
              <ReceivablesClientCard
                key={`${mg.monthIso}-${client.clientsId}`}
                client={client}
                monthLabel={mg.monthLabel}
                refetch={refetch}
                onToggleBilled={onToggleBilled}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export function ReceivablesPageClient() {
  const filters = useFinanceStore((s) => s.filters)
  const {
    loading,
    visibleMonthGroups,
    filterSig,
    loadedSignature,
    loadError,
    bumpReceivablesFetch,
    updateBilledByInvoiceKey,
  } = useReceivablesData("billing")

  const { toast } = useToast()

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
        })
        updateBilledByInvoiceKey(res.invoice_key, {
          billed: res.billed,
          billed_at: res.billed_at,
          billed_by: res.billed_by,
          persisted_record_id: res.persisted_record_id,
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

  const synced = loadedSignature === filterSig
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

  return (
    <div className="w-full max-w-none px-4 pb-10 pt-4 md:px-6 md:pt-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Receivables</h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-muted-foreground">Billing period: {subtitle}</p>
        ) : null}
      </header>

      <div className="rounded-md border border-border/60 bg-card px-3 py-2">
        <FinanceFilterToolbar
          receivables={{
            synced,
            loading,
            bump: bumpReceivablesFetch,
          }}
        />
      </div>

      {synced && !loading ? (
        <ReceivablesSummaryStrip
          className="mt-4"
          totalToBill={kpi.totalToBill}
          billed={kpi.billed}
          outstanding={kpi.outstanding}
        />
      ) : null}

      <div className="relative mt-4">
        {loading && visibleMonthGroups.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            Loading receivables…
          </div>
        ) : loadError && !loading ? (
          <p className="py-6 text-sm text-destructive" role="alert">
            {loadError}
          </p>
        ) : !loading && awaitingExplicitLoad ? (
          <p className="py-10 text-sm text-muted-foreground">
            Use <span className="font-medium text-foreground">Load</span> or{" "}
            <span className="font-medium text-foreground">Refresh</span> to fetch receivables for the selected filters.
          </p>
        ) : !loading && visibleMonthGroups.length === 0 ? (
          <p className="py-10 text-sm text-muted-foreground">
            No receivables for the current filters and billing months in view.
          </p>
        ) : (
          <div className="space-y-6 pt-1">
            {unbilledInvoiceCount === 0 && billedInvoiceCount > 0 ? (
              <p className="text-sm text-muted-foreground">All invoices billed for this period.</p>
            ) : null}

            <ReceivablesMonthSections
              groups={unbilledGroups}
              refetch={bumpReceivablesFetch}
              onToggleBilled={handleToggleBilled}
            />

            {billedInvoiceCount > 0 ? (
              <Collapsible defaultOpen={false} className="group/billed">
                <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-left hover:bg-muted/45">
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/billed:rotate-180" />
                  <span className="text-sm font-medium">
                    Billed this month · {billedInvoiceCount} {billedInvoiceCount === 1 ? "invoice" : "invoices"} ·{" "}
                    {formatMoney(billedTotal)}
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-4">
                  <ReceivablesMonthSections
                    groups={billedGroups}
                    refetch={bumpReceivablesFetch}
                    onToggleBilled={handleToggleBilled}
                  />
                </CollapsibleContent>
              </Collapsible>
            ) : (
              <Collapsible defaultOpen={false} className="group/billed">
                <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-left hover:bg-muted/45">
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=closed]/billed:-rotate-90" />
                  <span className="text-sm font-medium text-muted-foreground">
                    Billed this month · 0 invoices · {formatMoney(0)}
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
    </div>
  )
}
