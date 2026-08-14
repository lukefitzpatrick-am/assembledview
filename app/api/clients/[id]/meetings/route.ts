import { NextRequest, NextResponse } from "next/server"

import { requireAdmin } from "@/lib/requireRole"
import { fetchClientById } from "@/lib/clients/fetchClientById"
import { listClientMeetings } from "@/lib/clients/listClientMeetings"

export const runtime = "nodejs"

/** Fireflies meetings attributed to this client (Client Hub). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request)
  if ("response" in auth && auth.response) {
    return auth.response
  }

  try {
    const { id } = await params
    const client = await fetchClientById(id)
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 })
    }
    const clientId = Number(client.id)
    if (!Number.isFinite(clientId)) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 })
    }
    const items = await listClientMeetings(clientId)
    return NextResponse.json({ items })
  } catch (e) {
    console.error("[clients/meetings]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Meetings failed" },
      { status: 500 },
    )
  }
}
