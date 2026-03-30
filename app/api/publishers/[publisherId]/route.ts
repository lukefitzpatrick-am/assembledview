import { NextResponse } from "next/server"
import axios from "axios"
import { xanoUrl } from "@/lib/api/xano"
import { getPublisherByPublisherId } from "@/lib/api/publishers"
import { bodyForPublisherPut } from "@/lib/publisher/normalizePublisher"

export async function GET(_req: Request, { params }: { params: Promise<{ publisherId: string }> }) {
  try {
    const { publisherId } = await params
    const publisher = await getPublisherByPublisherId(publisherId)
    if (!publisher) {
      return NextResponse.json({ error: "Publisher not found" }, { status: 404 })
    }
    return NextResponse.json(publisher)
  } catch (error) {
    console.error("Failed to fetch publisher:", error)
    return NextResponse.json({ error: "Failed to fetch publisher" }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ publisherId: string }> }) {
  try {
    const { publisherId } = await params
    const existing = await getPublisherByPublisherId(publisherId)
    if (!existing) {
      return NextResponse.json({ error: "Publisher not found" }, { status: 404 })
    }
    const body = await req.json()
    const payload = bodyForPublisherPut(body)
    const response = await axios.put(
      `${xanoUrl("edit_publishers", "XANO_PUBLISHERS_BASE_URL")}/${existing.id}`,
      payload,
    )
    return NextResponse.json(response.data)
  } catch (error) {
    console.error("Failed to update publisher:", error)
    return NextResponse.json({ error: "Failed to update publisher" }, { status: 500 })
  }
}
