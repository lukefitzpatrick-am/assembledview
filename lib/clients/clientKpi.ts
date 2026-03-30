import axios from "axios"
import { xanoUrl } from "@/lib/api/xano"
import type { ClientKpi, ClientKpiInput } from "@/lib/types/clientKpi"

const apiClient = axios.create({
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
})

export async function fetchClientKpis(clientName: string): Promise<ClientKpi[]> {
  try {
    const response = await apiClient.get(xanoUrl("client_kpi"), {
      params: { mp_client_name: clientName },
    })
    const data = response.data
    return Array.isArray(data) ? data : []
  } catch (e) {
    console.error("fetchClientKpis", e)
    return []
  }
}

export async function createClientKpi(input: ClientKpiInput): Promise<ClientKpi | null> {
  try {
    const response = await apiClient.post(xanoUrl("client_kpi"), input)
    return response.data ?? null
  } catch (e) {
    console.error("createClientKpi", e)
    return null
  }
}

export async function updateClientKpi(
  id: number,
  input: Partial<ClientKpiInput>
): Promise<ClientKpi | null> {
  try {
    const response = await apiClient.patch(xanoUrl(`client_kpi/${id}`), input)
    return response.data ?? null
  } catch (e) {
    console.error("updateClientKpi", e)
    return null
  }
}

export async function deleteClientKpi(id: number): Promise<boolean> {
  try {
    await apiClient.delete(xanoUrl(`client_kpi/${id}`))
    return true
  } catch (e) {
    console.error("deleteClientKpi", e)
    return false
  }
}
