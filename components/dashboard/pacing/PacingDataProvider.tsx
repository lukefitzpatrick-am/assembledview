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

  const allIdsKey = useMemo(() => {
    return [
      `meta:${metaLineItemIds.join(",")}`,
      `tiktok:${tiktokLineItemIds.join(",")}`,
      `pd:${progDisplayLineItemIds.join(",")}`,
      `pv:${progVideoLineItemIds.join(",")}`,
    ].join("|")
  }, [metaLineItemIds, tiktokLineItemIds, progDisplayLineItemIds, progVideoLineItemIds])

  useEffect(() => {
    const anyIds =
      metaLineItemIds.length ||
      tiktokLineItemIds.length ||
      progDisplayLineItemIds.length ||
      progVideoLineItemIds.length

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

      const tasks: Array<Promise<{ channel: string; rows: CombinedPacingRow[] }>> = []

      if (metaLineItemIds.length) {
        tasks.push(
          postJson<{ rows: any[] }>("/api/pacing/social/meta", {
            mbaNumber,
            lineItemIds: metaLineItemIds,
            startDate,
            endDate,
          }).then((data) => ({
            channel: "meta",
            rows: (Array.isArray(data?.rows) ? data.rows : []).map((r) => ({
              channel: "meta",
              dateDay: String(r?.dateDay ?? ""),
              adsetName: r?.adsetName ?? null,
              entityName: r?.adsetName ?? null,
              campaignId: null,
              campaignName: r?.campaignName ?? null,
              adsetId: r?.adsetId ?? null,
              entityId: r?.adsetId ?? null,
              lineItemId: cleanId(r?.lineItemId) ?? null,
              amountSpent: Number(r?.amountSpent ?? 0),
              impressions: Number(r?.impressions ?? 0),
              clicks: Number(r?.clicks ?? 0),
              results: Number(r?.results ?? 0),
              video3sViews: Number(r?.video3sViews ?? 0),
              maxFivetranSyncedAt: r?.maxFivetranSyncedAt ?? null,
              updatedAt: r?.updatedAt ?? null,
            })) as CombinedPacingRow[],
          }))
        )
      }

      if (tiktokLineItemIds.length) {
        tasks.push(
          postJson<{ rows: any[] }>("/api/pacing/social/tiktok", {
            mbaNumber,
            lineItemIds: tiktokLineItemIds,
            startDate,
            endDate,
          }).then((data) => ({
            channel: "tiktok",
            rows: (Array.isArray(data?.rows) ? data.rows : []).map((r) => ({
              channel: "tiktok",
              dateDay: String(r?.dateDay ?? ""),
              adsetName: r?.adsetName ?? null,
              entityName: r?.adsetName ?? null,
              campaignId: null,
              campaignName: r?.campaignName ?? null,
              adsetId: r?.adsetId ?? null,
              entityId: r?.adsetId ?? null,
              lineItemId: cleanId(r?.lineItemId) ?? null,
              amountSpent: Number(r?.amountSpent ?? 0),
              impressions: Number(r?.impressions ?? 0),
              clicks: Number(r?.clicks ?? 0),
              results: Number(r?.results ?? 0),
              video3sViews: Number(r?.video3sViews ?? 0),
              maxFivetranSyncedAt: r?.maxFivetranSyncedAt ?? null,
              updatedAt: r?.updatedAt ?? null,
            })) as CombinedPacingRow[],
          }))
        )
      }

      if (progDisplayLineItemIds.length) {
        tasks.push(
          postJson<{ rows: any[] }>("/api/pacing/programmatic/display", {
            mbaNumber,
            lineItemIds: progDisplayLineItemIds,
            startDate,
            endDate,
          }).then((data) => ({
            channel: "programmatic-display",
            rows: (Array.isArray(data?.rows) ? data.rows : []).map((r) => ({
              channel: "programmatic-display",
              dateDay: String(r?.date ?? ""),
              adsetName: r?.lineItem ?? null,
              entityName: r?.lineItem ?? null,
              campaignId: null,
              campaignName: r?.insertionOrder ?? null,
              adsetId: null,
              entityId: null,
              lineItemId: cleanId(r?.lineItemId ?? r?.matchedPostfix) ?? null,
              amountSpent: Number(r?.spend ?? 0),
              impressions: Number(r?.impressions ?? 0),
              clicks: Number(r?.clicks ?? 0),
              results: Number(r?.conversions ?? 0),
              video3sViews: Number(r?.video3sViews ?? 0),
              maxFivetranSyncedAt: r?.maxFivetranSyncedAt ?? null,
              updatedAt: r?.updatedAt ?? null,
            })) as CombinedPacingRow[],
          }))
        )
      }

      if (progVideoLineItemIds.length) {
        tasks.push(
          postJson<{ rows: any[] }>("/api/pacing/programmatic/video", {
            mbaNumber,
            lineItemIds: progVideoLineItemIds,
            startDate,
            endDate,
          }).then((data) => ({
            channel: "programmatic-video",
            rows: (Array.isArray(data?.rows) ? data.rows : []).map((r) => ({
              channel: "programmatic-video",
              dateDay: String(r?.date ?? ""),
              adsetName: r?.lineItem ?? null,
              entityName: r?.lineItem ?? null,
              campaignId: null,
              campaignName: r?.insertionOrder ?? null,
              adsetId: null,
              entityId: null,
              lineItemId: cleanId(r?.lineItemId ?? r?.matchedPostfix) ?? null,
              amountSpent: Number(r?.spend ?? 0),
              impressions: Number(r?.impressions ?? 0),
              clicks: Number(r?.clicks ?? 0),
              results: Number(r?.conversions ?? 0),
              video3sViews: Number(r?.video3sViews ?? 0),
              maxFivetranSyncedAt: r?.maxFivetranSyncedAt ?? null,
              updatedAt: r?.updatedAt ?? null,
            })) as CombinedPacingRow[],
          }))
        )
      }

      const settled = await Promise.allSettled(tasks)

      const merged: CombinedPacingRow[] = []
      const errors: string[] = []

      settled.forEach((result) => {
        if (result.status === "fulfilled") {
          merged.push(...result.value.rows)
        } else {
          errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason))
        }
      })

      // De-dupe and stable sort
      const deduped = uniq(
        merged.map((r) =>
          [
            r.channel,
            r.dateDay,
            r.lineItemId ?? "",
            r.adsetId ?? "",
            r.campaignName ?? "",
            r.adsetName ?? "",
          ].join("|")
        )
      )

      const lookup = new Map<string, CombinedPacingRow>()
      merged.forEach((r) => {
        const key = [
          r.channel,
          r.dateDay,
          r.lineItemId ?? "",
          r.adsetId ?? "",
          r.campaignName ?? "",
          r.adsetName ?? "",
        ].join("|")
        lookup.set(key, r)
      })

      const finalRows = deduped
        .map((k) => lookup.get(k))
        .filter(Boolean) as CombinedPacingRow[]

      finalRows.sort((a, b) => {
        const d = String(a.dateDay ?? "").localeCompare(String(b.dateDay ?? ""))
        if (d !== 0) return d
        return String(a.channel ?? "").localeCompare(String(b.channel ?? ""))
      })

      setRows(finalRows)
      setError(errors.length ? errors.join(" | ") : null)
      setLoading(false)
    }

    fetchAll().catch((err) => {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(errorMessage)
      setRows([])
      setLoading(false)
    })
  }, [mbaNumber, allIdsKey, campaignStart, campaignEnd])

  return <>{children({ rows, loading, error })}</>
}
