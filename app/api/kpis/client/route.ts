import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/requireRole"
import {
  createClientKpi,
  deleteClientKpi,
  fetchClientKpis,
  updateClientKpi,
} from "@/lib/kpi/clientKpi"
import {
  handleClientKpiDelete,
  handleClientKpiPatch,
  handleClientKpiPost,
  mapKpiWriteCatch,
  readKpiJsonRequest,
} from "@/lib/kpi/kpiWriteHandlers"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  // Staff residual (PS-1): create/edit consume this via lib/api/kpi.ts.
  // Gate must match SEC-A writes — not tighter. `manager` was removed from
  // UserRole (31 Jul 2026); staff = admin until a real manager role returns.
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  try {
    const mpClientName = request.nextUrl.searchParams.get("mp_client_name")
    if (!mpClientName?.trim()) {
      return NextResponse.json(
        { error: "mp_client_name is required" },
        { status: 400 },
      )
    }
    const data = await fetchClientKpis(mpClientName)
    return NextResponse.json(data)
  } catch (error) {
    console.error("GET /api/kpis/client:", error)
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
    const result = await handleClientKpiPost(json.data, {
      create: createClientKpi,
    })
    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    console.error("POST /api/kpis/client:", error)
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
    const result = await handleClientKpiPatch(json.data, {
      update: updateClientKpi,
    })
    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    console.error("PATCH /api/kpis/client:", error)
    const mapped = mapKpiWriteCatch(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}

export async function DELETE(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  try {
    const result = await handleClientKpiDelete(
      request.nextUrl.searchParams.get("id"),
      { delete: deleteClientKpi },
    )
    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    console.error("DELETE /api/kpis/client:", error)
    const mapped = mapKpiWriteCatch(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}
