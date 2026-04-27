import axios from "axios"
import { parseXanoListPayload, xanoUrl } from "@/lib/api/xano"
import type { CampaignKPI, CampaignKpiInput } from "./types"

const apiClient = axios.create({
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
})

export async function fetchCampaignKpis(
  mbaNumber: string,
  versionNumber: number,
): Promise<CampaignKPI[]> {
  try {
    const response = await apiClient.get(xanoUrl("campaign_kpi", "XANO_CLIENTS_BASE_URL"), {
      params: {
        mba_number: mbaNumber,
        version_number: versionNumber,
      },
    })
    const data = response.data
    const list: Record<string, unknown>[] = Array.isArray(data)
      ? (data as Record<string, unknown>[])
      : parseXanoListPayload(data)
    const mba = mbaNumber
    return list.filter((row) => {
      const rowMba = String(row.mba_number ?? row.mbaNumber ?? "")
      const ver = Number(row.version_number ?? row.versionNumber ?? NaN)
      return rowMba === mba && ver === versionNumber
    }) as unknown as CampaignKPI[]
  } catch (e) {
    console.error("fetchCampaignKpis", e)
    return []
  }
}

export async function createCampaignKpis(
  inputs: CampaignKpiInput[],
): Promise<CampaignKPI[]> {
  const url = xanoUrl("campaign_kpi", "XANO_CLIENTS_BASE_URL")
  const out: CampaignKPI[] = []
  for (let i = 0; i < inputs.length; i++) {
    const item = inputs[i]!
    try {
      const response = await apiClient.post(url, item)
      out.push((response.data ?? null) as CampaignKPI)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(`createCampaignKpis: row ${i} failed: ${msg}`)
    }
  }
  return out
}

export async function updateCampaignKpi(
  id: number,
  input: Partial<CampaignKpiInput>,
): Promise<CampaignKPI | null> {
  try {
    const response = await apiClient.patch(
      xanoUrl(`campaign_kpi/${id}`, "XANO_CLIENTS_BASE_URL"),
      input,
    )
    return response.data ?? null
  } catch (e) {
    console.error("updateCampaignKpi", e)
    return null
  }
}

export async function deleteCampaignKpi(id: number): Promise<boolean> {
  try {
    await apiClient.delete(xanoUrl(`campaign_kpi/${id}`, "XANO_CLIENTS_BASE_URL"))
    return true
  } catch (e) {
    console.error("deleteCampaignKpi", e)
    return false
  }
}
