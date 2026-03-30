import axios from "axios"
import { xanoUrl } from "@/lib/api/xano"
import type { Publisher } from "@/lib/types/publisher"

const apiClient = axios.create({
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
})

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

