"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { BillingRecord } from "@/lib/types/financeBilling"
import { fetchFinanceBillingForMonths, type FinanceBillingQuery } from "@/lib/finance/api"
import { expandMonthRange } from "@/lib/finance/monthRange"
import {
  buildFinanceFetchAllSignature,
  useFinanceStore,
  type FinanceHubTab,
} from "@/lib/finance/useFinanceStore"

const receivablesEffectDepPrev = new Map<string, unknown[]>()

function logReceivablesEffectDepChanges(label: string, names: readonly string[], values: readonly unknown[]) {
  const prev = receivablesEffectDepPrev.get(label)
  receivablesEffectDepPrev.set(label, [...values])
  if (process.env.NEXT_PUBLIC_FINANCE_DEBUG !== "1" || prev === undefined) return
  if (prev.length !== names.length || values.length !== names.length) return
  for (let i = 0; i < names.length; i++) {
    if (!Object.is(prev[i], values[i])) {
      console.info(`[finance-receivables:${label}] dep "${names[i]}" changed`, { from: prev[i], to: values[i] })
    }
  }
}

const RECEIVABLE_BILLING_TYPES = new Set<BillingRecord["billing_type"]>(["media", "sow", "retainer"])

export function isReceivableRecord(r: BillingRecord): boolean {
  return RECEIVABLE_BILLING_TYPES.has(r.billing_type)
}

/** Hub UI: fee / ad serving blocks use billing_type `sow` — show as "Fees", not "SOW". */
export function receivableRecordSectionLabel(billingType: BillingRecord["billing_type"]): string {
  if (billingType === "sow") return "Fees"
  if (billingType === "media") return "Media"
  if (billingType === "retainer") return "Retainer"
  return billingType
}

/** Matches `ReceivablesTab` badge colours (media → blue, sow → violet, retainer → green). */
export function billingTypeBadgeClass(type: BillingRecord["billing_type"]) {
  if (type === "media") return "bg-blue-500/15 text-blue-700 dark:text-blue-300"
  if (type === "sow") return "bg-violet-500/15 text-violet-700 dark:text-violet-300"
  return "bg-green-500/15 text-green-700 dark:text-green-300"
}

export type MediaPlanGroup = {
  mbaNumber: string
  campaignName: string
  records: BillingRecord[]
  total: number
  versionId: number | null
  versionNumber: number | null
}

export type ClientGroup = {
  clientsId: number
  clientName: string
  mediaPlans: MediaPlanGroup[]
  scopeOfWorks: MediaPlanGroup[]
  retainers: BillingRecord[]
  total: number
}

export type MonthGroup = {
  monthIso: string
  monthLabel: string
  clients: ClientGroup[]
  total: number
}

export type HubReceivablesHubState = {
  loading: boolean
  visibleMonthGroups: MonthGroup[]
  filterSig: string
  loadedSignature: string | null
  loadError: string | null
  bumpReceivablesFetch: () => void
  updateBilledByInvoiceKey: (
    invoiceKey: string,
    fields: {
      billed: boolean
      billed_at: number | null
      billed_by: number | null
      persisted_record_id?: number | null
    }
  ) => void
  updateNotesByInvoiceKey: (
    invoiceKey: string,
    fields: {
      notes: string | null
      persisted_record_id?: number | null
    }
  ) => void
}

