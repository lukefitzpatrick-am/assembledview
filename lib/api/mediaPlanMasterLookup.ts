import axios from "axios"
import { parseXanoListPayload, xanoUrl } from "@/lib/api/xano"

function rowsFromMasterResponse(data: unknown): any[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === "object" && (data as { mba_number?: unknown }).mba_number != null) {
    return [data]
  }
  return parseXanoListPayload(data)
}

/**
 * Returns an existing media_plan_master row for this MBA number, or null.
 * Used before creating a new master to avoid duplicate mba_number rows.
 */
export async function findExistingMasterByMbaNumber(
  mbaNumber: string
): Promise<{ id: number } | null> {
  const trimmed = mbaNumber.trim()
  if (!trimmed) return null
  const norm = trimmed.toLowerCase()
  const base = xanoUrl("media_plan_master", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])
  const url = `${base}?mba_number=${encodeURIComponent(trimmed)}`
  const res = await axios.get(url)
  const rows = rowsFromMasterResponse(res.data)
  const match = rows.find(
    (item: { mba_number?: unknown; id?: unknown }) =>
      String(item?.mba_number ?? "")
        .trim()
        .toLowerCase() === norm
  )
  if (match?.id == null || Number.isNaN(Number(match.id))) return null
  return { id: Number(match.id) }
}
