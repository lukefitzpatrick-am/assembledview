import axios from "axios"
import { parseXanoListPayload, xanoUrl } from "@/lib/api/xano"
import type { PublisherKpi, PublisherKpiInput } from "@/lib/types/publisherKpi"

const apiClient = axios.create({
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
})

export async function fetchPublisherKpis(publisherKey: string): Promise<PublisherKpi[]> {
  try {
    const response = await apiClient.get(xanoUrl("publisher_kpi", "XANO_PUBLISHERS_BASE_URL"), {
      params: { publisher: publisherKey.trim() },
    })
    const data = response.data
    if (Array.isArray(data)) return data as PublisherKpi[]
    return parseXanoListPayload(data) as PublisherKpi[]
  } catch (e) {
    console.error("fetchPublisherKpis", e)
    return []
  }
}

export async function createPublisherKpi(input: PublisherKpiInput): Promise<PublisherKpi | null> {
  try {
    const response = await apiClient.post(
      xanoUrl("publisher_kpi", "XANO_PUBLISHERS_BASE_URL"),
      input,
    )
    return (response.data ?? null) as PublisherKpi | null
  } catch (e) {
    console.error("createPublisherKpi", e)
    return null
  }
}

export async function updatePublisherKpi(
  id: number,
  input: Partial<PublisherKpiInput>,
): Promise<PublisherKpi | null> {
  try {
    const response = await apiClient.patch(
      xanoUrl(`publisher_kpi/${id}`, "XANO_PUBLISHERS_BASE_URL"),
      input,
    )
    return (response.data ?? null) as PublisherKpi | null
  } catch (e) {
    console.error("updatePublisherKpi", e)
    return null
  }
}

export async function deletePublisherKpi(id: number): Promise<boolean> {
  try {
    await apiClient.delete(xanoUrl(`publisher_kpi/${id}`, "XANO_PUBLISHERS_BASE_URL"))
    return true
  } catch (e) {
    console.error("deletePublisherKpi", e)
    return false
  }
}
