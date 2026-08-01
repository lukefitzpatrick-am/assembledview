import { NextRequest, NextResponse } from "next/server"
import { createChannelLineItemsGetHandler } from "@/lib/api/channelLineItemsGetHandler"
import { isChannelLineItemEndpoint } from "@/lib/api/fetchChannelLineItemsByMba"
import { getDataBackendFor } from "@/lib/data/backend"
import { xanoAuthHeader, xanoUrl } from "@/lib/api/xano"
import { requireRole } from "@/lib/requireRole"
import { checkMediaPlansProxyPath } from "@/lib/security/proxyAllowlist"
import { logProxy403 } from "@/lib/security/logProxy403"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

type Ctx = { params: Promise<{ path: string[] }> }

/** SEC-1 / SEC-D: catch-all is staff-only — no client-reachable consumer. */
async function requireProxyStaff(request: Request, proxyPath: string) {
  const gate = await requireRole(request as NextRequest, ["admin"])
  if ("response" in gate) {
    if (gate.response.status === 403) {
      await logProxy403(request, proxyPath)
    }
    return gate.response
  }
  return null
}

async function proxy(request: Request, ctx: Ctx) {
  const { path: parts } = await ctx.params
  const pathSegments = parts || []
  const path = pathSegments.join("/")
  if (!path) {
    return NextResponse.json({ error: "Missing media plan path" }, { status: 400 })
  }

  const gate = checkMediaPlansProxyPath(pathSegments, request.method)
  if (!gate.allowed) {
    console.warn(`[proxy-allowlist] blocked ${request.method} ${pathSegments.join("/")} (${gate.reason})`)
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const targetBase = xanoUrl(path, ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])
  const incoming = new URL(request.url)
  const url = new URL(targetBase)
  incoming.searchParams.forEach((value, key) => url.searchParams.set(key, value))

  const init: RequestInit = {
    method: request.method,
    headers: {
      "Content-Type": request.headers.get("content-type") || "application/json",
      ...xanoAuthHeader(),
    },
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
  }

  const upstream = await fetch(url.toString(), init)
  const text = await upstream.text()

  if (!upstream.ok) {
    console.error("[api/media_plans/[...path]] upstream error", {
      path,
      method: request.method,
      url: url.toString(),
      status: upstream.status,
      body: text,
    })
    return NextResponse.json({ error: "Media plan request failed" }, { status: upstream.status })
  }

  const contentType = upstream.headers.get("content-type") || ""
  if (contentType.includes("application/json")) {
    return NextResponse.json(JSON.parse(text), { status: upstream.status })
  }

  return new NextResponse(text, {
    status: upstream.status,
    headers: { "content-type": contentType || "text/plain" },
  })
}

/** Plan master / version GETs honor DATA_BACKEND_PLANS (shadow serves Xano + async diff). */
async function handlePlansDomainGet(request: Request, path: string): Promise<Response | null> {
  const backend = getDataBackendFor("plans")
  if (backend === "xano") return null

  const mbaNumber = new URL(request.url).searchParams.get("mba_number")

  if (
    path === "media_plan_master" ||
    path === "media_plans_master" ||
    path === "media_plan"
  ) {
    const { readPlanMasters, readPlanMasterByMba } = await import("@/lib/data/readMediaPlans")
    if (mbaNumber) {
      const row = await readPlanMasterByMba(mbaNumber)
      return NextResponse.json(row ? [row] : [])
    }
    return NextResponse.json(await readPlanMasters())
  }

  if (path === "media_plan_versions" || path === "media_plan_version") {
    const { readPlanVersions, readPlanVersionsByMba } = await import(
      "@/lib/data/readMediaPlans"
    )
    if (mbaNumber) {
      return NextResponse.json(await readPlanVersionsByMba(mbaNumber))
    }
    return NextResponse.json(await readPlanVersions())
  }

  return null
}

export async function GET(request: Request, context: Ctx) {
  const { path: parts } = await context.params
  const path = (parts || []).join("/")
  const denied = await requireProxyStaff(request, path || "media_plans")
  if (denied) return denied

  const mbaNumber = new URL(request.url).searchParams.get("mba_number")

  // Channel line-item GETs: FK-first (same as dedicated routes / MBA GET).
  // Skip proxy mba_number+version_number filters that miss skewed plans.
  if (path && isChannelLineItemEndpoint(path) && mbaNumber) {
    return createChannelLineItemsGetHandler(path, `CATCHALL_${path}`)(request)
  }

  const plansResponse = path ? await handlePlansDomainGet(request, path) : null
  if (plansResponse) return plansResponse

  return proxy(request, context)
}

export async function POST(request: Request, context: Ctx) {
  const { path: parts } = await context.params
  const denied = await requireProxyStaff(request, (parts || []).join("/") || "media_plans")
  if (denied) return denied
  return proxy(request, context)
}

export async function PUT(request: Request, context: Ctx) {
  const { path: parts } = await context.params
  const denied = await requireProxyStaff(request, (parts || []).join("/") || "media_plans")
  if (denied) return denied
  return proxy(request, context)
}

export async function DELETE(request: Request, context: Ctx) {
  const { path: parts } = await context.params
  const denied = await requireProxyStaff(request, (parts || []).join("/") || "media_plans")
  if (denied) return denied
  return proxy(request, context)
}
