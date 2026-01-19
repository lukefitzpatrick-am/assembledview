import { NextResponse } from "next/server"
import { xanoUrl } from "@/lib/api/xano"

export async function GET(
  request: Request,
  { params }: { params: { path: string[] } }
) {
  const path = (params?.path || []).join("/")
  if (!path) {
    return NextResponse.json({ error: "Missing media detail path" }, { status: 400 })
  }

  try {
    const targetUrl = xanoUrl(path, "XANO_MEDIA_DETAILS_BASE_URL")
    const url = new URL(targetUrl)

    // forward query params
    const incoming = new URL(request.url)
    incoming.searchParams.forEach((value, key) => {
      url.searchParams.set(key, value)
    })

    const upstream = await fetch(url.toString(), { method: "GET" })
    const body = await upstream.json()

    return NextResponse.json(body, { status: upstream.status })
  } catch (error: any) {
    console.error("[media-details proxy] error", error)
    return NextResponse.json(
      { error: "Failed to fetch media details", details: error?.message || "Unknown error" },
      { status: 500 }
    )
  }
}
