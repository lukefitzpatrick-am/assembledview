import { NextResponse } from "next/server"
import { xanoUrl } from "@/lib/api/xano"
import {
  getCachedMediaDetailsReference,
  invalidateMediaDetailsCache,
  isMediaDetailsReferenceListPath,
  isMediaDetailsReferenceRelatedPath,
} from "@/lib/api/mediaDetailsCache"
import { checkMediaDetailsProxyPath } from "@/lib/security/proxyAllowlist"

type Params = { params: Promise<{ path: string[] }> }

async function proxyUncached(request: Request, path: string, method: string) {
  const targetUrl = xanoUrl(path, "XANO_MEDIA_DETAILS_BASE_URL")
  const url = new URL(targetUrl)

  const incoming = new URL(request.url)
  incoming.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value)
  })

  const body =
    method === "GET" || method === "HEAD" ? undefined : await request.text()

  const upstream = await fetch(url.toString(), {
    method,
    headers: {
      "Content-Type": request.headers.get("content-type") || "application/json",
    },
    body: body && body.length > 0 ? body : undefined,
  })

  const contentType = upstream.headers.get("content-type") || ""
  const responseBody = contentType.includes("application/json")
    ? await upstream.json()
    : await upstream.text()

  if (
    method !== "GET" &&
    method !== "HEAD" &&
    upstream.ok &&
    isMediaDetailsReferenceRelatedPath(path)
  ) {
    invalidateMediaDetailsCache()
  }

  if (contentType.includes("application/json")) {
    return NextResponse.json(responseBody, { status: upstream.status })
  }

  return new NextResponse(responseBody, {
    status: upstream.status,
    headers: { "content-type": contentType || "text/plain" },
  })
}

async function proxyRequest(request: Request, { params }: Params, method: string) {
  const { path: parts } = await params
  const pathSegments = parts || []
  const path = pathSegments.join("/")
  if (!path) {
    return NextResponse.json({ error: "Missing media detail path" }, { status: 400 })
  }

  const gate = checkMediaDetailsProxyPath(pathSegments, method)
  if (!gate.allowed) {
    console.warn(`[proxy-allowlist] blocked ${method} ${pathSegments.join("/")} (${gate.reason})`)
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  try {
    // Only GET reference lists go through the durable Data Cache.
    if (method === "GET" && isMediaDetailsReferenceListPath(path)) {
      const incoming = new URL(request.url)
      const cached = await getCachedMediaDetailsReference(
        path,
        incoming.searchParams
      )
      if ((cached.contentType || "").includes("application/json")) {
        return NextResponse.json(cached.body, { status: cached.status })
      }
      return new NextResponse(
        typeof cached.body === "string" ? cached.body : String(cached.body ?? ""),
        {
          status: cached.status,
          headers: { "content-type": cached.contentType || "text/plain" },
        }
      )
    }

    return await proxyUncached(request, path, method)
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
