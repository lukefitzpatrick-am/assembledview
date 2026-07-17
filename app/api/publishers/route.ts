import { NextResponse } from "next/server"
import axios from "axios"
import { xanoAuthHeaderRecord, xanoPostHeaderRecord, xanoUrl } from "@/lib/api/xano"
import { getCachedPublishersList } from "@/lib/api/publishersCache"

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    // Naming export may need best-practice blobs: ?full=1
    const full = url.searchParams.get("full") === "1"
    const { data, stale } = await getCachedPublishersList({ light: !full })
    const headers: Record<string, string> = {}
    if (stale) headers["x-warning"] = "served-stale-after-upstream-failure"
    return NextResponse.json(data, { headers })
  } catch (error) {
    console.error("Failed to fetch publishers:", error)
    return NextResponse.json({ error: "Failed to fetch publishers" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const response = await axios.post(xanoUrl("post_publishers", "XANO_PUBLISHERS_BASE_URL"), body, { headers: xanoPostHeaderRecord() })
    return NextResponse.json(response.data, { status: 201 })
  } catch (error) {
    console.error("Failed to create publisher:", error)
    return NextResponse.json({ error: "Failed to create publisher" }, { status: 500 })
  }
}
