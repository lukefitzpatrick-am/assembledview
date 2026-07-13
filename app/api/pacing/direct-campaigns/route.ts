import { NextRequest, NextResponse } from "next/server";
import { requirePacingAccess } from "@/lib/pacing/pacingAuth";
import { resolveClientSlugs } from "@/lib/pacing/scope/resolveClientSlugs";
import { getCachedDirectPacingRows } from "@/lib/pacing/campaigns/pacingRowsCache";
import { getAsOfDate } from "@/lib/pacing/maths";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/pacing/direct-campaigns
 *
 * Fixed-cost media line items from FIXED_COST_* facts, grouped by campaign.
 *
 * Query params:
 *   asOfDate? — YYYY-MM-DD, defaults to Melbourne timezone today
 *   includeHistorical? — "1"/"true" includes WAS_EVER_FIXED_COST rows
 */
export async function GET(request: NextRequest) {
  const gate = await requirePacingAccess(request);
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const asOfDateParam = url.searchParams.get("asOfDate");
  const asOfDate = asOfDateParam?.trim() || getAsOfDate();
  const histRaw = url.searchParams.get("includeHistorical")?.trim().toLowerCase();
  const includeHistorical = histRaw === "1" || histRaw === "true";

  const allowedClientSlugs =
    gate.allowedClientIds === null
      ? null
      : new Set(await resolveClientSlugs(gate.allowedClientIds));

  try {
    const campaigns = await getCachedDirectPacingRows(
      asOfDate,
      allowedClientSlugs,
      includeHistorical
    );
    return NextResponse.json({ asOfDate, includeHistorical, campaigns });
  } catch (err) {
    console.error("[api/pacing/direct-campaigns] failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
