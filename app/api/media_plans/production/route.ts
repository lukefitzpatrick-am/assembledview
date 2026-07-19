import { createChannelLineItemsGetHandler } from "@/lib/api/channelLineItemsGetHandler";
import { NextResponse } from "next/server";
import axios from "axios";
import { xanoAuthHeaderRecord, xanoPostHeaderRecord, xanoUrl } from "@/lib/api/xano";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export const GET = createChannelLineItemsGetHandler(
  "media_plan_production",
  "PRODUCTION"
);

export async function POST(request: Request) {
  try {
    const data = await request.json();

    const response = await axios.post(xanoUrl("media_plan_production", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]), data, { headers: { ...xanoPostHeaderRecord(), 
        "Content-Type": "application/json",
      }, });

    return NextResponse.json(response.data);
  } catch (error) {
    console.error("Error creating production line item:", error);
    return NextResponse.json({ error: "Failed to create production line item" }, { status: 500 });
  }
}












