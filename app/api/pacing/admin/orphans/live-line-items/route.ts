import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireRole";
import { getLiveSearchLineItemRecords } from "@/lib/pacing/campaigns/liveSearchLineItems";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("response" in admin) return admin.response;

  const asOfDate = new Date().toISOString().slice(0, 10);

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