export function useReceivablesData(activeTab: FinanceHubTab): HubReceivablesHubState {
  const filters = useFinanceStore((s) => s.filters)
  const [records, setRecords] = useState<BillingRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [fetchKey, setFetchKey] = useState(0)
  const [loadedSignature, setLoadedSignature] = useState<string | null>(null)

  const filterSig = useMemo(() => buildFinanceFetchAllSignature(filters), [filters])

  const clientsKey = useMemo(() => filters.selectedClients.join(","), [filters.selectedClients])
  const publishersKey = useMemo(() => filters.selectedPublishers.join(","), [filters.selectedPublishers])
  const billingTypesKey = useMemo(
    () => [...filters.billingTypes].sort().join(","),
    [filters.billingTypes]
  )
  const statusesKey = useMemo(() => [...filters.statuses].sort().join(","), [filters.statuses])

  useEffect(() => {
    if (loadedSignature === null || filterSig === loadedSignature) return
    setRecords([])
    setLoadedSignature(null)
    setFetchKey(0)
    setLoadError(null)
  }, [filterSig, loadedSignature])

  const bumpReceivablesFetch = useCallback(() => {
    setFetchKey((k) => k + 1)
  }, [])

  const updateBilledByInvoiceKey = useCallback<HubReceivablesHubState["updateBilledByInvoiceKey"]>(
    (invoiceKey, fields) => {
      if (!invoiceKey) return
      setRecords((prev) =>
        prev.map((r) =>
          r.invoice_key === invoiceKey
            ? {
                ...r,
                billed: fields.billed,
                billed_at: fields.billed_at,
                billed_by: fields.billed_by,
                persisted_record_id:
                  fields.persisted_record_id ?? r.persisted_record_id ?? null,
              }
            : r
        )
      )
    },
    []
  )

  const updateNotesByInvoiceKey = useCallback<HubReceivablesHubState["updateNotesByInvoiceKey"]>(
    (invoiceKey, fields) => {
      if (!invoiceKey) return
      setRecords((prev) =>
        prev.map((r) =>
          r.invoice_key === invoiceKey
            ? {
                ...r,
                notes: fields.notes,
                persisted_record_id:
                  fields.persisted_record_id ?? r.persisted_record_id ?? null,
              }
            : r
        )
      )
    },
    []
  )

  useEffect(() => {
    logReceivablesEffectDepChanges(
      "billing-fetch",
      [
        "activeTab",
        "fetchKey",
        "monthRange.from",
        "monthRange.to",
        "includeDrafts",
        "clientsKey",
        "publishersKey",
        "searchQuery",
        "billingTypesKey",
        "statusesKey",
      ],
      [
        activeTab,
        fetchKey,
        filters.monthRange.from,
        filters.monthRange.to,
        filters.includeDrafts,
        clientsKey,
        publishersKey,
        filters.searchQuery,
        billingTypesKey,
        statusesKey,
      ]
    )

    if (activeTab !== "billing") {
      setLoading(false)
      return
    }

    if (fetchKey === 0) {
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setLoadError(null)
    const params: Omit<FinanceBillingQuery, "billing_month"> = {}
    if (!filters.includeDrafts) params.include_drafts = false
    if (filters.selectedClients.length) params.clients_id = filters.selectedClients.join(",")
    if (filters.selectedPublishers.length) params.publishers_id = filters.selectedPublishers.join(",")
    if (filters.searchQuery.trim()) params.search = filters.searchQuery.trim()
    if (filters.billingTypes.length) {
      const allowed = new Set<BillingRecord["billing_type"]>(["media", "sow", "retainer"])
      const intersection = filters.billingTypes.filter((t) => allowed.has(t))
      if (intersection.length) params.billing_type = intersection.join(",")
    }
    if (filters.statuses.length) params.status = filters.statuses.join(",")

    const billingMonths = expandMonthRange(filters.monthRange)
    void fetchFinanceBillingForMonths(billingMonths, params)
      .then((rows) => {
        if (cancelled) return
        setRecords(rows.filter((r) => isReceivableRecord(r)))
        setLoadedSignature(filterSig)
      })
      .catch((e) => {
        if (
          (e instanceof DOMException && e.name === "AbortError") ||
          (e instanceof Error && e.name === "AbortError")
        ) {
          return
        }
        if (!cancelled) {
          setRecords([])
          setLoadedSignature(null)
          setFetchKey(0)
          setLoadError(e instanceof Error ? e.message : "Failed to load receivables")
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [
    activeTab,
    fetchKey,
    filterSig,
    filters.billingTypes,
    filters.monthRange,
    filters.selectedClients,
    filters.selectedPublishers,
    filters.statuses,
    filters.monthRange.from,
    filters.monthRange.to,
    filters.includeDrafts,
    clientsKey,
    publishersKey,
    filters.searchQuery,
    billingTypesKey,
    statusesKey,
  ])

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
        if (mp.versionNumber == null && vnum != null && Number.isFinite(vnum)) mp.versionNumber = vnum
      }
      cg.total += r.total
    }

    const out: MonthGroup[] = []
    for (const [monthIso, clientsMap] of byMonth.entries()) {
      const clients = [...clientsMap.values()].sort((a, b) =>
        a.clientName.localeCompare(b.clientName, undefined, { sensitivity: "base" })
      )
      for (const c of clients) {
        const sortMbaGroups = (arr: MediaPlanGroup[]) =>
          arr.sort((a, b) =>
            (a.campaignName || "").localeCompare(b.campaignName || "", undefined, { sensitivity: "base" })
          )
        sortMbaGroups(c.mediaPlans)
        sortMbaGroups(c.scopeOfWorks)
        c.retainers.sort(
          (a, b) =>
            (a.invoice_date || "").localeCompare(b.invoice_date || "") || (a.id ?? 0) - (b.id ?? 0)
        )
      }
      const monthDate = new Date(`${monthIso}-01T00:00:00`)
      const monthLabel = monthDate.toLocaleString("en-AU", {
        month: "long",
        year: "numeric",
      })
      const total = clients.reduce((s, c) => s + c.total, 0)
      out.push({ monthIso, monthLabel, clients, total })
    }
    out.sort((a, b) => a.monthIso.localeCompare(b.monthIso))
    return out
  }, [records])

  const visibleMonthGroups = useMemo(() => {
    const allowed = new Set(expandMonthRange(filters.monthRange))
    return monthGroups.filter((g) => allowed.has(g.monthIso))
  }, [monthGroups, filters.monthRange])

  return {
    loading,
    visibleMonthGroups,
    filterSig,
    loadedSignature,
    loadError,
    bumpReceivablesFetch,
    updateBilledByInvoiceKey,
    updateNotesByInvoiceKey,
  }
}

/** @deprecated Use `useReceivablesData` — kept for hub import compatibility. */
export const useFinanceHubReceivablesData = useReceivablesData
