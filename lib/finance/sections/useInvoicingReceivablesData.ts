"use client"

/**
 * Invoicing section receivables fetch — COPY of hub `useReceivablesData` adapted to
 * `useFinanceScope` + local status/billing-type filters. Auto-loads on mount and on
 * every signature change (no Load gate). Keeps prior rows while a fetch is in flight.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import type { BillingRecord, BillingStatus, BillingType } from "@/lib/types/financeBilling"
import { fetchFinanceBillingForMonths, type FinanceBillingQuery } from "@/lib/finance/api"
import { detectBilledDrift, toBilledLineSnapshots } from "@/lib/finance/billedDrift"
import { expandMonthRange } from "@/lib/finance/monthRange"
import {
  isReceivableRecord,
  type ClientGroup,
  type MediaPlanGroup,
  type MonthGroup,
} from "@/lib/finance/useReceivablesData"
import { RECEIVABLE_BILLING_TYPES, RECEIVABLE_STATUSES } from "@/lib/finance/financeTabFilterScope"
import {
  useFinanceScopeApplied,
  useFinanceScopeVersion,
} from "@/lib/finance/sections/useFinanceScope"

export type InvoicingLocalFilters = {
  billingTypes: BillingType[]
  statuses: BillingStatus[]
  selectedPublishers: number[]
  searchQuery: string
  includeDrafts: boolean
}

export const DEFAULT_INVOICING_LOCAL_FILTERS: InvoicingLocalFilters = {
  billingTypes: [...RECEIVABLE_BILLING_TYPES],
  statuses: [...RECEIVABLE_STATUSES],
  selectedPublishers: [],
  searchQuery: "",
  includeDrafts: false,
}

function buildInvoicingFetchSignature(
  scope: { fy: number; monthRange: { from: string; to: string }; clients: number[] },
  local: InvoicingLocalFilters
): string {
  return [
    String(scope.fy),
    scope.monthRange.from,
    scope.monthRange.to,
    [...scope.clients].sort((a, b) => a - b).join(","),
    [...local.billingTypes].sort().join(","),
    [...local.statuses].sort().join(","),
    [...local.selectedPublishers].sort((a, b) => a - b).join(","),
    local.searchQuery.trim(),
    local.includeDrafts ? "1" : "0",
  ].join("|")
}

/** While updating, keep prior months on screen even if the new range has no overlap. */
export function resolveInvoicingVisibleMonthGroups(
  monthGroups: MonthGroup[],
  monthRange: { from: string; to: string },
  isUpdating: boolean
): MonthGroup[] {
  if (isUpdating) return monthGroups
  const allowed = new Set(expandMonthRange(monthRange))
  return monthGroups.filter((g) => allowed.has(g.monthIso))
}

export type InvoicingReceivablesState = {
  loading: boolean
  isUpdating: boolean
  visibleMonthGroups: MonthGroup[]
  loadError: string | null
  filterSig: string
  loadedSignature: string | null
  bumpFetch: () => void
  updateBilledByInvoiceKey: (
    invoiceKey: string,
    fields: {
      billed: boolean
      billed_at: number | null
      billed_by: number | null
      persisted_record_id?: number | null
      billed_amount?: number | null
      billed_lines_hash?: string | null
      billed_drift?: boolean
      billed_drift_delta?: number | null
    }
  ) => void
  updateNotesByInvoiceKey: (
    invoiceKey: string,
    fields: { notes: string | null; persisted_record_id?: number | null }
  ) => void
  updateReceivableLineAmount: (
    match: {
      mba_number: string | null
      billing_month: string
      schedule_line_item_id?: string | null
      item_code?: string
      line_type?: BillingRecord["line_items"][number]["line_type"]
    },
    fields: { amount: number; billing_mode?: "auto" | "manual" | null }
  ) => void
}

