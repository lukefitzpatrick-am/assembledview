import { NextRequest, NextResponse } from "next/server"

import { requireRelabelAccess } from "@/lib/pacing/relabel/auth"
import { runRelabelPreview } from "@/lib/pacing/relabel/handlers"

export const dynamic = "force-dynamic"
export const maxDuration = 60

function readPreviewBody(json: Record<string, unknown> | null) {
  const channel = typeof json?.channel === "string" ? json.channel.trim() : ""
  const platformEntityId =
    typeof json?.platformEntityId === "string" ? json.platformEntityId.trim() : ""
  const lineItemId = typeof json?.lineItemId === "string" ? json.lineItemId.trim() : ""
  if (!channel || !platformEntityId || !lineItemId) {
    return null
  }
  return {
    channel,
    platformEntityId,
    lineItemId,
    dateFrom: typeof json?.dateFrom === "string" ? json.dateFrom : null,
    dateTo: typeof json?.dateTo === "string" ? json.dateTo : null,
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireRelabelAccess(request)
  if (!gate.ok) return gate.response

  const json = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const body = readPreviewBody(json)
  if (!body) {
    return NextResponse.json(
      { error: "channel, platformEntityId and lineItemId are required" },
      { status: 400 },
    )
  }
  return runRelabelPreview(body, gate.actorEmail)
}
