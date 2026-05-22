import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireRole";
import {
  assignOrphanLineItem,
  OrphanAssignValidationError,
} from "@/lib/pacing/admin/assignOrphanLineItem";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RequestBody = {
  channel?: string;
  platformLineItemId?: string;
  lineItemId?: string;
  adGroupName?: string;
  campaignName?: string;
  note?: string;
};

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("response" in admin) return admin.response;

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.channel || !body.platformLineItemId || !body.lineItemId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const adminEmail =
    admin.session?.user?.email ?? admin.session?.user?.sub ?? "unknown";

  try {
    const result = await assignOrphanLineItem({
      adminEmail,
      channel: body.channel,
      platformLineItemId: body.platformLineItemId,
      newLineItemId: body.lineItemId,
      note: body.note,
      adGroupName: body.adGroupName,
      campaignName: body.campaignName,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof OrphanAssignValidationError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: 400 });
    }
    console.error("[api/pacing/admin/orphans/assign] failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
