import { NextRequest, NextResponse } from "next/server"
import { auth0 } from "@/lib/auth0"
import { fetchXanoClientRowByUrlSlug } from "@/lib/clients/fetchClientRowByUrlSlug"
import { requireRole } from "@/lib/requireRole"
import { getUserRoles, getUserClientIdentifier } from "@/lib/rbac"
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
    return NextResponse.json({ ...result.row, mirror: result.mirror })
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
    return NextResponse.json({ ...result.row, mirror: result.mirror })
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
    // SEC-G / SEC-10: intentional split vs collection GET requireRole(admin).
    // Admin (and other non-client sessions) may read any id; client-role is
    // own-id only. Do not apply collection requireRole here — it breaks client
    // self-read. See docs/brain/API-DYNAMIC-ROUTE-GATES.md.
    const session = await auth0.getSession(request)
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorised" }, { status: 401 })
    }

    const { id } = await params
    const roles = getUserRoles(session.user)

    // AuthZ: client-role users may only read their own client id (IDOR guard).
    if (roles.includes("client")) {
      const slug = getUserClientIdentifier(session.user)
      if (!slug) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 })
      }
      const ownRow = await fetchXanoClientRowByUrlSlug(slug)
      const ownId = ownRow?.id != null ? String(ownRow.id) : null
      if (!ownId || ownId !== String(id)) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 })
      }
    }

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
