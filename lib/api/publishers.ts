import axios from "axios"
import { xanoPostHeaderRecord, xanoUrl } from "@/lib/api/xano"
import type { Publisher, PublisherMediaTypeShare } from "@/lib/types/publisher"

const apiClient = axios.create({
  timeout: 10000,
  headers: xanoPostHeaderRecord(),
})

/**
 * FY market share by media type for a publisher (`publishers.id`).
 * Published commercial plan lines in the current Australian FY. Empty when
 * that publisher has no FY lines.
 */
export async function getPublisherMarketShare(publishersId: number): Promise<PublisherMediaTypeShare[]> {
  if (!Number.isFinite(publishersId) || publishersId <= 0) return []
  const { fetchPublisherMarketShareFromPostgres } = await import("@/lib/publishers/marketShare")
  return fetchPublisherMarketShareFromPostgres(publishersId)
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

/** Resolve by business key `publisherid` (URL segment may be encoded). Postgres via `readPublishersList`. */
export async function getPublisherByPublisherId(segment: string): Promise<Publisher | null> {
  const key = publisherIdFromUrlSegment(segment)
  if (!key) return null
  const { readPublishersList } = await import("@/lib/data/readPublishers")
  const result = await readPublishersList()
  if (result.status >= 400 || !Array.isArray(result.body)) return null
  const found = (result.body as Publisher[]).find(
    (p) => String(p.publisherid ?? "").trim() === key
  )
  return found ?? null
}