export function useInvoicingReceivablesData(
  localFilters: InvoicingLocalFilters
): InvoicingReceivablesState {
  const applied = useFinanceScopeApplied()
  const scopeVersion = useFinanceScopeVersion()
  const [records, setRecords] = useState<BillingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [manualBump, setManualBump] = useState(0)
  const [loadedSignature, setLoadedSignature] = useState<string | null>(null)

  const filterSig = useMemo(
    () => buildInvoicingFetchSignature(applied, localFilters),
    [applied, localFilters]
  )

  const bumpFetch = useCallback(() => {
    setManualBump((k) => k + 1)
  }, [])

  const isStale = loadedSignature !== null && filterSig !== loadedSignature
  /** Prior rows stay on screen while a new signature loads (July P0-3 A+B). */
  const isUpdating = (loading && records.length > 0) || isStale

  const updateBilledByInvoiceKey = useCallback<
    InvoicingReceivablesState["updateBilledByInvoiceKey"]
  >((invoiceKey, fields) => {
    if (!invoiceKey) return
    setRecords((prev) =>
      prev.map((r) =>
        r.invoice_key === invoiceKey
          ? {
              ...r,
              billed: fields.billed,
              billed_at: fields.billed_at,
              billed_by: fields.billed_by,
              billed_amount: fields.billed
                ? (fields.billed_amount ?? r.billed_amount ?? null)
                : null,
              billed_lines_hash: fields.billed
                ? (fields.billed_lines_hash ?? r.billed_lines_hash ?? null)
                : null,
              billed_drift: fields.billed ? (fields.billed_drift ?? false) : false,
              billed_drift_delta: fields.billed ? (fields.billed_drift_delta ?? 0) : null,
              persisted_record_id: fields.persisted_record_id ?? r.persisted_record_id ?? null,
            }
          : r
      )
    )
  }, [])

  const updateNotesByInvoiceKey = useCallback<
    InvoicingReceivablesState["updateNotesByInvoiceKey"]
  >((invoiceKey, fields) => {
    if (!invoiceKey) return
    setRecords((prev) =>
      prev.map((r) =>
        r.invoice_key === invoiceKey
          ? {
              ...r,
              notes: fields.notes,
              persisted_record_id: fields.persisted_record_id ?? r.persisted_record_id ?? null,
            }
          : r
      )
    )
  }, [])

  const updateReceivableLineAmount = useCallback<
    InvoicingReceivablesState["updateReceivableLineAmount"]
  >((match, fields) => {
    setRecords((prev) =>
      prev.map((r) => {
        if ((r.mba_number ?? "") !== (match.mba_number ?? "")) return r
        if (r.billing_month !== match.billing_month) return r
        let changed = false
        const line_items = (r.line_items ?? []).map((li) => {
          const idMatch =
            match.schedule_line_item_id && li.schedule_line_item_id === match.schedule_line_item_id
          const feeMatch =
            !match.schedule_line_item_id &&
            match.item_code &&
            li.item_code === match.item_code &&
            (!match.line_type || li.line_type === match.line_type)
          if (!idMatch && !feeMatch) return li
          changed = true
          return {
            ...li,
            amount: fields.amount,
            ...(fields.billing_mode !== undefined ? { billing_mode: fields.billing_mode } : {}),
          }
        })
        if (!changed) return r
        const total = Math.round(line_items.reduce((s, li) => s + li.amount, 0) * 100) / 100
        const drift = detectBilledDrift({
          billed: r.billed === true,
          billedAmount: r.billed_amount,
          billedLinesHash: r.billed_lines_hash,
          currentTotal: total,
          currentLines: toBilledLineSnapshots(line_items),
        })
        return {
          ...r,
          line_items,
          total,
          billed_drift: drift.drift,
          billed_drift_delta: drift.delta,
        }
      })
    )
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)

    const params: Omit<FinanceBillingQuery, "billing_month"> = {}
    if (!localFilters.includeDrafts) params.include_drafts = false
    if (applied.clients.length) params.clients_id = applied.clients.join(",")
    if (localFilters.selectedPublishers.length) {
      params.publishers_id = localFilters.selectedPublishers.join(",")
    }
    if (localFilters.searchQuery.trim()) params.search = localFilters.searchQuery.trim()
    if (localFilters.billingTypes.length) {
      const allowed = new Set<BillingRecord["billing_type"]>(["media", "sow", "retainer"])
      const intersection = localFilters.billingTypes.filter((t) => allowed.has(t))
      if (intersection.length) params.billing_type = intersection.join(",")
    }
    if (localFilters.statuses.length) params.status = localFilters.statuses.join(",")

    const billingMonths = expandMonthRange(applied.monthRange)
    const sigAtStart = filterSig

    void fetchFinanceBillingForMonths(billingMonths, params)
      .then((rows) => {
        if (cancelled) return
        setRecords(rows.filter((r) => isReceivableRecord(r)))
        setLoadedSignature(sigAtStart)
      })
      .catch((e) => {
        if (
          (e instanceof DOMException && e.name === "AbortError") ||
          (e instanceof Error && e.name === "AbortError")
        ) {
          return
        }
        if (!cancelled) {
          // Keep previous rows on error (P0-3).
          setLoadError(e instanceof Error ? e.message : "Failed to load receivables")
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [filterSig, scopeVersion, manualBump, applied, localFilters])

  const monthGroups: MonthGroup[] = useMemo(() => {
    const byMonth = new Map<string, Map<number, ClientGroup>>()
    for (const r of records) {
      if (!byMonth.has(r.billing_month)) byMonth.set(r.billing_month, new Map())
      const clientsMap = byMonth.get(r.billing_month)!
      if (!clientsMap.has(r.clients_id)) {
        clientsMap.set(r.clients_id, {
          clientsId: r.clients_id,
          clientName: r.client_name || "Unknown",
          mediaPlans: [],
          scopeOfWorks: [],
          retainers: [],
          total: 0,
        })
      }
      const cg = clientsMap.get(r.clients_id)!
      if (r.billing_type === "retainer") {
        cg.retainers.push(r)
        cg.total += r.total
        continue
      }
      const bucket = r.billing_type === "sow" ? cg.scopeOfWorks : cg.mediaPlans
      const mbaKey = r.mba_number ?? ""
      let mp = bucket.find((m) => m.mbaNumber === mbaKey)
      if (!mp) {
        mp = {
          mbaNumber: mbaKey,
          campaignName: r.campaign_name || mbaKey || "Campaign",
          records: [],
          total: 0,
          versionId: null,
          versionNumber: null,
        }
        bucket.push(mp)
      }
      mp.records.push(r)
      mp.total += r.total
      if (bucket === cg.mediaPlans) {
        const vid = r.media_plan_version_id
        const vnum = r.media_plan_version_number
        if (mp.versionId == null && vid != null && Number.isFinite(vid)) mp.versionId = vid
        if (mp.versionNumber == null && vnum != null && Number.isFinite(vnum)) {
          mp.versionNumber = vnum
        }
      }
      cg.total += r.total
    }

    const out: MonthGroup[] = []
    for (const [monthIso, clientsMap] of byMonth.entries()) {
      const clients = [...clientsMap.values()].sort((a, b) =>
        a.clientName.localeCompare(b.clientName, undefined, { sensitivity: "base" })
      )
      for (const c of clients) {
        const sortMba = (arr: MediaPlanGroup[]) =>
          arr.sort((a, b) =>
            (a.campaignName || "").localeCompare(b.campaignName || "", undefined, {
              sensitivity: "base",
            })
          )
        sortMba(c.mediaPlans)
        sortMba(c.scopeOfWorks)
        c.retainers.sort(
          (a, b) =>
            (a.invoice_date || "").localeCompare(b.invoice_date || "") || (a.id ?? 0) - (b.id ?? 0)
        )
      }
      const monthDate = new Date(`${monthIso}-01T00:00:00`)
      const monthLabel = monthDate.toLocaleString("en-AU", { month: "long", year: "numeric" })
      const total = clients.reduce((s, c) => s + c.total, 0)
      out.push({ monthIso, monthLabel, clients, total })
    }
    out.sort((a, b) => a.monthIso.localeCompare(b.monthIso))
    return out
  }, [records])

  const visibleMonthGroups = useMemo(
    () => resolveInvoicingVisibleMonthGroups(monthGroups, applied.monthRange, isUpdating),
    [monthGroups, applied.monthRange, isUpdating]
  )

  return {
    loading,
    isUpdating,
    visibleMonthGroups,
    loadError,
    filterSig,
    loadedSignature,
    bumpFetch,
    updateBilledByInvoiceKey,
    updateNotesByInvoiceKey,
    updateReceivableLineAmount,
  }
}
