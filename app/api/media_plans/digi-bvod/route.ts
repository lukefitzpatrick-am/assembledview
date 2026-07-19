import { createChannelLineItemsGetHandler } from "@/lib/api/channelLineItemsGetHandler";
import { NextResponse } from "next/server"
import axios from "axios"
import { xanoAuthHeaderRecord, xanoPostHeaderRecord, xanoUrl } from "@/lib/api/xano"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

export const GET = createChannelLineItemsGetHandler(
  "media_plan_digi_bvod",
  "DIGI_BVOD"
);

export async function POST(request: Request) {
  try {
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
