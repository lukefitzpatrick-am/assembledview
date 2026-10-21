import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireRole";
import { getLiveSearchLineItemRecords } from "@/lib/pacing/campaigns/liveSearchLineItems";
import { getAsOfDate } from "@/lib/pacing/maths";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("response" in admin) return admin.response;

  // Melbourne civil date, the same as-of as every pacing read (never the UTC day).
  const asOfDate = getAsOfDate();

  try {
    const lineItems = await getLiveSearchLineItemRecords({
      asOfDate,
      allowedClientSlugs: null,
    });
    return NextResponse.json({ lineItems, asOfDate });
  } catch (err) {
    console.error("[api/pacing/admin/orphans/live-line-items] failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
