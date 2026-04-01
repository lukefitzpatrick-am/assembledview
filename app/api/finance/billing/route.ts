import { NextRequest, NextResponse } from "next/server"
import { xanoUrl } from "@/lib/api/xano"

const XANO_BASE = process.env.XANO_CLIENTS_BASE_URL

export async function GET(request: NextRequest) {
  try {
    if (!XANO_BASE) {
      return NextResponse.json({ error: "Missing XANO_CLIENTS_BASE_URL" }, { status: 500 })
    }
    const params = request.nextUrl.searchParams
    const upstream = await fetch(`${xanoUrl("finance_billing_records", "XANO_CLIENTS_BASE_URL")}?${params.toString()}`, {
      headers: { Authorization: request.headers.get("Authorization") ?? "" },
      cache: "no-store",
    })
    const data = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch billing records", details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
