import { readClientById } from "@/lib/data/readClients"

/**
 * Full client row by id (includes `client_brain` when served from Xano).
 * Use for hub detail and AVA brain tools — never for list/grid.
 * Honors DATA_BACKEND_CLIENTS / DATA_BACKEND via readClientById.
 */
export async function fetchClientById(
  id: string | number,
): Promise<Record<string, unknown> | null> {
  const rawId = String(id ?? "").trim()
  if (!rawId) return null

  try {
    const result = await readClientById(rawId)
    if (result.status >= 400) {
      console.error("[clients] fetchClientById failed:", {
        id: rawId,
        status: result.status,
      })
      return null
    }
    const data = result.body
    if (!data || typeof data !== "object") return null
    return data as Record<string, unknown>
  } catch (e: unknown) {
    const err = e as { message?: string }
    console.error("[clients] fetchClientById failed:", {
      id: rawId,
      message: err?.message != null ? String(err.message) : String(e),
    })
    return null
  }
}
