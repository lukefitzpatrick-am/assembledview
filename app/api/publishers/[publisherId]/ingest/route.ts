import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/requireRole"
import { getPublisherByPublisherId } from "@/lib/api/publishers"
import { getPublisherIngestHub } from "@/lib/mediaplans/ingest/publisherIngestHub"

export const runtime = "nodejs"

/** Ingest profile + recent runs for the Publisher Hub. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ publisherId: string }> },
) {
  const auth = await requireAdmin(request)
  if ("response" in auth && auth.response) {
    return auth.response
  }

  try {
    const { publisherId } = await params
    const publisher = await getPublisherByPublisherId(publisherId)
    if (!publisher) {
      return NextResponse.json({ error: "Publisher not found" }, { status: 404 })
    }
    const hub = await getPublisherIngestHub({
      id: publisher.id,
      publisher_name: publisher.publisher_name,
    })
    return NextResponse.json(hub)
  } catch (e) {
    console.error("[publishers/ingest]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ingest hub failed" },
      { status: 500 },
    )
  }
}
