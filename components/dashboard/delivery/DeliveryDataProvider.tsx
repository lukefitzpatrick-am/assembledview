"use client"

import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import type { PacingRow as CombinedPacingRow } from "@/lib/snowflake/pacing-service"
import type { SearchPacingResponse } from "@/lib/snowflake/search-pacing-service"

type DeliveryDataProviderProps = {
  mbaNumber: string
  metaLineItemIds: string[]
  tiktokLineItemIds: string[]
  progDisplayLineItemIds: string[]
  progVideoLineItemIds: string[]
  campaignStart?: string
  campaignEnd?: string
  fromDate?: string
  toDate?: string
  searchEnabled?: boolean
  searchLineItemIds?: string[]
  children: (props: {
    rows: CombinedPacingRow[]
    search: SearchPacingResponse | null
    loading: boolean
    error: string | null
  }) => ReactNode
}

function parseDateSafe(value?: string | null): Date | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function normalizeISODateOnly(value?: string | null): string | null {
  if (!value) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const parsed = parseDateSafe(trimmed)
  return parsed ? parsed.toISOString().slice(0, 10) : null
}

function cleanId(v: unknown): string | null {
  const s = String(v ?? "").trim().toLowerCase()
  if (!s || s === "undefined" || s === "null") return null
  return s
}

function uniq(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean))).sort()
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Request failed")
    throw new Error(`Pacing request failed (${response.status}): ${errorText.slice(0, 200)}`)
  }

  const contentType = response.headers.get("content-type") || ""
  if (!contentType.includes("application/json")) {
    const text = await response.text()
    throw new Error(`Expected JSON but got ${contentType}. Response: ${text.slice(0, 200)}`)
  }

  return response.json() as Promise<T>
}

export default function DeliveryDataProvider({
  mbaNumber,
  metaLineItemIds,
  tiktokLineItemIds,
  progDisplayLineItemIds,
  progVideoLineItemIds,
  campaignStart,
  campaignEnd,
  fromDate,
  toDate,
  searchEnabled,
  searchLineItemIds,
  children,
}: DeliveryDataProviderProps) {
  const [rows, setRows] = useState<CombinedPacingRow[]>([])
  const [search, setSearch] = useState<SearchPacingResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allLineItemIds = useMemo(() => {
    return uniq(
      [
        ...(metaLineItemIds ?? []),
        ...(tiktokLineItemIds ?? []),
        ...(progDisplayLineItemIds ?? []),
        ...(progVideoLineItemIds ?? []),
      ]
        .map((id) => cleanId(id))
        .filter(Boolean) as string[]
    )
  }, [metaLineItemIds, tiktokLineItemIds, progDisplayLineItemIds, progVideoLineItemIds])

  const allIdsKey = useMemo(() => {
    return [
      `meta:${metaLineItemIds.join(",")}`,
      `tiktok:${tiktokLineItemIds.join(",")}`,
      `pd:${progDisplayLineItemIds.join(",")}`,
      `pv:${progVideoLineItemIds.join(",")}`,
    ].join("|")
  }, [metaLineItemIds, tiktokLineItemIds, progDisplayLineItemIds, progVideoLineItemIds])

  const normalizedSearchLineItemIds = useMemo(() => {
    const ids = (searchLineItemIds ?? [])
      .map((id) => cleanId(id))
      .filter(Boolean) as string[]
    return uniq(ids)
  }, [searchLineItemIds])

  const includeSearch = useMemo(() => {
    return searchEnabled === true && normalizedSearchLineItemIds.length > 0
  }, [searchEnabled, normalizedSearchLineItemIds.length])

  const normalizedBulkStart = useMemo(
    () => normalizeISODateOnly(fromDate ?? campaignStart) ?? "",
    [fromDate, campaignStart]
  )
  const normalizedBulkEnd = useMemo(
    () => normalizeISODateOnly(toDate ?? campaignEnd) ?? "",
    [toDate, campaignEnd]
  )

  const searchKey = useMemo(() => {
    return [
      includeSearch ? "1" : "0",
      `ids:${normalizedSearchLineItemIds.join(",")}`,
      `start:${normalizedBulkStart}`,
      `end:${normalizedBulkEnd}`,
    ].join("|")
  }, [includeSearch, normalizedSearchLineItemIds, normalizedBulkStart, normalizedBulkEnd])

  useEffect(() => {
    const anyBulkIds = allLineItemIds.length > 0
    const anySearch = includeSearch

    if (!anyBulkIds && !anySearch) {
      setRows([])
      setSearch(null)
      setLoading(false)
      setError(null)
      return
    }

    const startDate = normalizedBulkStart || undefined
    const endDate = normalizedBulkEnd || undefined

    const fetchAll = async () => {
      setLoading(true)
      setError(null)

      try {
        const data = await postJson<{
          ok: boolean
          rows?: CombinedPacingRow[]
          search?: SearchPacingResponse | null
          error?: string
        }>(
          "/api/pacing/bulk",
          {
            mbaNumber,
            lineItemIds: allLineItemIds,
            startDate,
            endDate,
            includeSearch,
            searchLineItemIds: normalizedSearchLineItemIds,
            searchStartDate: startDate,
            searchEndDate: endDate,
          }
        )

        const nextRows = Array.isArray((data as any)?.rows) ? ((data as any).rows as CombinedPacingRow[]) : []
        setRows(nextRows)
        setSearch(includeSearch ? ((data as any)?.search ?? null) : null)
        setError(data && (data as any).error ? String((data as any).error) : null)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        setError(errorMessage)
        setRows([])
        setSearch(null)
      } finally {
        setLoading(false)
      }
    }

    fetchAll().catch((err) => {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(errorMessage)
      setRows([])
      setLoading(false)
    })
  }, [
    mbaNumber,
    allIdsKey,
    searchKey,
    campaignStart,
    campaignEnd,
    fromDate,
    toDate,
    allLineItemIds,
    includeSearch,
    normalizedSearchLineItemIds,
    normalizedBulkStart,
    normalizedBulkEnd,
  ])

  return <>{children({ rows, search, loading, error })}</>
}
