import { NextRequest, NextResponse } from "next/server"
import {
  createClientKpi,
  deleteClientKpi,
  fetchClientKpis,
  updateClientKpi,
} from "@/lib/clients/clientKpi"
import type { ClientKpiInput } from "@/lib/types/clientKpi"

export const runtime = "nodejs"

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

export async function GET(request: NextRequest) {
  try {
    const mpClientName = request.nextUrl.searchParams.get("mp_client_name")
    if (!mpClientName?.trim()) {
      return NextResponse.json({ error: "mp_client_name is required" }, { status: 400 })
    }
    const data = await fetchClientKpis(mpClientName)
    return NextResponse.json(data)
  } catch (error) {
    console.error("GET /api/client-kpis:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>
    if (
      !isNonEmptyString(body.mp_client_name) ||
      !isNonEmptyString(body.publisher_name) ||
      !isNonEmptyString(body.media_type)
    ) {
      return NextResponse.json(
        { error: "mp_client_name, publisher_name, and media_type are required non-empty strings" },
        { status: 400 }
      )
    }
    const input = body as unknown as ClientKpiInput
    const result = await createClientKpi(input)
    if (result === null) {
      return NextResponse.json({ error: "Failed to create client KPI" }, { status: 500 })
    }
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error("POST /api/client-kpis:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown> & { id?: unknown }
    const { id, ...rest } = body
    if (id === undefined || id === null) {
      return NextResponse.json({ error: "id is required" }, { status: 400 })
    }
    const idNum = typeof id === "number" ? id : Number(id)
    if (!Number.isFinite(idNum)) {
      return NextResponse.json({ error: "id is required" }, { status: 400 })
    }
    const result = await updateClientKpi(idNum, rest as Partial<ClientKpiInput>)
    if (result === null) {
      return NextResponse.json({ error: "Failed to update client KPI" }, { status: 500 })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("PATCH /api/client-kpis:", error)
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
      return NextResponse.json({ error: "Failed to delete client KPI" }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("DELETE /api/client-kpis:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
