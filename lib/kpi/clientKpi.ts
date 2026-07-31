import axios from "axios"
import { readClientKpis } from "@/lib/data/readKpi"
import { xanoPostHeaderRecord, xanoUrl } from "@/lib/api/xano"
import type { ClientKpi, ClientKpiInput } from "./types"

const apiClient = axios.create({
  timeout: 10000,
  headers: xanoPostHeaderRecord(),
})

/** Route-handler only — static import of server-only `readKpi` (no webpackIgnore). */
export async function fetchClientKpis(clientName: string): Promise<ClientKpi[]> {
  return await readClientKpis(clientName)
}

export async function createClientKpi(
  input: ClientKpiInput,
): Promise<ClientKpi | null> {
  try {
    const response = await apiClient.post(
      xanoUrl("client_kpi", "XANO_CLIENTS_BASE_URL"),
      input,
    )
    return response.data ?? null
  } catch (e) {
    console.error("createClientKpi", e)
    return null
  }
}

export async function updateClientKpi(
  id: number,
  input: Partial<ClientKpiInput>,
): Promise<ClientKpi | null> {
  try {
    const response = await apiClient.patch(
      xanoUrl(`client_kpi/${id}`, "XANO_CLIENTS_BASE_URL"),
      input,
    )
    return response.data ?? null
  } catch (e) {
    console.error("updateClientKpi", e)
    return null
  }
}

export async function deleteClientKpi(id: number): Promise<boolean> {
  try {
    await apiClient.delete(xanoUrl(`client_kpi/${id}`, "XANO_CLIENTS_BASE_URL"))
    return true
  } catch (e) {
    console.error("deleteClientKpi", e)
    return false
  }
}
