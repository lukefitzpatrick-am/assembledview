import type { CampaignKPI, ClientKPI, PublisherKPI } from "@/lib/kpi/types"

async function jsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const details = await response.text()
    throw new Error(details || `Request failed with status ${response.status}`)
  }
  return (await response.json()) as T
}

export async function getPublisherKPIs(): Promise<PublisherKPI[]> {
  const response = await fetch("/api/kpis/publisher", {
    headers: { Accept: "application/json" },
  })
  const data = await jsonOrThrow<PublisherKPI[]>(response)
  return Array.isArray(data) ? data : []
}

export async function getClientKPIs(clientName: string): Promise<ClientKPI[]> {
  const params = new URLSearchParams()
  params.set("mp_client_name", clientName)
  const response = await fetch(`/api/kpis/client?${params.toString()}`, {
    headers: { Accept: "application/json" },
  })
  const data = await jsonOrThrow<ClientKPI[]>(response)
  return Array.isArray(data) ? data : []
}

export async function getCampaignKPIs(
  mbaNumber: string,
  versionNumber: number,
): Promise<CampaignKPI[]> {
  const params = new URLSearchParams()
  params.set("mbaNumber", mbaNumber)
  params.set("versionNumber", String(versionNumber))
  const response = await fetch(`/api/kpis/campaign?${params.toString()}`, {
    headers: { Accept: "application/json" },
  })
  const data = await jsonOrThrow<CampaignKPI[]>(response)
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
