/**
 * Canonical TypeScript representation of a media_plan_master row from Xano.
 *
 * Discovered in Stage 1 Part 1 discovery — there is no exported canonical type today.
 * Shape inferred from the create payload, dashboard fetchers, and known Xano fields.
 *
 * If Xano grows columns over time, extend this interface; do not narrow it.
 */
import {
  resolveCampaignPhase,
  sydneyCivilDayFromYmd,
} from "@/lib/mediaplan/campaignPhase";

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

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Pacing "live" gate. Name kept so call sites do not churn.
 * Body is `resolveCampaignPhase(...).phase === "live"` — `live` is not a stored status.
 * Pass campaign dates and optional as-of YMD (pacing `asOfDate`); omit asOf to use now.
 */
export function isLiveCampaignStatus(
  status: string | undefined | null,
  startDate?: string | null,
  endDate?: string | null,
  asOfYmd?: string | null,
): boolean {
  const today =
    asOfYmd && DATE_ONLY_RE.test(asOfYmd)
      ? sydneyCivilDayFromYmd(asOfYmd)
      : undefined;
  return (
    resolveCampaignPhase({
      status,
      startDate,
      endDate,
      today,
    }).phase === "live"
  );
}
