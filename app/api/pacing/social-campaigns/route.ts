import { NextRequest, NextResponse } from "next/server";
import { requirePacingAccess } from "@/lib/pacing/pacingAuth";
import { resolveClientSlugs } from "@/lib/pacing/scope/resolveClientSlugs";
import { fetchSocialPacingCampaignRows } from "@/lib/pacing/social/fetchSocialPacingCampaignRows";
import { getAsOfDate } from "@/lib/pacing/maths";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/pacing/social-campaigns
 *
 * Returns the list of live Social line items composed from Xano.
 * Snowflake-sourced spend/KPI fields and three-level hierarchy populated in Part 2.
 *
 * Query params:
 *   asOfDate? — YYYY-MM-DD, defaults to Melbourne timezone today
 */
export async function GET(request: NextRequest) {
  const gate = await requirePacingAccess(request);
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const asOfDateParam = url.searchParams.get("asOfDate");
  const asOfDate = asOfDateParam?.trim() || getAsOfDate();

  const allowedClientSlugs =
    gate.allowedClientIds === null
      ? null
      : new Set(await resolveClientSlugs(gate.allowedClientIds));

  try {
    const rows = await fetchSocialPacingCampaignRows({ asOfDate, allowedClientSlugs });
    return NextResponse.json({ asOfDate, rows });
  } catch (err) {
    console.error("[api/pacing/social-campaigns] failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
