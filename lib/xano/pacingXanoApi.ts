import axios from "axios"
import { parseXanoListPayload, xanoUrl } from "@/lib/api/xano"

export const PACING_MAPPINGS_PATH = "pacing_mappings"
export const PACING_THRESHOLDS_PATH = "pacing_thresholds"
export const PACING_SAVED_VIEWS_PATH = "pacing_saved_views"
export const PACING_ALERT_SUBS_PATH = "pacing_alert_subscriptions"
export const PACING_ALERT_LOG_PATH = "pacing_alert_log"

export async function xanoPacingGet(path: string, params?: Record<string, unknown>) {
  const response = await axios.get(xanoUrl(path, "XANO_CLIENTS_BASE_URL"), { params })
  return response.data
}

export async function xanoPacingPost(path: string, body: Record<string, unknown>) {
  const response = await axios.post(xanoUrl(path, "XANO_CLIENTS_BASE_URL"), body)
  return response.data
}

export async function xanoPacingPatch(path: string, body: Record<string, unknown>) {
  const response = await axios.patch(xanoUrl(path, "XANO_CLIENTS_BASE_URL"), body)
  return response.data
}

export async function xanoPacingDelete(path: string) {
  await axios.delete(xanoUrl(path, "XANO_CLIENTS_BASE_URL"))
}

/** Single `pacing_mappings` row by id (unwraps `{ data: row }` when present). */
export async function xanoPacingGetMappingById(id: number): Promise<unknown> {
  const raw = await xanoPacingGet(`${PACING_MAPPINGS_PATH}/${id}`)
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>
    if (o.data && typeof o.data === "object") return o.data
  }
  return raw
}

export function parsePacingList(data: unknown) {
  return parseXanoListPayload(data)
}
