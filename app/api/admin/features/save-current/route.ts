import { NextResponse, type NextRequest } from "next/server"

import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { saveCurrentFeatureValues } from "@/lib/features/server"
import { requireAdmin, requireFinanceAdmin } from "@/lib/requireRole"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST: saves a row for every /admin/features switch that has none, at the
 * value it has now (its env var or default), so no page switch reads an env
 * var any more (B7, G9). No body. Admin, and finance admin because finance
 * switches are among them. 409 until SQL 0111 is run.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request)
  if ("response" in admin) return admin.response
  const finance = await requireFinanceAdmin(request)
  if ("response" in finance) return finance.response
  try {
    const user = await getCurrentUser(request)
    const out = await saveCurrentFeatureValues({
      actor: { id: user?.id ?? null, name: user?.name || user?.email || null },
    })
    if (!out.ok) return NextResponse.json({ error: out.code, message: out.message }, { status: out.status })
    return NextResponse.json(out)
  } catch (error) {
    console.error("POST /api/admin/features/save-current", error)
    return NextResponse.json({ error: "Could not save the switches." }, { status: 500 })
  }
}
