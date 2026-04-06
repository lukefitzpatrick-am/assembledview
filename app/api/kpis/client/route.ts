import { NextRequest, NextResponse } from "next/server"
import { parseXanoListPayload, xanoUrl } from "@/lib/api/xano"

export const runtime = "nodejs"

function xanoAuthHeaders(): HeadersInit {
  return {
    Accept: "application/json",
    ...(process.env.XANO_API_KEY ? { Authorization: `Bearer ${process.env.XANO_API_KEY}` } : {}),
  }
}

export async function GET(request: NextRequest) {
  try {
    const clientNameRaw = request.nextUrl.searchParams.get("clientName")
    const clientName = clientNameRaw?.trim() ?? ""
    if (!clientName) {
      return NextResponse.json({ error: "clientName is required" }, { status: 400 })
    }

    const base = xanoUrl("client_kpi", "XANO_CLIENTS_BASE_URL")
    const url = new URL(base)
    url.searchParams.set("mp_client_name", clientName)

    const upstream = await fetch(url.toString(), { headers: xanoAuthHeaders(), cache: "no-store" })
    if (!upstream.ok) {
      const text = await upstream.text()
      console.error("GET client_kpi upstream:", upstream.status, text)
      return NextResponse.json(
        { error: text || "Failed to fetch client KPIs" },
        { status: upstream.status >= 400 ? upstream.status : 502 },
      )
    }

    const payload = await upstream.json()
    const list = parseXanoListPayload(payload)
    const filtered = list.filter(
      (row: { mp_client_name?: string }) => String(row?.mp_client_name ?? "").trim() === clientName,
    )
    return NextResponse.json(filtered)
  } catch (error) {
    console.error("GET /api/kpis/client:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
