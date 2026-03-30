import { NextRequest, NextResponse } from "next/server"
import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"
import {
  fetchFinanceForecastSnapshotLinesFromXano,
  isSnapshotStorageConfigured,
} from "@/lib/finance/forecast/snapshot/xanoSnapshotQuery"

export const dynamic = "force-dynamic"
export const revalidate = 0

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init)
  res.headers.set("Cache-Control", "no-store, max-age=0")
  return res
}

function canAccessSnapshots(roles: string[]): boolean {
  return roles.includes("admin")
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth0.getSession(request)
  if (!session?.user) {
    return noStore({ error: "unauthorised" }, { status: 401 })
  }

  const roles = getUserRoles(session.user)
  if (!canAccessSnapshots(roles)) {
    return noStore({ error: "forbidden" }, { status: 403 })
  }

  const { id } = await ctx.params
  if (!id?.trim()) {
    return noStore({ error: "bad_request", message: "Missing snapshot id." }, { status: 400 })
  }

  if (!isSnapshotStorageConfigured()) {
    return noStore({ lines: [], configured: false })
  }

  try {
    const lines = await fetchFinanceForecastSnapshotLinesFromXano(id.trim())
    return noStore({ lines, configured: true })
  } catch (err) {
    console.error("[api/finance/forecast/snapshots/[id]/lines] GET failed", err)
    return noStore(
      { error: "lines_failed", message: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    )
  }
}
