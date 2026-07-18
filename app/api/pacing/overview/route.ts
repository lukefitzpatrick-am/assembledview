import { NextRequest, NextResponse } from "next/server";
import { requirePacingAccess } from "@/lib/pacing/pacingAuth";
import { resolveClientSlugs } from "@/lib/pacing/scope/resolveClientSlugs";
import { getAsOfDate } from "@/lib/pacing/maths";
import { buildOverviewPayload } from "@/lib/pacing/overview/buildOverviewPayload";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/pacing/overview
 *
 * Portfolio Overview: UNION of Search / Social / Programmatic / Ad Serving /
 * Direct cached pacing rows (same 4h cache as channel tabs).
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
    const payload = await buildOverviewPayload({ asOfDate, allowedClientSlugs });
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[api/pacing/overview] failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
