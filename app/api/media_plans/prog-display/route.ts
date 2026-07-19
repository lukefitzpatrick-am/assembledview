import { createChannelLineItemsGetHandler } from "@/lib/api/channelLineItemsGetHandler";
import { NextResponse } from "next/server"
import axios from "axios"
import { xanoUrl } from "@/lib/api/xano"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

export const GET = createChannelLineItemsGetHandler(
  "media_plan_prog_display",
  "PROG_DISPLAY"
);

