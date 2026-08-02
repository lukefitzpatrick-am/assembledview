import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/requireRole"
import { readScopeOfWork } from "@/lib/data/readFinance"
import { createScopeOfWork } from "@/lib/data/writeScopeOfWork"

export async function GET(req: NextRequest) {
  try {
    const gate = await requireRole(req, ["admin"])
    if ("response" in gate) return gate.response

    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status")

    const data = await readScopeOfWork({ projectStatus: status })

    return NextResponse.json(data)
  } catch (error) {
    console.error("Failed to fetch scopes of work:", error)
    return NextResponse.json(
      { error: "Failed to fetch scopes of work" },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireRole(req, ["admin"])
    if ("response" in gate) return gate.response

    const body = await req.json()

    const requiredFields = [
      "client_name",
      "contact_name",
      "contact_email",
      "scope_date",
      "scope_version",
      "project_name",
      "project_status",
    ]

    const missingFields = requiredFields.filter((field) => !body[field])

    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: "Missing required fields", details: missingFields },
        { status: 400 }
      )
    }

    const created = await createScopeOfWork({
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

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    console.error("Failed to create scope of work:", error)
    return NextResponse.json(
      {
        error: "Failed to create scope of work",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
