import { NextRequest, NextResponse } from "next/server"

import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import { failStaleGeneratingReads, listCampaignReadsForMba } from "@/lib/campaign-read/repo"
import { requireAdmin } from "@/lib/requireRole"

export const dynamic = "force-dynamic"

function asInt(raw: string | null): number | undefined {
  if (!raw?.trim()) return undefined
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return undefined
  return Math.floor(n)
}

/**
 * GET /api/campaign-reads?mba=&version=
 * Latest published for anyone entitled to the dashboard.
 * Latest draft + history when the caller is admin.
 */
export async function GET(request: NextRequest) {
  const mba = request.nextUrl.searchParams.get("mba")?.trim()
    || request.nextUrl.searchParams.get("mbaNumber")?.trim()
  const version = asInt(
    request.nextUrl.searchParams.get("version")
      ?? request.nextUrl.searchParams.get("versionNumber"),
  )
  if (!mba || version == null) {
    return NextResponse.json(
      { error: "mba and version are required" },
      { status: 400 },
    )
  }

  const access = await checkClientMbaAccess(request, mba)
  if (!access.ok) return access.response

  const admin = await requireAdmin(request)
  const includeDrafts = !("response" in admin)

  try {
    await failStaleGeneratingReads()
    const payload = await listCampaignReadsForMba({
      mbaNumber: mba,
      versionNumber: version,
      includeDrafts,
    })
    return NextResponse.json(payload)
  } catch (err) {
    console.error("[api/campaign-reads] GET failed", err)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}
