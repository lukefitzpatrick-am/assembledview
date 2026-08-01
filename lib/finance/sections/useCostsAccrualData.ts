"use client"

/**
 * Costs Accruals data — same engine as classic hub accrual tab
 * (`computeAccrualByClient` over billing + payables hub derives).
 * Fetches via `/api/finance/billing` + `/api/finance/payables` (blob default until M8).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  fetchFinanceBillingForMonths,
  fetchFinanceEditsList,
  fetchFinancePayablesForMonths,
  type FinanceBillingQuery,
} from "@/lib/finance/api"
import {
  computeAccrualByClient,
  parseAccrualReconcilesFromEdits,
  type AccrualRow,
} from "@/lib/finance/computeAccrual"
import { expandMonthRange } from "@/lib/finance/monthRange"
import type { BillingRecord, BillingType } from "@/lib/types/financeBilling"
import {
  useFinanceScopeApplied,
  useFinanceScopeVersion,
} from "@/lib/finance/sections/useFinanceScope"

const RECEIVABLE_TYPES: BillingType[] = ["media", "sow", "retainer"]

export const ACCRUAL_SOURCE_CAPTION =
  "Source: classic hub derive via /api/finance/billing + /api/finance/payables (DATA_BACKEND_FINANCE_SCHEDULE blob|shadow|rows; default blob until M8 rows). Engine: computeAccrualByClient (receivable − payable − SOW/retainer fees)."

export type CostsAccrualMbaBreakdown = {
  mbaNumber: string
  campaignName: string
  receivable: number
  payable: number
  fees: number
  accrual: number
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/** MBA rollup from the same AccrualRow contributors — not a second engine. */
export function mbaBreakdownFromAccrualRow(row: AccrualRow): CostsAccrualMbaBreakdown[] {
  const map = new Map<string, CostsAccrualMbaBreakdown>()
  const touch = (mba: string, campaign: string) => {
    const key = mba || "—"
    if (!map.has(key)) {
      map.set(key, {
        mbaNumber: key,
        campaignName: campaign || "—",
        receivable: 0,
        payable: 0,
        fees: 0,
        accrual: 0,
      })
    } else {
      const b = map.get(key)!
      if (b.campaignName === "—" && campaign) b.campaignName = campaign
    }
    return map.get(key)!
  }

  for (const r of row.contributing_receivables) {
    const b = touch((r.mba_number || "").trim() || "—", (r.campaign_name || "").trim())
    b.receivable = roundMoney(b.receivable + Number(r.total || 0))
  }
  for (const r of row.contributing_payables) {
    const b = touch((r.mba_number || "").trim() || "—", (r.campaign_name || "").trim())
    const pay = (r.line_items || []).reduce((s, li) => s + Number(li.amount || 0), 0)
    b.payable = roundMoney(b.payable + pay)
  }
  for (const r of row.contributing_receivables) {
    if (r.billing_type !== "sow" && r.billing_type !== "retainer") continue
    const fees = (r.line_items || [])
      .filter((li) => li.line_type === "service" || li.line_type === "fee")
      .reduce((s, li) => s + Number(li.amount || 0), 0)
    if (fees <= 0) continue
    const b = touch((r.mba_number || "").trim() || "—", (r.campaign_name || "").trim())
    b.fees = roundMoney(b.fees + fees)
  }

  return [...map.values()]
    .map((b) => ({
      ...b,
      accrual: roundMoney(b.receivable - b.payable - b.fees),
    }))
    .sort((a, b) => a.mbaNumber.localeCompare(b.mbaNumber))
}

export function investmentHrefForAccrual(clientName: string, clientsId: number, month: string): string {
  const p = new URLSearchParams()
  p.set("client", clientName)
  p.set("clients", String(clientsId))
  p.set("from", month)
  p.set("to", month)
  p.set("month", month)
  return `/finance/investment?${p.toString()}`
}

export type CostsAccrualDataState = {
  loading: boolean
  isUpdating: boolean
  error: string | null
  rows: AccrualRow[]
  sourceCaption: string
  reload: () => void
  reloadEdits: () => Promise<void>
}

export function useCostsAccrualData(): CostsAccrualDataState {
  const applied = useFinanceScopeApplied()
  const scopeVersion = useFinanceScopeVersion()
  const [billing, setBilling] = useState<BillingRecord[]>([])
  const [payables, setPayables] = useState<BillingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editsList, setEditsList] = useState<unknown[]>([])
  const [tick, setTick] = useState(0)
  const hasRowsRef = useRef(false)

  const reloadEdits = useCallback(async () => {
    try {
      setEditsList(await fetchFinanceEditsList())
    } catch {
      setEditsList([])
    }
  }, [])

  useEffect(() => {
    void reloadEdits()
  }, [reloadEdits])

  const reconcileMap = useMemo(() => parseAccrualReconcilesFromEdits(editsList), [editsList])

  const scopeKey = [
    String(applied.fy),
    applied.monthRange.from,
    applied.monthRange.to,
    [...applied.clients].sort((a, b) => a - b).join(","),
    String(scopeVersion),
    String(tick),
  ].join("|")

  useEffect(() => {
    const ac = new AbortController()
    const months = expandMonthRange(applied.monthRange)
    if (months.length === 0) {
      setBilling([])
      setPayables([])
      setLoading(false)
      setError(null)
      return
    }

    if (hasRowsRef.current) {
      setIsUpdating(true)
      setLoading(false)
    } else {
      setLoading(true)
      setIsUpdating(false)
    }
    setError(null)

    const clientsParam =
      applied.clients.length > 0 ? applied.clients.join(",") : undefined
    const billingParams: Omit<FinanceBillingQuery, "billing_month"> = {
      include_drafts: false,
      billing_type: RECEIVABLE_TYPES.join(","),
      ...(clientsParam ? { clients_id: clientsParam } : {}),
    }
    const payablesParams: Omit<FinanceBillingQuery, "billing_month"> = {
      include_drafts: false,
      billing_type: "payable",
      ...(clientsParam ? { clients_id: clientsParam } : {}),
    }

    void (async () => {
      try {
        const [billingRows, payablesRows] = await Promise.all([
          fetchFinanceBillingForMonths(months, billingParams, ac.signal),
          fetchFinancePayablesForMonths(months, payablesParams),
        ])
        if (ac.signal.aborted) return
        setBilling(billingRows)
        setPayables(payablesRows)
        hasRowsRef.current = billingRows.length > 0 || payablesRows.length > 0
        setError(null)
      } catch (err) {
        if (ac.signal.aborted) return
        if (err instanceof DOMException && err.name === "AbortError") return
        setError(err instanceof Error ? err.message : "Failed to load accrual")
      } finally {
        if (!ac.signal.aborted) {
          setLoading(false)
          setIsUpdating(false)
        }
      }
    })()

    return () => ac.abort()
  }, [scopeKey, applied.monthRange, applied.clients])

  const rows = useMemo(() => {
    const receivables = billing.filter((r) => RECEIVABLE_TYPES.includes(r.billing_type))
    let next = computeAccrualByClient(
      receivables,
      payables,
      applied.monthRange,
      reconcileMap
    )
    if (applied.clients.length > 0) {
      const want = new Set(applied.clients.map(String))
      next = next.filter((r) => want.has(String(r.clients_id)))
    }
    return next
  }, [billing, payables, applied.monthRange, applied.clients, reconcileMap])

  return {
    loading,
    isUpdating,
    error,
    rows,
    sourceCaption: ACCRUAL_SOURCE_CAPTION,
    reload: () => setTick((t) => t + 1),
    reloadEdits,
  }
}
