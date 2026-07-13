import { NextRequest, NextResponse } from "next/server";
import { requirePacingAccess } from "@/lib/pacing/pacingAuth";
import { resolveClientSlugs } from "@/lib/pacing/scope/resolveClientSlugs";
import { getCachedAdServingPacingRows } from "@/lib/pacing/campaigns/pacingRowsCache";
import { getAsOfDate } from "@/lib/pacing/maths";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/pacing/ad-serving-campaigns
 *
 * CM360 ad-serving verification rows for live digital line items.
 * Delivery counts only — no spend pacing (zero-spend law).
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
    const rows = await getCachedAdServingPacingRows(asOfDate, allowedClientSlugs);
    return NextResponse.json({ asOfDate, rows });
  } catch (err) {
    console.error("[api/pacing/ad-serving-campaigns] failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
