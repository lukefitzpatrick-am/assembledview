import { useMemo } from "react"
import { create } from "zustand"
import type {
  BillingLineItem,
  BillingRecord,
  FinanceFilters,
} from "@/lib/types/financeBilling"
import { fetchBillingRecords, fetchPayablesRecords, FinanceHttpError } from "@/lib/finance/api"
import { getCurrentBillingMonth } from "@/lib/finance/months"
import { expandMonthRange } from "@/lib/finance/monthRange"

export type FinanceHubTab = "overview" | "billing" | "payables" | "accrual" | "forecast"

/** Client-side snapshot of a failed finance list fetch (for toasts + clipboard debug). */
export type FinanceHubFetchError = {
  /** Full message, typically `[status] detail` from {@link FinanceHttpError}. */
  error: string
  field?: string
  status?: number
  requestUrl?: string
}

const HUB_TABS: readonly FinanceHubTab[] = ["overview", "billing", "payables", "accrual", "forecast"]

export function parseFinanceHubTabParam(tab: string | null | undefined): FinanceHubTab {
  if (!tab) return "overview"
  return HUB_TABS.includes(tab as FinanceHubTab) ? (tab as FinanceHubTab) : "overview"
}

function normalizeHubTab(tab: string): FinanceHubTab {
  return parseFinanceHubTabParam(tab)
}

let fetchAllDebounceTimer: ReturnType<typeof setTimeout> | null = null
let fetchAllDebounceResolvers: Array<() => void> = []
/** Signature from the most recent `scheduleFinanceFetchAll` that (re)armed the debounce timer. */
let fetchAllDebounceScheduledSig: string | null = null
let fetchAllInFlight: Promise<void> | null = null
let fetchAllInFlightSignature: string | null = null

/** Stable signature for billing/payables fetches (month range + filter dimensions). */
export function buildFinanceFetchAllSignature(f: FinanceFilters): string {
  return [
    f.monthRange.from,
    f.monthRange.to,
    String(f.includeDrafts),
    f.selectedClients.join(","),
    f.selectedPublishers.join(","),
    [...f.billingTypes].sort().join(","),
    [...f.statuses].sort().join(","),
    f.searchQuery,
  ].join("\u001f")
}

/**
 * Debounced coordinated reload (billing + payables + draft count).
 * Only runs when invoked — does not subscribe to the store.
 * Deduplicates: returns the in-flight promise if a fetch for the same filter signature is already running.
 * Each schedule captures `sigNow` into `fetchAllDebounceScheduledSig` before arming the timer so the
 * debounced run can reconcile that snapshot with `getState()` when the timer fires (avoids dedupe
 * skew from only reading filters inside the timeout).
 */
export function scheduleFinanceFetchAll(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve()

  const sigNow = buildFinanceFetchAllSignature(useFinanceStore.getState().filters)
  if (fetchAllInFlight && fetchAllInFlightSignature === sigNow) {
    return fetchAllInFlight
  }

  return new Promise<void>((resolve) => {
    fetchAllDebounceResolvers.push(resolve)
    fetchAllDebounceScheduledSig = sigNow
    if (fetchAllDebounceTimer !== null) clearTimeout(fetchAllDebounceTimer)
    fetchAllDebounceTimer = setTimeout(() => {
      fetchAllDebounceTimer = null
      const resolvers = fetchAllDebounceResolvers
      fetchAllDebounceResolvers = []
      const scheduledSig = fetchAllDebounceScheduledSig
      fetchAllDebounceScheduledSig = null

      const liveSig = buildFinanceFetchAllSignature(useFinanceStore.getState().filters)
      const runSig =
        scheduledSig !== null && liveSig !== scheduledSig ? liveSig : (scheduledSig ?? liveSig)

      const run = async () => {
        if (fetchAllInFlight && fetchAllInFlightSignature === runSig) {
          await fetchAllInFlight
          return
        }
        const p = useFinanceStore
          .getState()
          .fetchAll()
          .finally(() => {
            if (fetchAllInFlight === p) {
              fetchAllInFlight = null
              fetchAllInFlightSignature = null
            }
          })
        fetchAllInFlight = p
        fetchAllInFlightSignature = runSig
        await p
      }

      void run().finally(() => {
        for (const r of resolvers) r()
      })
    }, 200)
  })
}

function toHubFetchError(error: unknown, fallback: string): FinanceHubFetchError {
  if (error instanceof FinanceHttpError) {
    return {
      error: error.message,
      field: error.field,
      status: error.status,
      requestUrl: error.requestUrl,
    }
  }
  return {
    error: error instanceof Error ? error.message : fallback,
  }
}

