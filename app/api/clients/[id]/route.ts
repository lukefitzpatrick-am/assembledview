import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/requireRole"
import { updateClientPostgresFirst } from "@/lib/data/writeClients"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireRole(req, ["admin"])
    if ("response" in gate) return gate.response

    const { id } = await params
    const body = (await req.json()) as Record<string, unknown>
    const result = await updateClientPostgresFirst(id, body, "update")
    if ("notFound" in result) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 })
    }
    return NextResponse.json(result.row)
  } catch (error) {
    console.error("Failed to update client:", error)
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireRole(req, ["admin"])
    if ("response" in gate) return gate.response

    const { id } = await params
    const body = (await req.json()) as Record<string, unknown>
    const result = await updateClientPostgresFirst(id, body, "patch")
    if ("notFound" in result) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 })
    }
    return NextResponse.json(result.row)
  } catch (error) {
    console.error("Failed to patch client:", error)
    return NextResponse.json({ error: "Failed to patch client" }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // SEC-19: admin only, the same gate as PUT and PATCH. The row is the full
    // client record (brain, fees, ad serving rates, is_test_client), so a
    // client user (own id or any other) and a signed-in user with no role get
    // 403. No client page calls this route. See docs/brain/API-DYNAMIC-ROUTE-GATES.md.
    const gate = await requireRole(request, ["admin"])
    if ("response" in gate) {
      const status = gate.response.status === 401 ? 401 : 403
      return NextResponse.json(
        { error: status === 401 ? "unauthorised" : "forbidden" },
        { status }
      )
    }

    const { id } = await params
    const { readClientById } = await import("@/lib/data/readClients")
    const result = await readClientById(id)
    if (result.status >= 400) {
      return NextResponse.json(
        typeof result.body === "object" && result.body
          ? result.body
          : { error: "Failed to fetch client" },
        { status: result.status >= 400 ? result.status : 500 }
      )
    }
    return NextResponse.json(result.body)
  } catch (error) {
    console.error("Failed to fetch client:", error)
    return NextResponse.json(
      { error: "Failed to fetch client" },
      { status: 500 }
    )
  }
}
