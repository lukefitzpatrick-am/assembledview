import { NextRequest, NextResponse } from "next/server"
import { xanoUrl, xanoAuthHeader } from "@/lib/api/xano"
import { requireRole } from "@/lib/requireRole"
import { checkMediaDetailsProxyPath } from "@/lib/security/proxyAllowlist"
import { getDataBackend } from "@/lib/data/backend"
import { isReferenceTablePath } from "@/lib/data/referenceTables"
import { readReferenceMediaDetail } from "@/lib/data/readReferenceMediaDetail"

type Params = { params: Promise<{ path: string[] }> }

/** SEC-1 / SEC-D: catch-all is staff-only — no client dashboard consumer. */
async function requireProxyStaff(request: Request) {
  const gate = await requireRole(request as NextRequest, ["admin", "manager"])
  if ("response" in gate) return gate.response
  return null
}

async function proxyRequest(request: Request, { params }: Params, method: string) {
  const denied = await requireProxyStaff(request)
  if (denied) return denied

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

  // Reference-table GETs honor DATA_BACKEND=xano|shadow|postgres (default xano).
  if (method === "GET" && pathSegments.length === 1 && isReferenceTablePath(pathSegments[0])) {
    try {
      const result = await readReferenceMediaDetail(pathSegments[0])
      if (typeof result.body === "string") {
        return new NextResponse(result.body, {
          status: result.status,
          headers: { "content-type": result.contentType || "text/plain" },
        })
      }
      return NextResponse.json(result.body, { status: result.status })
    } catch (error: any) {
      console.error("[media-details reference read] error", {
        path: pathSegments[0],
        backend: getDataBackend(),
        error,
      })
      return NextResponse.json(
        {
          error: "Failed to read media details reference data",
          details: error?.message || "Unknown error",
        },
        { status: 500 }
      )
    }
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

    // REVIEW: Route handler proxy — server-only; auth from process.env via xanoAuthHeader().
    const upstream = await fetch(url.toString(), {
      method,
      headers: {
        "Content-Type": request.headers.get("content-type") || "application/json",
        ...xanoAuthHeader(),
      },
      body: body && body.length > 0 ? body : undefined,
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
      headers: { "content-type": contentType || "text/plain" },
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