interface FinanceStore {
  filters: FinanceFilters
  activeTab: FinanceHubTab
  billingRecords: BillingRecord[]
  billingLoading: boolean
  billingError: FinanceHubFetchError | null
  /**
   * Payable rows from delivery schedules, including client-paid lines (`client_pays_media`).
   * For KPIs and agency totals use {@link sumPayableLineItems} / {@link sumPayableRecordsAgencyExpected}.
   */
  payablesRecords: BillingRecord[]
  payablesLoading: boolean
  payablesError: FinanceHubFetchError | null
  pendingDraftCount: number
  setBillingRecords: (records: BillingRecord[]) => void
  setPayablesRecords: (records: BillingRecord[]) => void
  setFilters: (partial: Partial<FinanceFilters>) => void
  setActiveTab: (tab: string) => void
  fetchBilling: () => Promise<void>
  fetchPayables: () => Promise<void>
  fetchAll: () => Promise<void>
  refreshPendingDraftCount: () => Promise<void>
  updateBillingRecord: (id: number, updates: Partial<BillingRecord>) => void
  updateLineItem: (recordId: number, lineItemId: number, updates: Partial<BillingLineItem>) => void
}

const defaultMonth = getCurrentBillingMonth()

const defaultFilters: FinanceFilters = {
  selectedClients: [],
  selectedPublishers: [],
  includeDrafts: false,
  monthRange: { from: defaultMonth, to: defaultMonth },
  billingTypes: ["media", "sow", "retainer", "payable"],
  statuses: ["draft", "booked", "approved", "invoiced", "paid"],
  searchQuery: "",
}

export const useFinanceStore = create<FinanceStore>((set, get) => ({
  filters: defaultFilters,
  activeTab: "overview",
  billingRecords: [],
  billingLoading: false,
  billingError: null,
  payablesRecords: [],
  payablesLoading: false,
  payablesError: null,
  pendingDraftCount: 0,
  setBillingRecords: (records) => set({ billingRecords: records }),
  setPayablesRecords: (records) => set({ payablesRecords: records }),

  setFilters: (partial) => {
    set((state) => ({
      filters: { ...state.filters, ...partial },
    }))
  },

  setActiveTab: (tab) => set({ activeTab: normalizeHubTab(tab) }),

  refreshPendingDraftCount: async () => {
    try {
      const res = await fetch("/api/finance/edits", { cache: "no-store" })
      if (!res.ok) {
        set({ pendingDraftCount: 0 })
        return
      }
      const rows = (await res.json()) as unknown
      const list = Array.isArray(rows) ? rows : []
      const draftCount = list.filter((row: Record<string, unknown>) => {
        const st = row.edit_status ?? row.status
        return st === "draft"
      }).length
      set({ pendingDraftCount: draftCount })
    } catch {
      set({ pendingDraftCount: 0 })
    }
  },

  fetchBilling: async () => {
    set({ billingLoading: true, billingError: null })
    try {
      const months = expandMonthRange(get().filters.monthRange)
      if (process.env.NEXT_PUBLIC_FINANCE_DEBUG === "1") {
        console.debug("[finance] fetchBilling month fan-out", months)
      }
      const records = await fetchBillingRecords(get().filters)
      set({ billingRecords: records, billingLoading: false, billingError: null })
    } catch (error) {
      set({
        billingLoading: false,
        billingError: toHubFetchError(error, "Failed to load billing records"),
      })
    }
  },

  fetchPayables: async () => {
    set({ payablesLoading: true, payablesError: null })
    try {
      const months = expandMonthRange(get().filters.monthRange)
      if (process.env.NEXT_PUBLIC_FINANCE_DEBUG === "1") {
        console.debug("[finance] fetchPayables month fan-out", months)
      }
      const records = await fetchPayablesRecords(get().filters)
      set({ payablesRecords: records, payablesLoading: false, payablesError: null })
    } catch (error) {
      set({
        payablesLoading: false,
        payablesError: toHubFetchError(error, "Failed to load payables"),
      })
    }
  },

  fetchAll: async () => {
    const { fetchBilling, fetchPayables, refreshPendingDraftCount } = get()
    await Promise.allSettled([fetchBilling(), fetchPayables(), refreshPendingDraftCount()])
  },

  updateBillingRecord: (id, updates) =>
    set((state) => ({
      billingRecords: state.billingRecords.map((record) =>
        record.id === id ? { ...record, ...updates } : record
      ),
    })),

  updateLineItem: (recordId, lineItemId, updates) =>
    set((state) => ({
      billingRecords: state.billingRecords.map((record) => {
        if (record.id !== recordId) return record
        return {
          ...record,
          line_items: record.line_items.map((lineItem) =>
            lineItem.id === lineItemId ? { ...lineItem, ...updates } : lineItem
          ),
        }
      }),
    })),
}))

/** Expanded `filters.monthRange` as `YYYY-MM` strings (Accrual and other multi-month views). */
export function useAccrualMonths(): string[] {
  const key = useFinanceStore((s) => expandMonthRange(s.filters.monthRange).join("\u001f"))
  return useMemo(() => (key.length === 0 ? [] : key.split("\u001f")), [key])
}

export type { FinanceStore, FinanceFilters }

export { sumPayableLineItems, sumPayableRecordsAgencyExpected } from "@/lib/finance/aggregatePayablesPublisherGroups"
