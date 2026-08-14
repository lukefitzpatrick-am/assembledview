import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/requireRole"
import { createLinkedPublisherProfile } from "@/lib/mediaplans/ingest/createLinkedPublisherProfile"

export const runtime = "nodejs"

/** Human catalogue pick for an unknown publisher — never guess. */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth && auth.response) {
    return auth.response
  }

  try {
    const body = (await request.json()) as {
      id?: number
      publisher_name?: string
      publisherid?: string | null
      pub_ooh?: boolean | null
      pub_radio?: boolean | null
    }
    const id = Number(body.id)
    const publisher_name = String(body.publisher_name ?? "").trim()
    if (!Number.isFinite(id) || id <= 0 || !publisher_name) {
      return NextResponse.json(
        { error: "id and publisher_name required" },
        { status: 400 },
      )
    }
    const profile = await createLinkedPublisherProfile({
      catalogue: {
        id,
        publisher_name,
        publisherid: body.publisherid ?? null,
        pub_ooh: body.pub_ooh ?? null,
        pub_radio: body.pub_radio ?? null,
      },
    })
    return NextResponse.json({ profile })
  } catch (e) {
    console.error("[admin/ingest/link-publisher]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Link failed" },
      { status: 500 },
    )
  }
}
