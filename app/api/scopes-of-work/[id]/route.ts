import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/requireRole"
import {
  fetchScopeOfWorkByIdFromPostgres,
  updateScopeOfWork,
} from "@/lib/data/writeScopeOfWork"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requireRole(request, ["admin"])
    if ("response" in gate) return gate.response

    const { id } = await params
    const rowId = Number(id)
    if (!Number.isFinite(rowId) || rowId <= 0) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 })
    }

    const row = await fetchScopeOfWorkByIdFromPostgres(rowId)
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    return NextResponse.json(row)
  } catch (error) {
    console.error("Failed to fetch scope of work:", error)
    return NextResponse.json(
      { error: "Failed to fetch scope of work" },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requireRole(request, ["admin"])
    if ("response" in gate) return gate.response

    const { id } = await params
    const rowId = Number(id)
    if (!Number.isFinite(rowId) || rowId <= 0) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 })
    }

    const body = await request.json()
    const updated = await updateScopeOfWork(rowId, {
      client_name: body.client_name,
      contact_name: body.contact_name,
      contact_email: body.contact_email,
      scope_date: body.scope_date,
      scope_version: body.scope_version,
      project_name: body.project_name,
      project_status: body.project_status,
      project_overview: body.project_overview || "",
      deliverables: body.deliverables || "",
      tasks_steps: body.tasks_steps || "",
      timelines: body.timelines || "",
      responsibilities: body.responsibilities || "",
      requirements: body.requirements || "",
      assumptions: body.assumptions || "",
      exclusions: body.exclusions || "",
      cost: body.cost || [],
      payment_terms_and_conditions: body.payment_terms_and_conditions || "",
      billing_schedule: body.billing_schedule ?? null,
      scope_id: body.scope_id || "",
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Failed to update scope of work:", error)
    return NextResponse.json(
      {
        error: "Failed to update scope of work",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
