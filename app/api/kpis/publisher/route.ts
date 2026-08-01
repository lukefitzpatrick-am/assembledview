import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/requireRole"
import { getCachedPublisherKpis } from "@/lib/api/publisherKpiCache"
import {
  createPublisherKpi,
  deletePublisherKpi,
  fetchPublisherKpis,
  updatePublisherKpi,
} from "@/lib/kpi/publisherKpi"
import {
  handlePublisherKpiDelete,
  handlePublisherKpiPatch,
  handlePublisherKpiPost,
  mapKpiWriteCatch,
  readKpiJsonRequest,
} from "@/lib/kpi/kpiWriteHandlers"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  // Staff residual (PS-1): create/edit load publishers via lib/api/kpi.ts.
  // Gate must match SEC-A writes — not tighter. `manager` was removed from
  // UserRole (31 Jul 2026); staff = admin until a real manager role returns.
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  try {
    const publisher = request.nextUrl.searchParams.get("publisher")
    if (publisher?.trim()) {
      const data = await fetchPublisherKpis(publisher)
      return NextResponse.json(data)
    }
    const { data, stale } = await getCachedPublisherKpis()
    const headers: Record<string, string> = {}
    if (stale) headers["x-warning"] = "served-stale-after-upstream-failure"
    return NextResponse.json(data, { headers })
  } catch (error) {
    console.error("GET /api/kpis/publisher:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  try {
    const json = await readKpiJsonRequest(request)
    if (!("ok" in json)) {
      return NextResponse.json(json.body, { status: json.status })
    }
    const result = await handlePublisherKpiPost(json.data, {
      create: createPublisherKpi,
    })
    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    console.error("POST /api/kpis/publisher:", error)
    const mapped = mapKpiWriteCatch(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}

export async function PATCH(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  try {
    const json = await readKpiJsonRequest(request)
    if (!("ok" in json)) {
      return NextResponse.json(json.body, { status: json.status })
    }
    const result = await handlePublisherKpiPatch(json.data, {
      update: updatePublisherKpi,
    })
    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    console.error("PATCH /api/kpis/publisher:", error)
    const mapped = mapKpiWriteCatch(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}

export async function DELETE(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  try {
    const result = await handlePublisherKpiDelete(
      request.nextUrl.searchParams.get("id"),
      { delete: deletePublisherKpi },
    )
    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    console.error("DELETE /api/kpis/publisher:", error)
    const mapped = mapKpiWriteCatch(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}
