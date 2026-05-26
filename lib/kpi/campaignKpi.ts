import axios from "axios"
import { parseXanoListPayload, xanoUrl } from "@/lib/api/xano"
import type { CampaignKPI, CampaignKpiInput } from "./types"

const apiClient = axios.create({
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
})

export async function fetchCampaignKpis(
  mbaNumber: string,
  versionNumber: number,
): Promise<CampaignKPI[]> {
  try {
    const response = await apiClient.get(xanoUrl("campaign_kpi", "XANO_CLIENTS_BASE_URL"), {
      params: {
        mba_number: mbaNumber,
        version_number: versionNumber,
      },
    })
    const data = response.data
    const list: Record<string, unknown>[] = Array.isArray(data)
      ? (data as Record<string, unknown>[])
      : parseXanoListPayload(data)
    const mba = mbaNumber
    return list.filter((row) => {
      const rowMba = String(row.mba_number ?? row.mbaNumber ?? "")
      const ver = Number(row.version_number ?? row.versionNumber ?? NaN)
      return rowMba === mba && ver === versionNumber
    }) as unknown as CampaignKPI[]
  } catch (e) {
    console.error("fetchCampaignKpis", e)
    return []
  }
}

export async function createCampaignKpis(
  inputs: CampaignKpiInput[],
): Promise<CampaignKPI[]> {
  const url = xanoUrl("campaign_kpi", "XANO_CLIENTS_BASE_URL")
  const out: CampaignKPI[] = []
  for (let i = 0; i < inputs.length; i++) {
    const item = inputs[i]!
    try {
      const response = await apiClient.post(url, item)
      out.push((response.data ?? null) as CampaignKPI)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(`createCampaignKpis: row ${i} failed: ${msg}`)
    }
  }
  return out
}

/**
 * Sync campaign_kpi rows by natural key (mba_number, version_number, line_item_id).
 *
 * For each input row:
 * - Fetch existing rows for the (mba_number, version_number) pair.
 * - If a row exists with matching line_item_id, PATCH it.
 * - Otherwise, POST a new row.
 *
 * Sequential per input row. Empty-line_item_id legacy rows in Xano are
 * ignored — they're not matched against input rows and not touched.
 *
 * Returns the resulting rows after sync (PATCHed or newly created).
 */
export async function syncCampaignKpis(
  inputs: CampaignKpiInput[],
): Promise<CampaignKPI[]> {
  if (inputs.length === 0) return []

  const existingByKey = new Map<string, CampaignKPI>()
  const fetchedPairs = new Set<string>()

  const out: CampaignKPI[] = []

  for (let i = 0; i < inputs.length; i++) {
    const item = inputs[i]!
    const lineItemId = String(item.line_item_id ?? "").trim()

    if (!lineItemId) {
      console.warn("[syncCampaignKpis] Skipping row with empty line_item_id", {
        mba_number: item.mba_number,
        version_number: item.version_number,
      })
      continue
    }

    const pairKey = `${item.mba_number}|${item.version_number}`
    if (!fetchedPairs.has(pairKey)) {
      const existing = await fetchCampaignKpis(item.mba_number, item.version_number)
      for (const row of existing) {
        const rowLineItemId = String(row.line_item_id ?? "").trim()
        if (!rowLineItemId) continue
        const key = `${item.mba_number}|${item.version_number}|${rowLineItemId.toLowerCase()}`
        existingByKey.set(key, row)
      }
      fetchedPairs.add(pairKey)
    }

    const naturalKey = `${item.mba_number}|${item.version_number}|${lineItemId.toLowerCase()}`
    const existing = existingByKey.get(naturalKey)

    try {
      if (existing && typeof existing.id === "number") {
        const patched = await updateCampaignKpi(existing.id, item)
        if (patched === null) {
          throw new Error(`updateCampaignKpi returned null for id=${existing.id}`)
        }
        out.push(patched)
        existingByKey.set(naturalKey, patched)
      } else {
        const url = xanoUrl("campaign_kpi", "XANO_CLIENTS_BASE_URL")
        const response = await apiClient.post(url, item)
        const created = (response.data ?? null) as CampaignKPI | null
        if (created === null) {
          throw new Error(`POST returned null for line_item_id=${lineItemId}`)
        }
        out.push(created)
        existingByKey.set(naturalKey, created)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(`syncCampaignKpis: row ${i} (line_item_id=${lineItemId}) failed: ${msg}`)
    }
  }

  return out
}

export async function updateCampaignKpi(
  id: number,
  input: Partial<CampaignKpiInput>,
): Promise<CampaignKPI | null> {
  try {
    const response = await apiClient.patch(
      xanoUrl(`campaign_kpi/${id}`, "XANO_CLIENTS_BASE_URL"),
      input,
    )
    return response.data ?? null
  } catch (e) {
    console.error("updateCampaignKpi", e)
    return null
  }
}

export async function deleteCampaignKpi(id: number): Promise<boolean> {
  try {
    await apiClient.delete(xanoUrl(`campaign_kpi/${id}`, "XANO_CLIENTS_BASE_URL"))
    return true
  } catch (e) {
    console.error("deleteCampaignKpi", e)
    return false
  }
}
