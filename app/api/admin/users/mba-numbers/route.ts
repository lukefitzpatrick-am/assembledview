import { NextRequest, NextResponse } from "next/server"
import { campaignsForClientFromPlans } from "@/lib/codex/clientMbas"
import { parseXanoListPayload } from "@/lib/api/xano"
import { readClientsList } from "@/lib/data/readClients"
import { readPlanMasters } from "@/lib/data/readMediaPlans"
import { requireAdmin } from "@/lib/requireRole"

export const runtime = "nodejs"

/**
 * GET /api/admin/users/mba-numbers?slugs=golf-australia,pga-australia
 * MBA numbers on media_plan_masters for the selected client slugs.
 */
export async function GET(request: NextRequest) {
  const sessionResult = await requireAdmin(request)
  if ("response" in sessionResult) return sessionResult.response

  const slugs = String(new URL(request.url).searchParams.get("slugs") ?? "")
    .split(",")
    .map((slug) => slug.trim().toLowerCase())
    .filter(Boolean)

  if (slugs.length === 0) {
    return NextResponse.json({ campaigns: [], mba_numbers: [] })
  }

  const clientsResult = await readClientsList()
  if (clientsResult.status < 200 || clientsResult.status >= 300) {
    return NextResponse.json({ error: "Failed to load clients" }, { status: 500 })
  }

  const rows = parseXanoListPayload(clientsResult.body)
  const slugToId = new Map<string, number>()
  for (const row of rows) {
    if (!row || typeof row !== "object") continue
    const rec = row as Record<string, unknown>
    const slug = String(rec.slug ?? "").trim().toLowerCase()
    const id = Number(rec.id)
    if (!slug || !Number.isFinite(id) || id < 1) continue
    slugToId.set(slug, id)
  }

  for (const slug of slugs) {
    if (!slugToId.has(slug)) {
      return NextResponse.json({ error: "unknown client slug" }, { status: 400 })
    }
  }

  try {
    const masters = await readPlanMasters()
    const seen = new Set<string>()
    const campaigns = slugs.flatMap((slug) => {
      const clientId = slugToId.get(slug)
      if (!clientId) return []
      return campaignsForClientFromPlans(masters, clientId).filter((campaign) => {
        const key = campaign.mba_number.trim().toLowerCase()
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })
    })

    return NextResponse.json({
      campaigns,
      mba_numbers: campaigns.map((campaign) => campaign.mba_number.trim().toLowerCase()),
    })
  } catch (error) {
    console.error("[admin/users/mba-numbers] failed", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list campaigns" },
      { status: 500 },
    )
  }
}
