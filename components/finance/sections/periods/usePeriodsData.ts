"use client"

import { useCallback, useEffect, useState } from "react"
import type {
  AppNotification,
  FinancePeriod,
  FinanceRunItem,
} from "@/lib/finance/periods/types"

export type PeriodsPayload = {
  mode: string
  periods: FinancePeriod[]
  items: FinanceRunItem[]
  notifications: AppNotification[]
  unread: number
}

export function usePeriodsData(selectedMonth: string | null) {
  const [data, setData] = useState<PeriodsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (periodMonth?: string | null) => {
    setError(null)
    const q = periodMonth ? `?periodMonth=${encodeURIComponent(periodMonth)}` : ""
    const res = await fetch(`/api/finance/periods${q}`)
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      setError(j.error || `Failed to load periods (${res.status})`)
      setLoading(false)
      return
    }
    const json = (await res.json()) as PeriodsPayload
    setData(json)
    setLoading(false)
  }, [])

  useEffect(() => {
    setLoading(true)
    void load(selectedMonth)
  }, [load, selectedMonth])

  const postReview = useCallback(
    async (body: {
      action: "approve" | "adjust" | "hold"
      periodMonth: string
      itemId: number
      reason?: string
      adjustmentCents?: number
    }) => {
      setBusy(true)
      setError(null)
      try {
        const res = await fetch("/api/finance/periods", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          setError(j.error || res.statusText)
          return false
        }
        await load(body.periodMonth)
        return true
      } finally {
        setBusy(false)
      }
    },
    [load]
  )

  const runPeriod = useCallback(
    async (periodMonth: string) => {
      setBusy(true)
      setError(null)
      try {
        const res = await fetch("/api/admin/finance-periods/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ periodMonth }),
        })
        const j = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean }
        if (!res.ok || j.ok === false) {
          setError(j.error || res.statusText)
          return false
        }
        await load(periodMonth)
        return true
      } finally {
        setBusy(false)
      }
    },
    [load]
  )

  const lockPeriod = useCallback(
    async (periodMonth: string) => {
      setBusy(true)
      setError(null)
      try {
        const res = await fetch("/api/admin/finance-periods/lock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ periodMonth }),
        })
        const j = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean }
        if (!res.ok || j.ok === false) {
          setError(j.error || res.statusText)
          return false
        }
        await load(periodMonth)
        return true
      } finally {
        setBusy(false)
      }
    },
    [load]
  )

  return {
    data,
    loading,
    error,
    busy,
    reload: () => load(selectedMonth),
    postReview,
    runPeriod,
    lockPeriod,
    setError,
  }
}
