import { NextRequest, NextResponse } from "next/server";
import { requirePacingAccess } from "@/lib/pacing/pacingAuth";
import { resolveClientSlugs } from "@/lib/pacing/scope/resolveClientSlugs";
import { fetchSearchPacingCampaignRows } from "@/lib/pacing/campaigns/fetchSearchPacingCampaignRows";
import { getAsOfDate } from "@/lib/pacing/maths";

export const dynamic = "force-dynamic";

/**
 * GET /api/pacing/campaigns
 *
 * Returns the list of live Search line items composed from Xano.
 * Snowflake-sourced fields are 0 / null in Stage 1 Part 1 — populated in Part 2.
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
    const rows = await fetchSearchPacingCampaignRows({ asOfDate, allowedClientSlugs });
    return NextResponse.json({ asOfDate, rows });
  } catch (err) {
    console.error("[api/pacing/campaigns] failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
