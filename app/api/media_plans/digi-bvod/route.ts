import { createChannelLineItemsGetHandler } from "@/lib/api/channelLineItemsGetHandler";
import { NextRequest, NextResponse } from "next/server"
import axios from "axios"
import { xanoAuthHeaderRecord, xanoPostHeaderRecord, xanoUrl } from "@/lib/api/xano"
import { requireRole } from "@/lib/requireRole"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

export const GET = createChannelLineItemsGetHandler(
  "media_plan_digi_bvod",
  "DIGI_BVOD"
);

/** SEC-G residual: collection POST matches catch-all requireRole(admin). */
export async function POST(request: NextRequest) {
  try {
    const gate = await requireRole(request, ["admin"])
    if ("response" in gate) return gate.response

    const data = await request.json()

    const response = await axios.post(xanoUrl("media_plan_digi_bvod", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]), data, { headers: { ...xanoPostHeaderRecord(), 
          "Content-Type": "application/json",
        }, })

    return NextResponse.json(response.data)
  } catch (error: any) {
    const status = error?.response?.status || 500
    const message =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      "Failed to save BVOD line item"

    return NextResponse.json({ error: message }, { status })
  }
}
