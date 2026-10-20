import { NextRequest, NextResponse } from "next/server"

import { fetchClientById } from "@/lib/clients/fetchClientById"
import { requireRole } from "@/lib/requireRole"
import { queryAvailableConversionEvents } from "@/lib/snowflake/conversions"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

/**
 * Events seen in MART.VW_CONVERSION_DAILY for this client's lines in the last
 * 180 days (line ids that start with the client's mbaidentifier). Admin only.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["admin"])
  if ("response" in auth) return auth.response

  const { id } = await params
  const clientId = Number(id)
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return NextResponse.json({ error: "Invalid client id" }, { status: 400 })
  }
  const client = await fetchClientById(clientId)
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 })

  const mbaidentifier = String(client.mbaidentifier ?? "").trim()
  if (!mbaidentifier) {
    return NextResponse.json({ events: [], note: "Client has no MBA identifier" })
  }

  try {
    const events = await queryAvailableConversionEvents({ mbaidentifier, days: 180 })
    return NextResponse.json({ events })
  } catch (err) {
    console.error("[conversion-events/available]", err)
    return NextResponse.json({ error: "Failed to load conversion events" }, { status: 500 })
  }
}
