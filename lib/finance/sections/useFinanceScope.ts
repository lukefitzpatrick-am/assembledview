"use client"

/**
 * Shared finance-sections scope store.
 * Draft edits stay local until Apply commits them, bumps scopeVersion, and syncs the URL.
 */

import { create } from "zustand"
import { clientFeatureOn } from "@/lib/features/client"
import {
  buildDefaultFinanceScope,
  normaliseToFy,
  type FinanceScopeValues,
} from "@/lib/finance/sections/defaultScope"
import {
  cloneScope,
  parseScopeFromParams,
  scopeToSearchParams,
  scopesEqual,
} from "@/lib/finance/sections/scopeUrl"
import type { MonthRange } from "@/lib/finance/monthRange"

export type FinanceScopeState = {
  applied: FinanceScopeValues
  draft: FinanceScopeValues
  scopeVersion: number
  setDraft: (partial: Partial<FinanceScopeValues>) => void
  setDraftMonthRange: (range: MonthRange) => void
  setDraftFy: (fy: number) => void
  apply: () => void
  reset: () => void
  hydrateFromUrl: (params: URLSearchParams, opts?: { bump?: boolean }) => void
  toSearchParams: () => URLSearchParams
  isDirty: () => boolean
}

/** B43: switch `finance_melbourne_month`: the default FY and range end on the Melbourne month. Read at each use. */
function monthOpts() {
  return { melbourne: clientFeatureOn("finance_melbourne_month") }
}

const initial = buildDefaultFinanceScope(new Date(), monthOpts())

export const useFinanceScopeStore = create<FinanceScopeState>((set, get) => ({
  applied: cloneScope(initial),
  draft: cloneScope(initial),
  scopeVersion: 1,

  setDraft: (partial) => {
    set((state) => ({
      draft: {
        ...state.draft,
        ...partial,
        monthRange: partial.monthRange
          ? { ...partial.monthRange }
          : state.draft.monthRange,
        clients: partial.clients ? [...partial.clients] : state.draft.clients,
      },
    }))
  },

  setDraftMonthRange: (range) => {
    set((state) => ({
      draft: {
        ...state.draft,
        monthRange: normaliseToFy(state.draft.fy, range),
      },
    }))
  },

  setDraftFy: (fy) => {
    set((state) => {
      const today = new Date()
      const currentFy = buildDefaultFinanceScope(today, monthOpts()).fy
      const rebuilt = buildDefaultFinanceScope(new Date(fy, 6, 15), monthOpts())
      let monthRange = rebuilt.monthRange
      if (fy < currentFy) {
        monthRange = normaliseToFy(fy, { from: `${fy}-07`, to: `${fy + 1}-06` })
      }
      return {
        draft: {
          ...state.draft,
          fy,
          monthRange,
        },
      }
    })
  },

  apply: () => {
    const { draft } = get()
    const next = cloneScope({
      ...draft,
      monthRange: normaliseToFy(draft.fy, draft.monthRange),
    })
    // Always bump scopeVersion — Apply on a clean bar is a refetch, not a no-op.
    set((state) => ({
      applied: next,
      draft: cloneScope(next),
      scopeVersion: state.scopeVersion + 1,
    }))
  },

  reset: () => {
    const next = buildDefaultFinanceScope(new Date(), monthOpts())
    set((state) => ({
      applied: cloneScope(next),
      draft: cloneScope(next),
      scopeVersion: state.scopeVersion + 1,
    }))
  },

  hydrateFromUrl: (params, opts) => {
    const next = parseScopeFromParams(params, new Date(), monthOpts())
    set((state) => ({
      applied: cloneScope(next),
      draft: cloneScope(next),
      scopeVersion: opts?.bump ? state.scopeVersion + 1 : state.scopeVersion,
    }))
  },

  toSearchParams: () => scopeToSearchParams(get().applied),

  isDirty: () => {
    const { draft, applied } = get()
    return !scopesEqual(draft, applied)
  },
}))

export function useFinanceScopeApplied(): FinanceScopeValues {
  return useFinanceScopeStore((s) => s.applied)
}

export function useFinanceScopeVersion(): number {
  return useFinanceScopeStore((s) => s.scopeVersion)
}
