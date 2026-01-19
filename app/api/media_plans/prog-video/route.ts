import { NextResponse } from "next/server"
import axios from "axios"
import { xanoUrl } from "@/lib/api/xano"

export async function POST(request: Request) {
  try {
    const data = await request.json()

    const response = await axios.post(
      xanoUrl("media_plan_prog_video", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]),
      data,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    )

    return NextResponse.json(response.data)
  } catch (error: any) {
    const status = error?.response?.status || 500
    const message =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      "Failed to save programmatic video line item"

    return NextResponse.json({ error: message }, { status })
  }
}
