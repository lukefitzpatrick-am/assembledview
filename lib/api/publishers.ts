import axios, { isAxiosError } from "axios"
import { parseXanoListPayload, xanoUrl } from "@/lib/api/xano"
import type { Publisher, PublisherMediaTypeShare } from "@/lib/types/publisher"

/** Same resolution as `getXanoClientsCollectionUrl`: Clients API group, then generic base. */
const MARKET_SHARE_BASE_ENV_KEYS = ["XANO_CLIENTS_BASE_URL", "XANO_BASE_URL"] as const

function marketSharePathCandidates(publishersId: number): string[] {
  return [
    `publisher/${publishersId}/market-share`,
    `publishers/${publishersId}/market-share`,
  ]
}

const apiClient = axios.create({
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
})

function finiteNumberFromUnknown(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const n = parseFloat(value.replace(/[^0-9.-]/g, ""))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function normalizeMarketShareRow(raw: unknown): PublisherMediaTypeShare | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const mediaType =
    typeof r.mediaType === "string"
      ? r.mediaType
      : typeof r.media_type === "string"
        ? r.media_type
        : null
  if (!mediaType) return null
  const thisPublisherSpend = finiteNumberFromUnknown(
    r.thisPublisherSpend ?? r.this_publisher_spend,
  )
  const totalMarketSpend = finiteNumberFromUnknown(r.totalMarketSpend ?? r.total_market_spend)
  const sharePercent = finiteNumberFromUnknown(r.sharePercent ?? r.share_percent)
  if (thisPublisherSpend == null || totalMarketSpend == null || sharePercent == null) return null
  return { mediaType, thisPublisherSpend, totalMarketSpend, sharePercent }
}

/**
 * Clients API: FY market share by media type for a publisher (Xano PK `publishers.id`).
 * Returns [] on error or empty response.
 */
export async function getPublisherMarketShare(publishersId: number): Promise<PublisherMediaTypeShare[]> {
  if (!Number.isFinite(publishersId) || publishersId <= 0) return []

  for (const path of marketSharePathCandidates(publishersId)) {
    try {
      const url = xanoUrl(path, [...MARKET_SHARE_BASE_ENV_KEYS])
      const response = await apiClient.get(url)
      const list = parseXanoListPayload(response.data)
      const out: PublisherMediaTypeShare[] = []
      for (const row of list) {
        const normalized = normalizeMarketShareRow(row)
        if (normalized) out.push(normalized)
      }
      return out
    } catch (e) {
      if (isAxiosError(e) && e.response?.status === 404) continue
      if (!isAxiosError(e) || e.response?.status !== 404) {
        console.warn("[getPublisherMarketShare] request failed", {
          path,
          status: isAxiosError(e) ? e.response?.status : undefined,
          message: e instanceof Error ? e.message : String(e),
        })
      }
      return []
    }
  }

  return []
}

export async function fetchPublishersFromXano(): Promise<Publisher[]> {
  const response = await apiClient.get(xanoUrl("get_publishers", "XANO_PUBLISHERS_BASE_URL"))
  const data = response.data
  return Array.isArray(data) ? data : []
}

function publisherIdFromUrlSegment(segment: string): string {
  const trimmed = segment.trim()
  if (!trimmed) return ""
  try {
    return decodeURIComponent(trimmed).trim()
  } catch {
    return trimmed
  }
}

/** Resolve by Xano business key `publisherid` (URL segment may be encoded). */
export async function getPublisherByPublisherId(segment: string): Promise<Publisher | null> {
  const key = publisherIdFromUrlSegment(segment)
  if (!key) return null
  const list = await fetchPublishersFromXano()
  const found = list.find((p) => String(p.publisherid ?? "").trim() === key)
  return found ?? null
}

