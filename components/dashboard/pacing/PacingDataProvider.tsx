"use client"

import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import type { PacingRow as CombinedPacingRow } from "@/lib/snowflake/pacing-service"

type PacingDataProviderProps = {
  mbaNumber: string
  metaLineItemIds: string[]
  tiktokLineItemIds: string[]
  progDisplayLineItemIds: string[]
  progVideoLineItemIds: string[]
  campaignStart?: string
  campaignEnd?: string
  children: (props: { rows: CombinedPacingRow[]; loading: boolean; error: string | null }) => ReactNode
}

/**
 * Get yesterday's date in Australia/Melbourne timezone as ISO string "YYYY-MM-DD"
 */
function getMelbourneYesterdayISO(): string {
  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  const parts = formatter.formatToParts(yesterday)
  const year = parts.find((p) => p.type === "year")?.value ?? ""
  const month = parts.find((p) => p.type === "month")?.value ?? ""
  const day = parts.find((p) => p.type === "day")?.value ?? ""
  return `${year}-${month}-${day}`
}

/**
 * Get today's date in Australia/Melbourne timezone as ISO string "YYYY-MM-DD"
 */
function getMelbourneTodayISO(): string {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  const parts = formatter.formatToParts(now)
  const year = parts.find((p) => p.type === "year")?.value ?? ""
  const month = parts.find((p) => p.type === "month")?.value ?? ""
  const day = parts.find((p) => p.type === "day")?.value ?? ""
  return `${year}-${month}-${day}`
}

function parseDateSafe(value?: string | null): Date | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d
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

export default function PacingDataProvider({
  mbaNumber,
  metaLineItemIds,
  tiktokLineItemIds,
  progDisplayLineItemIds,
  progVideoLineItemIds,
  campaignStart,
  campaignEnd,
  children,
}: PacingDataProviderProps) {
  const [rows, setRows] = useState<CombinedPacingRow[]>([])
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

  useEffect(() => {
    const anyIds = allLineItemIds.length

    if (!anyIds) {
      setRows([])
      setLoading(false)
      setError(null)
      return
    }

    // Compute date range once for all platform requests.
    const melbourneTodayISO = getMelbourneTodayISO()
    const melbourneYesterdayISO = getMelbourneYesterdayISO()

    let campaignEndDateISO: string | null = null
    if (campaignEnd) {
      const parsed = parseDateSafe(campaignEnd)
      if (parsed) campaignEndDateISO = parsed.toISOString().slice(0, 10)
    }

    const endDate =
      campaignEndDateISO && campaignEndDateISO < melbourneTodayISO ? campaignEndDateISO : melbourneYesterdayISO

    const startDate = campaignStart || undefined

    const fetchAll = async () => {
      setLoading(true)
      setError(null)

      try {
        const data = await postJson<{ ok: boolean; rows: CombinedPacingRow[]; error?: string }>(
          "/api/pacing/bulk",
          {
            mbaNumber,
            lineItemIds: allLineItemIds,
            startDate,
            endDate,
          }
        )

        const nextRows = Array.isArray(data?.rows) ? data.rows : []
        setRows(nextRows)
        setError(data && (data as any).error ? String((data as any).error) : null)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        setError(errorMessage)
        setRows([])
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
  }, [mbaNumber, allIdsKey, campaignStart, campaignEnd, allLineItemIds])

  return <>{children({ rows, loading, error })}</>
}
