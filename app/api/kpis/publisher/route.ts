import { NextResponse } from "next/server"
import { parseXanoListPayload, xanoUrl } from "@/lib/api/xano"

export const runtime = "nodejs"

function xanoAuthHeaders(): HeadersInit {
  return {
    Accept: "application/json",
    ...(process.env.XANO_API_KEY ? { Authorization: `Bearer ${process.env.XANO_API_KEY}` } : {}),
  }
}

export async function GET() {
  try {
    const url = xanoUrl("publisher_kpi", "XANO_PUBLISHERS_BASE_URL")
    const upstream = await fetch(url, { headers: xanoAuthHeaders(), cache: "no-store" })
    if (!upstream.ok) {
      const text = await upstream.text()
      console.error("GET publisher_kpi upstream:", upstream.status, text)
      return NextResponse.json(
        { error: text || "Failed to fetch publisher KPIs" },
        { status: upstream.status >= 400 ? upstream.status : 502 },
      )
    }
    const payload = await upstream.json()
    const list = parseXanoListPayload(payload)
    return NextResponse.json(list)
  } catch (error) {
    console.error("GET /api/kpis/publisher:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
