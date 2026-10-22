import { NextRequest, NextResponse } from "next/server";
import { requirePacingAccess } from "@/lib/pacing/pacingAuth";
import { resolveClientSlugs } from "@/lib/pacing/scope/resolveClientSlugs";
import { getCachedDirectPacingRows } from "@/lib/pacing/campaigns/pacingRowsCache";
import { resolveAdminPacingDays } from "@/lib/pacing/countTo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/pacing/direct-campaigns
 *
 * Fixed-cost media line items from FIXED_COST_* facts, grouped by campaign.
 *
 * Query params:
 *   asOfDate? — YYYY-MM-DD view day, defaults to Melbourne timezone today.
 *   Spend, delivery and status count to the day before (`countToDate`).
 *   includeHistorical? — "1"/"true" includes WAS_EVER_FIXED_COST rows
 */
export async function GET(request: NextRequest) {
  const gate = await requirePacingAccess(request);
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const asOfDateParam = url.searchParams.get("asOfDate");
  // P1: counts to the day before the view day, like the client strip.
  const { asOfDate, countToDate } = resolveAdminPacingDays(asOfDateParam);
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
      includeHistorical,
      countToDate
    );
    return NextResponse.json({ asOfDate, countToDate, includeHistorical, campaigns });
  } catch (err) {
    console.error("[api/pacing/direct-campaigns] failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
