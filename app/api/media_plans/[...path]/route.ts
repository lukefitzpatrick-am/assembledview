import { NextRequest, NextResponse } from "next/server"
import { createChannelLineItemsGetHandler } from "@/lib/api/channelLineItemsGetHandler"
import { resolveChannelLineItemEndpoint } from "@/lib/api/fetchChannelLineItemsByMba"
import { requireRole } from "@/lib/requireRole"
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

/** Plan master / version GETs from Postgres. */
async function handlePlansDomainGet(request: Request, path: string): Promise<Response | null> {
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
  // Resolve kebab URL segments to media_plan_* so a missing dedicated route
  // still hits postgres instead of proxying Xano (admin gate still applies).
  const channelEndpoint = path ? resolveChannelLineItemEndpoint(path) : null
  if (channelEndpoint && mbaNumber) {
    return createChannelLineItemsGetHandler(channelEndpoint, `CATCHALL_${channelEndpoint}`)(request)
  }

  const plansResponse = path ? await handlePlansDomainGet(request, path) : null
  if (plansResponse) return plansResponse

  return NextResponse.json(
    { error: "This media_plans path has no Postgres handler", path },
    { status: 410 }
  )
}

function goneResponse(path: string) {
  return NextResponse.json(
    {
      error:
        "This media_plans path has no Postgres handler. Channel writes use POST /api/plans/save.",
      path,
    },
    { status: 410 }
  )
}

export async function POST(request: Request, context: Ctx) {
  const { path: parts } = await context.params
  const path = (parts || []).join("/")
  const denied = await requireProxyStaff(request, path || "media_plans")
  if (denied) return denied
  return goneResponse(path)
}

export async function PUT(request: Request, context: Ctx) {
  const { path: parts } = await context.params
  const path = (parts || []).join("/")
  const denied = await requireProxyStaff(request, path || "media_plans")
  if (denied) return denied
  return goneResponse(path)
}

export async function DELETE(request: Request, context: Ctx) {
  const { path: parts } = await context.params
  const path = (parts || []).join("/")
  const denied = await requireProxyStaff(request, path || "media_plans")
  if (denied) return denied
  return goneResponse(path)
}
