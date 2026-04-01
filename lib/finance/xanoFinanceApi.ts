import axios from "axios"
import { parseXanoListPayload, xanoUrl } from "@/lib/api/xano"

export const FINANCE_BILLING_RECORDS_PATH = "finance_billing_records"
export const FINANCE_BILLING_LINE_ITEMS_PATH = "finance_billing_line_items"
export const FINANCE_EDITS_PATH = "finance_edits"
export const FINANCE_EDITS_PUBLISH_PATH = "finance_edits/publish"
export const FINANCE_SAVED_VIEWS_PATH = "finance_saved_views"

export async function xanoFinanceGet(path: string, params?: Record<string, unknown>) {
  const response = await axios.get(xanoUrl(path, "XANO_CLIENTS_BASE_URL"), { params })
  return response.data
}

export async function xanoFinancePost(path: string, body: Record<string, unknown>) {
  const response = await axios.post(xanoUrl(path, "XANO_CLIENTS_BASE_URL"), body)
  return response.data
}

export async function xanoFinancePatch(path: string, body: Record<string, unknown>) {
  const response = await axios.patch(xanoUrl(path, "XANO_CLIENTS_BASE_URL"), body)
  return response.data
}

export async function xanoFinanceDelete(path: string) {
  await axios.delete(xanoUrl(path, "XANO_CLIENTS_BASE_URL"))
}

export function parseList(data: unknown) {
  return parseXanoListPayload(data)
}
