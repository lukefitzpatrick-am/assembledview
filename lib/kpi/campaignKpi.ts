import { readCampaignKpis } from "@/lib/data/readKpi"
import {
  createCampaignKpisPostgresFirst,
  deleteCampaignKpiPostgresFirst,
  syncCampaignKpisPostgresFirst,
  updateCampaignKpiPostgresFirst,
} from "@/lib/data/writeKpi"
import type { CampaignKPI, CampaignKpiInput } from "./types"

export async function fetchCampaignKpis(
  mbaNumber: string,
  versionNumber: number,
): Promise<CampaignKPI[]> {
  return await readCampaignKpis(mbaNumber, versionNumber)
}

/** PG-first + Xano mirror (X5 / C-18). */
export async function createCampaignKpis(
  inputs: CampaignKpiInput[],
): Promise<CampaignKPI[]> {
  return createCampaignKpisPostgresFirst(inputs)
}

/**
 * Sync campaign_kpi rows by natural key (mba_number, version_number, line_item_id).
 * PG-authoritative read + write; Xano mirror per mutate.
 */
export async function syncCampaignKpis(
  inputs: CampaignKpiInput[],
): Promise<CampaignKPI[]> {
  return syncCampaignKpisPostgresFirst(inputs)
}

export async function updateCampaignKpi(
  id: number,
  input: Partial<CampaignKpiInput>,
): Promise<CampaignKPI | null> {
  return updateCampaignKpiPostgresFirst(id, input)
}

export async function deleteCampaignKpi(id: number): Promise<boolean> {
  return deleteCampaignKpiPostgresFirst(id)
}
