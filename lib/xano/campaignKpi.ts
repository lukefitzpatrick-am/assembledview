import "server-only";

import axios from "axios";
import { fetchAllXanoPages } from "@/lib/api/xanoPagination";
import { parseXanoListPayload, xanoUrl } from "@/lib/api/xano";

/**
 * Raw shape of a campaign_kpi row from Xano. Mirrors the table schema.
 *
 * Fields are nullable on the wire even when defined as numbers in the type —
 * defensive against Xano returning nulls for unset targets.
 */
export type CampaignKpiRow = {
  id: number;
  created_at: number;
  mp_client_name: string;
  mba_number: string;
  version_number: number;
  campaign_name: string;
  media_type: string;
  publisher: string;
  bid_strategy: string;
  ctr: number | null;
  cpv: number | null;
  conversion_rate: number | null;
  vtr: number | null;
  frequency: number | null;
  line_item_id: string;
};

export type FetchCampaignKpiArgs = {
  mbaNumbers: string[];
};

const headers: Record<string, string> = {
  "Content-Type": "application/json",
  Accept: "application/json",
  ...(process.env.XANO_API_KEY ? { Authorization: `Bearer ${process.env.XANO_API_KEY}` } : {}),
};

let mbaFilterSupported: boolean | null = null;

/**
 * Fetches campaign_kpi rows for the supplied MBA numbers from the
 * Clients Xano group. Returns one row per (mba_number, version_number,
 * line_item_id, media_type) per the table's grain.
 *
 * Fans out one fetch per MBA. The Xano endpoint should filter by
 * mba_number; if it doesn't, fall back to a single full-list fetch
 * and filter in TS (returns the same shape; slower at scale).
 */
export async function fetchCampaignKpisForMbas(
  args: FetchCampaignKpiArgs
): Promise<CampaignKpiRow[]> {
  if (args.mbaNumbers.length === 0) return [];

  const uniqueMbas = Array.from(new Set(args.mbaNumbers));

  if (mbaFilterSupported === false) {
    return fetchAllCampaignKpisAndFilter(uniqueMbas);
  }

  const results: CampaignKpiRow[] = [];
  const url = xanoUrl("campaign_kpi", "XANO_CLIENTS_BASE_URL");

  for (const mba of uniqueMbas) {
    try {
      const response = await axios.get(url, {
        params: { mba_number: mba },
        headers,
        timeout: 15000,
      });
      const list = Array.isArray(response.data)
        ? response.data
        : parseXanoListPayload(response.data);
      const rows = list as CampaignKpiRow[];

      if (
        rows.length > 0 &&
        rows.some((row) => String(row.mba_number ?? "").trim() !== mba)
      ) {
        console.warn(
          "[campaignKpi] mba_number filter ignored, falling back to full-list scan"
        );
        mbaFilterSupported = false;
        return fetchAllCampaignKpisAndFilter(uniqueMbas);
      }

      results.push(...rows);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        console.warn(
          "[campaignKpi] mba_number filter unsupported, falling back to full-list scan"
        );
        mbaFilterSupported = false;
        return fetchAllCampaignKpisAndFilter(uniqueMbas);
      }
      const body = (err as { response?: { data?: unknown } })?.response?.data;
      throw new Error(
        `Xano campaign_kpi GET failed for mba=${mba}: ${status ?? "unknown"} ${String(body ?? "")}`
      );
    }
  }

  mbaFilterSupported = true;
  return results;
}

/**
 * Fallback: fetch the entire campaign_kpi table and filter in TS.
 * Only used when the mba_number filter param isn't supported.
 */
async function fetchAllCampaignKpisAndFilter(mbaNumbers: string[]): Promise<CampaignKpiRow[]> {
  const mbaSet = new Set(mbaNumbers);
  const url = xanoUrl("campaign_kpi", "XANO_CLIENTS_BASE_URL");
  const all = await fetchAllXanoPages(url, {}, "campaign_kpi_all", 200, 50);
  return (all as CampaignKpiRow[]).filter((r) => mbaSet.has(r.mba_number));
}
