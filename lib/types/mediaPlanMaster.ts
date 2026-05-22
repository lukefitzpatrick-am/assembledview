/**
 * Canonical TypeScript representation of a media_plan_master row from Xano.
 *
 * Discovered in Stage 1 Part 1 discovery — there is no exported canonical type today.
 * Shape inferred from the create payload, dashboard fetchers, and known Xano fields.
 *
 * If Xano grows columns over time, extend this interface; do not narrow it.
 */
export interface MediaPlanMaster {
  id: number;
  mba_number: string;
  mp_client_name: string;
  mp_campaignname: string;
  version_number: number;
  campaign_status: string; // raw — normalise via lib/api/dashboard helpers before comparing
  campaign_start_date: string; // YYYY-MM-DD
  campaign_end_date: string; // YYYY-MM-DD
  mp_campaignbudget: number;
  created_at?: number;
}

/** Statuses that count as "live" for the pacing/campaigns page. */
export const LIVE_CAMPAIGN_STATUSES = ["booked", "approved"] as const;
export type LiveCampaignStatus = (typeof LIVE_CAMPAIGN_STATUSES)[number];

export function isLiveCampaignStatus(status: string | undefined | null): status is LiveCampaignStatus {
  if (!status) return false;
  return (LIVE_CAMPAIGN_STATUSES as readonly string[]).includes(status.trim().toLowerCase());
}
