"use client"

import { createContext, useContext, useRef, type ReactNode } from "react"
import { endOfMonth, format, startOfMonth } from "date-fns"
import { createStore, useStore } from "zustand"
import type { PacingFiltersSnapshot } from "@/lib/pacing/pacingFilters"

export type PacingFilterState = PacingFiltersSnapshot & {
  savedViewId: string | null
}

function defaultMonthRange(): Pick<PacingFilterState, "date_from" | "date_to"> {
  const now = new Date()
  return {
    date_from: format(startOfMonth(now), "yyyy-MM-dd"),
    date_to: format(endOfMonth(now), "yyyy-MM-dd"),
  }
}

/** Empty `client_ids` means “all clients in scope” (omit `clients_id` on API; tenant → assigned set). */
export function createDefaultPacingFilters(): Omit<PacingFilterState, "savedViewId"> {
  const month = defaultMonthRange()
  return {
    client_ids: [],
    media_types: [],
    statuses: [],
    date_from: month.date_from,
    date_to: month.date_to,
    search: "",
  }
}

export interface PacingFilterStoreState {
  filters: PacingFilterState
  assignedClientIds: string[]
  setFilters: (partial: Partial<PacingFilterState>) => void
  replaceFilters: (next: Partial<PacingFilterState>) => void
  applySnapshot: (snap: PacingFiltersSnapshot, savedViewId: string | null) => void
  resetToDefaults: () => void
  setAssignedClientIds: (ids: string[]) => void
  hydrateFromUrl: (partial: Partial<PacingFilterState>) => void
  /** Replace toolbar state in one shot (e.g. URL hydration). */
  setFiltersState: (filters: PacingFilterState) => void
}

export type PacingFilterStore = ReturnType<typeof createPacingFilterStoreInstance>

export function createPacingFilterStoreInstance(initialAssignedClientIds: string[]) {
  const defaults: PacingFilterState = {
    ...createDefaultPacingFilters(),
    savedViewId: null,
  }

  return createStore<PacingFilterStoreState>((set, get) => ({
    filters: defaults,
    assignedClientIds: initialAssignedClientIds,

    setAssignedClientIds: (ids) => set({ assignedClientIds: ids }),

    setFilters: (partial) =>
      set((s) => ({
        filters: { ...s.filters, ...partial },
      })),

    replaceFilters: (next) =>
      set((s) => ({
        filters: { ...s.filters, ...next },
      })),

    applySnapshot: (snap, savedViewId) =>
      set(() => ({
        filters: {
          client_ids: [...snap.client_ids],
          media_types: [...snap.media_types],
          statuses: [...snap.statuses],
          date_from: snap.date_from,
          date_to: snap.date_to,
          search: snap.search,
          savedViewId,
        },
      })),

    resetToDefaults: () => {
      set({
        filters: {
          ...createDefaultPacingFilters(),
          savedViewId: null,
        },
      })
    },

    hydrateFromUrl: (partial) =>
      set((s) => ({
        filters: { ...s.filters, ...partial },
      })),

    setFiltersState: (filters) => set({ filters }),
  }))
}

const PacingFilterStoreContext = createContext<PacingFilterStore | null>(null)

export function PacingFilterProvider({
  children,
  initialAssignedClientIds,
}: {
  children: ReactNode
  initialAssignedClientIds: string[]
}) {
  const ref = useRef<PacingFilterStore | null>(null)
  if (!ref.current) {
    ref.current = createPacingFilterStoreInstance(initialAssignedClientIds)
  }
  return (
    <PacingFilterStoreContext.Provider value={ref.current}>{children}</PacingFilterStoreContext.Provider>
  )
}

export function usePacingFilterStore<T>(selector: (s: PacingFilterStoreState) => T): T {
  const store = useContext(PacingFilterStoreContext)
  if (!store) {
    throw new Error("usePacingFilterStore must be used within PacingFilterProvider")
  }
  return useStore(store, selector)
}

export function usePacingFilterStoreApi(): PacingFilterStore {
  const store = useContext(PacingFilterStoreContext)
  if (!store) {
    throw new Error("usePacingFilterStoreApi must be used within PacingFilterProvider")
  }
  return store
}
