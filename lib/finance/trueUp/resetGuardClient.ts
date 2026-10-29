/**
 * Editors' full billing reset guard (C-157): fetch the MBA's applied true-up
 * schedule fixes. A failed fetch returns null; the save route still blocks.
 */
import type { TrueUpLock } from "./resetGuard"

export async function fetchTrueUpLocks(mbaNumber: string | null | undefined): Promise<TrueUpLock[] | null> {
  const mba = String(mbaNumber ?? "").trim()
  if (!mba) return []
  try {
    const res = await fetch(`/api/mediaplans/mba/${encodeURIComponent(mba)}/true-up-locks`, { cache: "no-store" })
    if (!res.ok) return null
    const body = (await res.json()) as { locks?: TrueUpLock[] }
    return Array.isArray(body.locks) ? body.locks : []
  } catch {
    return null
  }
}
