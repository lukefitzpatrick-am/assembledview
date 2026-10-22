import { NextRequest, NextResponse } from "next/server";
import { requirePacingAccess } from "@/lib/pacing/pacingAuth";
import { resolveClientSlugs } from "@/lib/pacing/scope/resolveClientSlugs";
import { getCachedProgrammaticPacingRows } from "@/lib/pacing/campaigns/pacingRowsCache";
import { resolveAdminPacingDays } from "@/lib/pacing/countTo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/pacing/programmatic-campaigns
 *
 * Live Programmatic line items (progDisplay/Video/Bvod/Audio/Ooh) composed from
 * Xano + PACING_FACT spend pacing (DV360 + Taboola via channel filters).
 *
 * Query params:
 *   asOfDate? — YYYY-MM-DD view day, defaults to Melbourne timezone today.
 *   Spend, delivery and status count to the day before (`countToDate`).
 */
export async function GET(request: NextRequest) {
  const gate = await requirePacingAccess(request);
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const asOfDateParam = url.searchParams.get("asOfDate");
  // P1: counts to the day before the view day, like the client strip.
  const { asOfDate, countToDate } = resolveAdminPacingDays(asOfDateParam);

  const allowedClientSlugs =
    gate.allowedClientIds === null
      ? null
      : new Set(await resolveClientSlugs(gate.allowedClientIds));

  try {
    const rows = await getCachedProgrammaticPacingRows(asOfDate, allowedClientSlugs, countToDate);
    return NextResponse.json({ asOfDate, countToDate, rows });
  } catch (err) {
    console.error("[api/pacing/programmatic-campaigns] failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
