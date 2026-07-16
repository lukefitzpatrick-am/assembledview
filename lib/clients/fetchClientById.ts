import axios from "axios"
import { getXanoClientsCollectionUrl } from "@/lib/api/xanoClients"
import { xanoAuthHeaderRecord } from "@/lib/api/xano"

const apiClient = axios.create({
  timeout: Number(process.env.XANO_TIMEOUT_MS ?? 10000),
  headers: {
    "Content-Type": "application/json",
    ...xanoAuthHeaderRecord(),
  },
})

/**
 * Full Xano client row by id (includes `client_brain`).
 * Use for hub detail and AVA brain tools — never for list/grid.
 */
export async function fetchClientById(
  id: string | number,
): Promise<Record<string, unknown> | null> {
  const rawId = String(id ?? "").trim()
  if (!rawId) return null

  const url = `${getXanoClientsCollectionUrl()}/${encodeURIComponent(rawId)}`
  try {
    const response = await apiClient.get(url)
    const data = response.data
    if (!data || typeof data !== "object") return null
    return data as Record<string, unknown>
  } catch (e: unknown) {
    const err = e as { message?: string; response?: { status?: number } }
    console.error("[clients] fetchClientById failed:", {
      id: rawId,
      message: err?.message != null ? String(err.message) : String(e),
      status: err?.response?.status,
    })
    return null
  }
}
