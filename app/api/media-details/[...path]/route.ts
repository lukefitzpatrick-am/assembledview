import { NextResponse } from "next/server"
import { xanoUrl } from "@/lib/api/xano"

type Params = { params: Promise<{ path: string[] }> }

async function proxyRequest(request: Request, { params }: Params, method: string) {
  const { path: parts } = await params
  const path = (parts || []).join("/")
  if (!path) {
    return NextResponse.json({ error: "Missing media detail path" }, { status: 400 })
  }

  try {
    const targetUrl = xanoUrl(path, "XANO_MEDIA_DETAILS_BASE_URL")
    const url = new URL(targetUrl)

    // Forward query params
    const incoming = new URL(request.url)
    incoming.searchParams.forEach((value, key) => {
      url.searchParams.set(key, value)
    })

    // Forward body for non-GET/HEAD methods
    const body =
      method === "GET" || method === "HEAD" ? undefined : await request.text()

    const upstream = await fetch(url.toString(), {
      method,
      headers: {
        "Content-Type": request.headers.get("content-type") || "application/json"
      },
      body: body && body.length > 0 ? body : undefined
    })

    const contentType = upstream.headers.get("content-type") || ""
    const responseBody = contentType.includes("application/json")
      ? await upstream.json()
      : await upstream.text()

    if (contentType.includes("application/json")) {
      return NextResponse.json(responseBody, { status: upstream.status })
    }

    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: { "content-type": contentType || "text/plain" }
    })
  } catch (error: any) {
    console.error("[media-details proxy] error", error)
    return NextResponse.json(
      { error: "Failed to proxy media details request", details: error?.message || "Unknown error" },
      { status: 500 }
    )
  }
}

export async function GET(request: Request, ctx: Params) {
  return proxyRequest(request, ctx, "GET")
}

export async function POST(request: Request, ctx: Params) {
  return proxyRequest(request, ctx, "POST")
}

export async function PUT(request: Request, ctx: Params) {
  return proxyRequest(request, ctx, "PUT")
}

export async function PATCH(request: Request, ctx: Params) {
  return proxyRequest(request, ctx, "PATCH")
}

export async function DELETE(request: Request, ctx: Params) {
  return proxyRequest(request, ctx, "DELETE")
}
