import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/requireRole"
import { remapIngestColumn } from "@/lib/mediaplans/ingest/remapIngestColumn"

export const runtime = "nodejs"

/** Remap a publisher column → writes back to publisher_profiles. */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth && auth.response) {
    return auth.response
  }

  try {
    const body = (await request.json()) as {
      publisherName?: string
      header?: string
      mappedTo?: string | null
    }
    if (!body.publisherName?.trim() || !body.header?.trim()) {
      return NextResponse.json(
        { error: "publisherName and header required" },
        { status: 400 },
      )
    }
    const result = await remapIngestColumn({
      publisherName: body.publisherName.trim(),
      header: body.header.trim(),
      mappedTo: body.mappedTo ?? null,
    })
    return NextResponse.json(result)
  } catch (e) {
    console.error("[admin/ingest/remap]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Remap failed" },
      { status: 500 },
    )
  }
}
