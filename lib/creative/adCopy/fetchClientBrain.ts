import "server-only"

import { fetchClientById } from "@/lib/clients/fetchClientById"
import { getClientDisplayName, slugifyClientNameForUrl } from "@/lib/clients/slug"
import { getCachedClients } from "@/lib/finance/xanoReferenceCache"

/**
 * Load `client_brain` for ad-copy grounding (detail path only).
 * Returns null when missing / empty.
 */
export async function fetchClientBrainForAdCopy(
  clientName?: string | null,
): Promise<string | null> {
  const want = (clientName ?? "").trim()
  if (!want) return null

  try {
    let row: Record<string, unknown> | null = null
    if (/^\d+$/.test(want)) {
      row = await fetchClientById(want)
    } else {
      const clients = await getCachedClients()
      const wantSlug = slugifyClientNameForUrl(want)
      const wantLower = want.toLowerCase()
      const match = clients.find((r) => {
        const name = getClientDisplayName(r)
        if (name.toLowerCase() === wantLower) return true
        return slugifyClientNameForUrl(name) === wantSlug
      })
      if (match?.id != null) {
        row = await fetchClientById(match.id as string | number)
      }
    }
    const brain =
      typeof row?.client_brain === "string" ? row.client_brain.trim() : ""
    return brain || null
  } catch (err) {
    console.warn(
      "[ad-copy] fetchClientBrainForAdCopy failed:",
      err instanceof Error ? err.message : err,
    )
    return null
  }
}
