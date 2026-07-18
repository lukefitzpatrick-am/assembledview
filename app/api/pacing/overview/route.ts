import { NextRequest, NextResponse } from "next/server";
import { requirePacingAccess } from "@/lib/pacing/pacingAuth";
import { resolveClientSlugs } from "@/lib/pacing/scope/resolveClientSlugs";
import { getAsOfDate } from "@/lib/pacing/maths";
import { buildOverviewPayload } from "@/lib/pacing/overview/buildOverviewPayload";
import {
  OVERVIEW_DEFAULT_PAGE_SIZE,
  OVERVIEW_MAX_PAGE_SIZE,
} from "@/lib/pacing/overview/resolveOverviewClientScope";

export const dynamic = "force-dynamic";
/** Stopgap headroom after scoped fan-out + allSettled; not an app-wide change. */
export const maxDuration = 90;

/**
 * GET /api/pacing/overview
 *
 * Portfolio Overview: UNION of Search / Social / Programmatic / Ad Serving /
 * Direct cached pacing rows (same 4h cache as channel tabs), scoped to a
 * paginated live-client set. Individual source failures return partial 200
 * with unavailableSources — not a whole-route 504.
 *
 * Query: asOfDate, clientSlug, page, pageSize
 */
export async function GET(request: NextRequest) {
  const gate = await requirePacingAccess(request);
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const asOfDateParam = url.searchParams.get("asOfDate");
  const asOfDate = asOfDateParam?.trim() || getAsOfDate();
  const clientSlug = url.searchParams.get("clientSlug");
  const pageRaw = url.searchParams.get("page");
  const pageSizeRaw = url.searchParams.get("pageSize");
  const page = pageRaw ? Number.parseInt(pageRaw, 10) : 1;
  const pageSize = pageSizeRaw
    ? Number.parseInt(pageSizeRaw, 10)
    : OVERVIEW_DEFAULT_PAGE_SIZE;

  const allowedClientSlugs =
    gate.allowedClientIds === null
      ? null
      : new Set(await resolveClientSlugs(gate.allowedClientIds));

  try {
    const payload = await buildOverviewPayload({
      asOfDate,
      allowedClientSlugs,
      clientSlug,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize)
        ? Math.min(OVERVIEW_MAX_PAGE_SIZE, pageSize)
        : OVERVIEW_DEFAULT_PAGE_SIZE,
    });
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[api/pacing/overview] failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
