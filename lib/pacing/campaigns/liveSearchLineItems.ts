import "server-only";

import { parseBurstsToNormalised } from "@/lib/pacing/burst/parseBursts";
import {
  resolveLiveSearchLineItemInputs,
  type GetLiveSearchLineItemsArgs,
} from "./fetchSearchPacingCampaignRows";

export type { GetLiveSearchLineItemsArgs, LiveSearchLineItemInput } from "./fetchSearchPacingCampaignRows";

export type LiveSearchLineItemRecord = {
  lineItemId: string;
  mbaNumber: string;
  campaignName: string;
  clientName: string;
  totalLineItemBudget: number;
};

/**
 * Fetches live search line items (one per Xano media_plan_search row
 * under a live master) without Snowflake hydration.
 */
export async function getLiveSearchLineItemRecords(
  args: GetLiveSearchLineItemsArgs
): Promise<LiveSearchLineItemRecord[]> {
  const inputs = await resolveLiveSearchLineItemInputs(args);
  return inputs.map(({ master, searchRow }) => {
    const bursts = parseBurstsToNormalised(searchRow.bursts_json ?? searchRow.bursts);
    const totalLineItemBudget = bursts.reduce((acc, b) => acc + b.budget, 0);
    return {
      lineItemId: String(searchRow.line_item_id ?? searchRow.lineItemId ?? "")
        .toLowerCase()
        .trim(),
      mbaNumber: master.mba_number,
      campaignName: master.mp_campaignname,
      clientName: master.mp_client_name,
      totalLineItemBudget,
    };
  });
}

export async function getLiveSearchLineItemIds(
  args: GetLiveSearchLineItemsArgs
): Promise<Set<string>> {
  const records = await getLiveSearchLineItemRecords(args);
  return new Set(records.map((r) => r.lineItemId));
}
