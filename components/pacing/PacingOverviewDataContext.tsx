"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  fetchPacingLineItemHistoryBatch,
  fetchPacingLineItems,
} from "@/lib/xano/pacing-client"
import { lineItemsApiParamsFromSnapshot } from "@/lib/pacing/pacingFilters"
import { usePacingFilterStore } from "@/lib/pacing/usePacingFilterStore"
import type { LineItemPacingDailyPoint, LineItemPacingRow } from "@/lib/xano/pacing-types"
import { getClientDisplayName } from "@/lib/clients/slug"

const BATCH_SIZE = 380

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

type PacingOverviewDataContextValue = {
  lineItems: LineItemPacingRow[]
  historyById: ReadonlyMap<string, LineItemPacingDailyPoint[]>
  clientNameById: ReadonlyMap<number, string>
  loading: boolean
  drawerLineItem: LineItemPacingRow | null
  openDrawer: (row: LineItemPacingRow) => void
  closeDrawer: () => void
}

const PacingOverviewDataContext = createContext<PacingOverviewDataContextValue | null>(null)

export function PacingOverviewDataProvider({ children }: { children: ReactNode }) {
  const filters = usePacingFilterStore((s) => s.filters)
  const filtersKey = JSON.stringify(filters)

  const [lineItems, setLineItems] = useState<LineItemPacingRow[]>([])
  const [historyById, setHistoryById] = useState<Map<string, LineItemPacingDailyPoint[]>>(new Map())
  const [clientNameById, setClientNameById] = useState<Map<number, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [drawerLineItem, setDrawerLineItem] = useState<LineItemPacingRow | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch("/api/clients")
        if (!res.ok || cancelled) return
        const data = await res.json()
        const m = new Map<number, string>()
        for (const c of Array.isArray(data) ? data : []) {
          const raw = c as Record<string, unknown>
          const id = Number(raw.id)
          if (!Number.isFinite(id)) continue
          m.set(id, String(getClientDisplayName(raw)))
        }
        if (!cancelled) setClientNameById(m)
      } catch {
        if (!cancelled) setClientNameById(new Map())
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setHistoryById(new Map())

    void (async () => {
      try {
        const params = lineItemsApiParamsFromSnapshot(filters)
        const res = await fetchPacingLineItems(params)
        if (cancelled) return
        const rows = Array.isArray(res.data) ? res.data : []
        setLineItems(rows)
        const ids = rows.map((r) => r.av_line_item_id).filter(Boolean)
        const merged: Record<string, LineItemPacingDailyPoint[]> = {}
        for (const part of chunk(ids, BATCH_SIZE)) {
          if (part.length === 0) continue
          const batch = await fetchPacingLineItemHistoryBatch({ av_line_item_ids: part, days: 14 })
          if (cancelled) return
          for (const [k, v] of Object.entries(batch.data ?? {})) {
            merged[k] = v
          }
        }
        if (cancelled) return
        const byNorm = new Map<string, LineItemPacingDailyPoint[]>()
        for (const [k, v] of Object.entries(merged)) {
          byNorm.set(k.trim().toLowerCase(), Array.isArray(v) ? v : [])
        }
        const keyed = new Map<string, LineItemPacingDailyPoint[]>()
        for (const r of rows) {
          const id = r.av_line_item_id
          keyed.set(id, byNorm.get(id.trim().toLowerCase()) ?? [])
        }
        setHistoryById(keyed)
      } catch {
        if (!cancelled) {
          setLineItems([])
          setHistoryById(new Map())
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [filtersKey])

  const openDrawer = useCallback((row: LineItemPacingRow) => {
    setDrawerLineItem(row)
  }, [])

  const closeDrawer = useCallback(() => setDrawerLineItem(null), [])

  const value = useMemo(
    (): PacingOverviewDataContextValue => ({
      lineItems,
      historyById,
      clientNameById,
      loading,
      drawerLineItem,
      openDrawer,
      closeDrawer,
    }),
    [lineItems, historyById, clientNameById, loading, drawerLineItem, openDrawer, closeDrawer]
  )

  return <PacingOverviewDataContext.Provider value={value}>{children}</PacingOverviewDataContext.Provider>
}

export function usePacingOverviewData(): PacingOverviewDataContextValue {
  const ctx = useContext(PacingOverviewDataContext)
  if (!ctx) {
    throw new Error("usePacingOverviewData must be used within PacingOverviewDataProvider")
  }
  return ctx
}
