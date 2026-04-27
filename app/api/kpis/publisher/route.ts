import { NextRequest, NextResponse } from "next/server"
import {
  createPublisherKpi,
  deletePublisherKpi,
  fetchAllPublisherKpis,
  fetchPublisherKpis,
  updatePublisherKpi,
} from "@/lib/kpi/publisherKpi"
import {
  publisherKpiCreateBodySchema,
  publisherKpiPatchBodySchema,
} from "@/lib/kpi/types"
import type { PublisherKpiInput } from "@/lib/kpi/types"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const publisher = request.nextUrl.searchParams.get("publisher")
    if (publisher?.trim()) {
      const data = await fetchPublisherKpis(publisher)
      return NextResponse.json(data)
    }
    const all = await fetchAllPublisherKpis()
    return NextResponse.json(all)
  } catch (error) {
    console.error("GET /api/kpis/publisher:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = publisherKpiCreateBodySchema.safeParse(body)
    if (!parsed.success) {
      const msg =
        parsed.error.issues.map((i) => i.message).join("; ") || "Validation failed"
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    const input: PublisherKpiInput = { ...parsed.data }
    const result = await createPublisherKpi(input)
    if (result === null) {
      return NextResponse.json(
        { error: "Failed to create publisher KPI" },
        { status: 500 },
      )
    }
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error("POST /api/kpis/publisher:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = publisherKpiPatchBodySchema.safeParse(body)
    if (!parsed.success) {
      const msg =
        parsed.error.issues.map((i) => i.message).join("; ") || "Validation failed"
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    const { id, ...rest } = parsed.data
    const result = await updatePublisherKpi(
      id,
      rest as Partial<PublisherKpiInput>,
    )
    if (result === null) {
      return NextResponse.json(
        { error: "Failed to update publisher KPI" },
        { status: 500 },
      )
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("PATCH /api/kpis/publisher:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id")
    if (id === null || id.trim() === "") {
      return NextResponse.json({ error: "id is required" }, { status: 400 })
    }
    const ok = await deletePublisherKpi(Number(id))
    if (!ok) {
      return NextResponse.json(
        { error: "Failed to delete publisher KPI" },
        { status: 500 },
      )
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("DELETE /api/kpis/publisher:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
