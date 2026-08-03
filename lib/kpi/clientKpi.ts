import { readClientKpis } from "@/lib/data/readKpi"
import {
  createClientKpiPostgresFirst,
  deleteClientKpiPostgresFirst,
  updateClientKpiPostgresFirst,
} from "@/lib/data/writeKpi"
import type { ClientKpi, ClientKpiInput } from "./types"

/** Route-handler only — static import of server-only `readKpi` (no webpackIgnore). */
export async function fetchClientKpis(clientName: string): Promise<ClientKpi[]> {
  return await readClientKpis(clientName)
}

/** PG-first + Xano mirror (X5 / C-18). */
export async function createClientKpi(
  input: ClientKpiInput,
): Promise<ClientKpi | null> {
  return createClientKpiPostgresFirst(input)
}

export async function updateClientKpi(
  id: number,
  input: Partial<ClientKpiInput>,
): Promise<ClientKpi | null> {
  return updateClientKpiPostgresFirst(id, input)
}

export async function deleteClientKpi(id: number): Promise<boolean> {
  return deleteClientKpiPostgresFirst(id)
}
