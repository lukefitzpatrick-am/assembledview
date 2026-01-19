import { NextResponse } from "next/server"
import { xanoUrl } from "@/lib/api/xano"

async function proxy(request: Request, params: { path: string[] }) {
  const path = (params?.path || []).join("/")
  if (!path) {
    return NextResponse.json({ error: "Missing media plan path" }, { status: 400 })
  }

  const targetBase = xanoUrl(path, ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])
  const incoming = new URL(request.url)
  const url = new URL(targetBase)
  incoming.searchParams.forEach((value, key) => url.searchParams.set(key, value))

  const init: RequestInit = {
    method: request.method,
    headers: {
      "Content-Type": request.headers.get("content-type") || "application/json",
      ...(process.env.XANO_API_KEY ? { Authorization: `Bearer ${process.env.XANO_API_KEY}` } : {}),
    },
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
  }

  const upstream = await fetch(url.toString(), init)
  const text = await upstream.text()

  const contentType = upstream.headers.get("content-type") || ""
  if (contentType.includes("application/json")) {
    return NextResponse.json(JSON.parse(text), { status: upstream.status })
  }

  return new NextResponse(text, {
    status: upstream.status,
    headers: { "content-type": contentType || "text/plain" },
  })
}

export async function GET(request: Request, context: { params: { path: string[] } }) {
  return proxy(request, context.params)
}

export async function POST(request: Request, context: { params: { path: string[] } }) {
  return proxy(request, context.params)
}

export async function PUT(request: Request, context: { params: { path: string[] } }) {
  return proxy(request, context.params)
}

export async function DELETE(request: Request, context: { params: { path: string[] } }) {
  return proxy(request, context.params)
}
