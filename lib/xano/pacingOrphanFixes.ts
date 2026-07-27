import { xanoPostHeaderRecord, xanoUrl } from "@/lib/api/xano";

const MEDIA_PLANS_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const;

export type PacingOrphanFixInput = {
  adminUserEmail: string;
  channel: string;
  platformLineItemId: string;
  previousLineItemId: string | null;
  newLineItemId: string;
  adGroupName: string | null;
  campaignName: string | null;
  note: string | null;
};

export type PacingOrphanFixRow = PacingOrphanFixInput & {
  id: number;
  created_at: string;
};

/**
 * Writes an audit row to Xano's pacing_orphan_fixes table.
 */
export async function createPacingOrphanFix(
  input: PacingOrphanFixInput
): Promise<PacingOrphanFixRow> {
  const url = xanoUrl("pacing_orphan_fixes", [...MEDIA_PLANS_KEYS]);
  const resp = await fetch(url, {
    method: "POST",
    headers: xanoPostHeaderRecord(),
    body: JSON.stringify({
      admin_user_email: input.adminUserEmail,
      channel: input.channel,
      platform_line_item_id: input.platformLineItemId,
      previous_line_item_id: input.previousLineItemId,
      new_line_item_id: input.newLineItemId,
      ad_group_name: input.adGroupName,
      campaign_name: input.campaignName,
      note: input.note,
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Xano pacing_orphan_fixes POST failed: ${resp.status} ${body}`);
  }
  return (await resp.json()) as PacingOrphanFixRow;
}
