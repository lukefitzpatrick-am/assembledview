import { NextRequest, NextResponse } from "next/server"
import {
  getCachedClientsList,
} from "@/lib/cache/clientsCache"
import { requireRole } from "@/lib/requireRole"
import {
  createClientPostgresFirst,
} from "@/lib/data/writeClients"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  try {
    const url = new URL(request.url)
    const refreshRaw = url.searchParams.get("refresh")
    const bypassCache = refreshRaw === "1" || refreshRaw === "true" || refreshRaw === "yes"

    const { data, stale } = await getCachedClientsList({ bypassCache })
    const headers: Record<string, string> = {}
    if (stale) headers["x-warning"] = "served-stale-after-upstream-failure"
    return NextResponse.json(data, { headers })
  } catch (error) {
    console.error("Failed to fetch clients:", error)
    // Fail soft with empty list so the sidebar doesn't break admin UI.
    return NextResponse.json([], { status: 200, headers: { "x-warning": "clients-unavailable" } })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, ["admin"])
  if ("response" in gate) return gate.response

  try {
    const body = (await req.json()) as Record<string, unknown>
    const { row, mirror } = await createClientPostgresFirst(body)
    return NextResponse.json(
      { ...row, mirror },
      { status: 201 }
    )
  } catch (error) {
    console.error("Failed to create client:", error)
    const message = error instanceof Error ? error.message : String(error)
    if (message.startsWith("Missing required fields")) {
      const details = message.replace(/^Missing required fields:\s*/, "").split(", ")
      return NextResponse.json(
        { error: "Missing required fields", details },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: "Failed to create client", message },
      { status: 500 }
    )
  }
}
