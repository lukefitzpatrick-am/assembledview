import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/requireRole"
import { getPublisherByPublisherId } from "@/lib/api/publishers"
import { listPublisherMeetings } from "@/lib/publisher/listPublisherMeetings"

export const runtime = "nodejs"

/** Fireflies meetings attributed to this catalogue publisher (Publisher Hub). */
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
    const items = await listPublisherMeetings(publisher.id)
    return NextResponse.json({ items })
  } catch (e) {
    console.error("[publishers/meetings]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Meetings failed" },
      { status: 500 },
    )
  }
}
