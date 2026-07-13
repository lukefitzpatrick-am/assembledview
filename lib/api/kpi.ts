import type { CampaignKPI, ClientKPI, PublisherKPI } from "@/lib/kpi/types"
import { coalescedGetJson } from "@/lib/api/coalescedGetJson"

async function jsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const details = await response.text()
    let message = details
    try {
      const parsed = JSON.parse(details) as { error?: string }
      if (typeof parsed?.error === "string" && parsed.error.trim()) {
        message = parsed.error
      }
    } catch {
      // keep raw text
    }
    throw new Error(message || `Request failed with status ${response.status}`)
  }
  return (await response.json()) as T
}

export async function getPublisherKPIs(): Promise<PublisherKPI[]> {
  const data = await coalescedGetJson<PublisherKPI[]>("/api/kpis/publisher")
  return Array.isArray(data) ? data : []
}

export async function getClientKPIs(clientName: string): Promise<ClientKPI[]> {
  const params = new URLSearchParams()
  params.set("mp_client_name", clientName)
  const data = await coalescedGetJson<ClientKPI[]>(
    `/api/kpis/client?${params.toString()}`
  )
  return Array.isArray(data) ? data : []
}

export async function getCampaignKPIs(
  mbaNumber: string,
  versionNumber: number,
): Promise<CampaignKPI[]> {
  const params = new URLSearchParams()
  params.set("mbaNumber", mbaNumber)
  params.set("versionNumber", String(versionNumber))
  const data = await coalescedGetJson<CampaignKPI[]>(
    `/api/kpis/campaign?${params.toString()}`
  )
  return Array.isArray(data) ? data : []
}

export async function saveCampaignKPIs(kpis: CampaignKPI[]): Promise<CampaignKPI[]> {
  const response = await fetch("/api/kpis/campaign", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(kpis),
  })
  const data = await jsonOrThrow<CampaignKPI[]>(response)
  return Array.isArray(data) ? data : []
}

export async function syncCampaignKPIs(kpis: CampaignKPI[]): Promise<CampaignKPI[]> {
  const response = await fetch("/api/kpis/campaign/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(kpis),
  })
  const data = await jsonOrThrow<CampaignKPI[]>(response)
  return Array.isArray(data) ? data : []
}
