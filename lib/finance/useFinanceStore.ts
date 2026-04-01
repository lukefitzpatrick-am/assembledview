import { create } from "zustand"
import type {
  BillingLineItem,
  BillingRecord,
  BillingStatus,
  BillingType,
  FinanceFilters,
} from "@/lib/types/financeBilling"
import { fetchBillingRecords } from "@/lib/finance/api"

interface FinanceStore {
  filters: FinanceFilters
  activeTab: "billing" | "publishers"
  billingRecords: BillingRecord[]
  billingLoading: boolean
  billingError: string | null
  setBillingRecords: (records: BillingRecord[]) => void
  setFilters: (partial: Partial<FinanceFilters>) => void
  setActiveTab: (tab: string) => void
  fetchBilling: () => Promise<void>
  updateBillingRecord: (id: number, updates: Partial<BillingRecord>) => void
  updateLineItem: (recordId: number, lineItemId: number, updates: Partial<BillingLineItem>) => void
}

const defaultFilters: FinanceFilters = {
  selectedClients: [],
  monthRange: { from: new Date().toISOString().slice(0, 7), to: new Date().toISOString().slice(0, 7) },
  billingTypes: ["media", "sow", "retainer"] as BillingType[],
  statuses: ["draft", "booked", "approved", "invoiced", "paid"] as BillingStatus[],
  searchQuery: "",
}

export const useFinanceStore = create<FinanceStore>((set, get) => ({
  filters: defaultFilters,
  activeTab: "billing",
  billingRecords: [],
  billingLoading: false,
  billingError: null,
  setBillingRecords: (records) => set({ billingRecords: records }),

  setFilters: (partial) =>
    set((state) => ({
      filters: { ...state.filters, ...partial },
    })),

  setActiveTab: (tab) => set({ activeTab: tab === "publishers" ? "publishers" : "billing" }),

  fetchBilling: async () => {
    set({ billingLoading: true, billingError: null })
    try {
      const records = await fetchBillingRecords(get().filters)
      set({ billingRecords: records, billingLoading: false, billingError: null })
    } catch (error) {
      set({
        billingLoading: false,
        billingError: error instanceof Error ? error.message : "Failed to load billing records",
      })
    }
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

export type { FinanceStore, FinanceFilters }
