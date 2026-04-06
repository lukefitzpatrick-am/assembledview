import { NextRequest, NextResponse } from "next/server"
import { parseXanoListPayload, xanoUrl } from "@/lib/api/xano"
import type { CampaignKPI } from "@/types/kpi"

export const runtime = "nodejs"

function xanoAuthHeaders(): HeadersInit {
  return {
    Accept: "application/json",
    ...(process.env.XANO_API_KEY ? { Authorization: `Bearer ${process.env.XANO_API_KEY}` } : {}),
  }
}

function xanoPostHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(process.env.XANO_API_KEY ? { Authorization: `Bearer ${process.env.XANO_API_KEY}` } : {}),
  }
}

export async function GET(request: NextRequest) {
  try {
    const mbaNumber = request.nextUrl.searchParams.get("mbaNumber")?.trim() ?? ""
    const versionRaw = request.nextUrl.searchParams.get("versionNumber")
    if (!mbaNumber || versionRaw === null || versionRaw.trim() === "") {
      return NextResponse.json({ error: "mbaNumber and versionNumber are required" }, { status: 400 })
    }
    const versionNumber = Number(versionRaw)
    if (!Number.isFinite(versionNumber)) {
      return NextResponse.json({ error: "versionNumber must be a number" }, { status: 400 })
    }

    const base = xanoUrl("campaign_kpi", "XANO_CLIENTS_BASE_URL")
    const url = new URL(base)
    url.searchParams.set("mba_number", mbaNumber)
    url.searchParams.set("version_number", String(versionNumber))

    const upstream = await fetch(url.toString(), { headers: xanoAuthHeaders(), cache: "no-store" })
    if (!upstream.ok) {
      const text = await upstream.text()
      console.error("GET campaign_kpi upstream:", upstream.status, text)
      return NextResponse.json(
        { error: text || "Failed to fetch campaign KPIs" },
        { status: upstream.status >= 400 ? upstream.status : 502 },
      )
    }

    const payload = await upstream.json()
    const list = parseXanoListPayload(payload)
    const filtered = list.filter((row: Record<string, unknown>) => {
      const mba = String(row.mba_number ?? row.mbaNumber ?? "")
      const ver = Number(row.version_number ?? row.versionNumber ?? NaN)
      return mba === mbaNumber && ver === versionNumber
    })
    return NextResponse.json(filtered)
  } catch (error) {
    console.error("GET /api/kpis/campaign:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!Array.isArray(body)) {
      return NextResponse.json({ error: "Body must be a JSON array of campaign KPIs" }, { status: 400 })
    }

    const kpis = body as CampaignKPI[]
    const url = xanoUrl("campaign_kpi", "XANO_CLIENTS_BASE_URL")

    const results = await Promise.all(
      kpis.map(async (item) => {
        const upstream = await fetch(url, {
          method: "POST",
          headers: xanoPostHeaders(),
          body: JSON.stringify(item),
          cache: "no-store",
        })
        if (!upstream.ok) {
          const text = await upstream.text()
          throw new Error(text || `Save failed with status ${upstream.status}`)
        }
        return upstream.json() as Promise<CampaignKPI>
      }),
    )

    return NextResponse.json(results)
  } catch (error) {
    console.error("POST /api/kpis/campaign:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
