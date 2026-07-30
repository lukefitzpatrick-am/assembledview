import axios from "axios"
import { xanoPostHeaderRecord, xanoUrl } from "@/lib/api/xano"
import type { PublisherKpi, PublisherKpiInput } from "./types"

const apiClient = axios.create({
  timeout: 10000,
  headers: xanoPostHeaderRecord(),
})

/** Unfiltered list — used when loading KPIs for the full media plan. */
export async function fetchAllPublisherKpis(): Promise<PublisherKpi[]> {
  try {
    const { readAllPublisherKpis } = await import(
      /* webpackIgnore: true */ "@/lib/data/readKpi"
    )
    return await readAllPublisherKpis()
  } catch (e) {
    console.error("fetchAllPublisherKpis", e)
    return []
  }
}

export async function fetchPublisherKpis(
  publisherKey: string,
): Promise<PublisherKpi[]> {
  try {
    const { readPublisherKpis } = await import(
      /* webpackIgnore: true */ "@/lib/data/readKpi"
    )
    return await readPublisherKpis(publisherKey)
  } catch (e) {
    console.error("fetchPublisherKpis", e)
    return []
  }
}

export async function createPublisherKpi(
  input: PublisherKpiInput,
): Promise<PublisherKpi | null> {
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
    await apiClient.delete(
      xanoUrl(`publisher_kpi/${id}`, "XANO_PUBLISHERS_BASE_URL"),
    )
    return true
  } catch (e) {
    console.error("deletePublisherKpi", e)
    return false
  }
}
