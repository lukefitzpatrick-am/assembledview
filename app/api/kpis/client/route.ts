import { NextRequest, NextResponse } from "next/server"
import {
  createClientKpi,
  deleteClientKpi,
  fetchClientKpis,
  updateClientKpi,
} from "@/lib/kpi/clientKpi"
import { clientKpiCreateBodySchema, clientKpiPatchBodySchema } from "@/lib/kpi/types"
import type { ClientKpiInput } from "@/lib/kpi/types"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
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
  try {
    const body = await request.json()
    const parsed = clientKpiCreateBodySchema.safeParse(body)
    if (!parsed.success) {
      const msg =
        parsed.error.issues.map((i) => i.message).join("; ") || "Validation failed"
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    const input: ClientKpiInput = { ...parsed.data } as ClientKpiInput
    const result = await createClientKpi(input)
    if (result === null) {
      return NextResponse.json(
        { error: "Failed to create client KPI" },
        { status: 500 },
      )
    }
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error("POST /api/kpis/client:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = clientKpiPatchBodySchema.safeParse(body)
    if (!parsed.success) {
      const msg =
        parsed.error.issues.map((i) => i.message).join("; ") || "Validation failed"
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    const { id, ...rest } = parsed.data
    const result = await updateClientKpi(id, rest as Partial<ClientKpiInput>)
    if (result === null) {
      return NextResponse.json(
        { error: "Failed to update client KPI" },
        { status: 500 },
      )
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("PATCH /api/kpis/client:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id")
    if (id === null || id.trim() === "") {
      return NextResponse.json({ error: "id is required" }, { status: 400 })
    }
    const ok = await deleteClientKpi(Number(id))
    if (!ok) {
      return NextResponse.json(
        { error: "Failed to delete client KPI" },
        { status: 500 },
      )
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("DELETE /api/kpis/client:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
