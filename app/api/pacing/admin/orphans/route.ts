import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireRole";
import { getOrphanAdGroups, SEARCH_PACING_CHANNELS } from "@/lib/pacing/admin/orphanDetection";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("response" in admin) return admin.response;

  const url = new URL(request.url);
  const dateWindowDays = Number(url.searchParams.get("dateWindow") ?? 30);
  const spendThreshold = Number(url.searchParams.get("spendThreshold") ?? 0);
  const channelParam = url.searchParams.get("channel");

  const channelFilter =
    channelParam && (SEARCH_PACING_CHANNELS as readonly string[]).includes(channelParam)
      ? (channelParam as (typeof SEARCH_PACING_CHANNELS)[number])
      : null;

  const asOfDate = new Date().toISOString().slice(0, 10);

  try {
    const orphans = await getOrphanAdGroups({
      asOfDate,
      dateWindowDays: Number.isFinite(dateWindowDays) ? dateWindowDays : 30,
      channelFilter,
      spendThreshold: Number.isFinite(spendThreshold) ? spendThreshold : 0,
    });
    return NextResponse.json({ orphans, asOfDate, dateWindow: dateWindowDays });
  } catch (err) {
    console.error("[api/pacing/admin/orphans] failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
