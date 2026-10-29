import { NextResponse, type NextRequest } from "next/server"

import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { buildFeaturePageModel } from "@/lib/features/pageModel"
import { featureDefinition } from "@/lib/features/registry"
import { readFeatureStates, readFeatureSwitchEvents, setFeatureSwitch } from "@/lib/features/server"
import { requireAdmin, requireFinanceAdmin } from "@/lib/requireRole"
import { signingKeySource } from "@/lib/security/signingSecret"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET: every feature switch (value, where it comes from, last change), the
 * change history and the signing key status. Admins only.
 * POST { key, enabled, note? }: sets a switch. Admins; finance switches need
 * finance admin. 409 until SQL 0111 is run. Takes effect on this instance at
 * once and on the others within a minute.
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request)
  if ("response" in gate) return gate.response
  try {
    // requireFinanceAdmin is the same admin role check today (lib/requireRole.ts),
    // so an admin may toggle finance switches too. Kept separate so it can narrow.
    const financeAdmin = true
    const [{ ready, states }, events] = await Promise.all([readFeatureStates(), readFeatureSwitchEvents(50)])
    return NextResponse.json({
      ready,
      groups: buildFeaturePageModel({ ready, states, roles: { admin: true, financeAdmin } }),
      events,
      signing: [
        { purpose: "view-as", label: "View as client", source: signingKeySource("view-as") },
        { purpose: "billing-revision-preview", label: "Billing revision and true-up previews", source: signingKeySource("billing-revision-preview") },
      ],
    })
  } catch (error) {
    console.error("GET /api/admin/features", error)
    return NextResponse.json({ error: "Could not load the feature switches." }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  let body: { key?: unknown; enabled?: unknown; note?: unknown } | null
  try {
    body = (await request.json()) as typeof body
  } catch {
    body = null
  }
  const key = typeof body?.key === "string" ? body.key : ""
  const def = featureDefinition(key)
  // Role first, so a non-admin learns nothing about the keys.
  const gate = def?.toggleRole === "finance_admin" ? await requireFinanceAdmin(request) : await requireAdmin(request)
  if ("response" in gate) return gate.response
  if (!def || typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: "bad_request", message: "Send key and enabled (true or false)." }, { status: 400 })
  }
  if (body.note != null && typeof body.note !== "string") {
    return NextResponse.json({ error: "bad_request", message: "note must be text." }, { status: 400 })
  }
  try {
    const user = await getCurrentUser(request)
    const out = await setFeatureSwitch({
      key,
      enabled: body.enabled,
      note: typeof body.note === "string" ? body.note : null,
      actor: { id: user?.id ?? null, name: user?.name || user?.email || null },
    })
    if (!out.ok) return NextResponse.json({ error: out.code, message: out.message }, { status: out.status })
    return NextResponse.json(out)
  } catch (error) {
    console.error("POST /api/admin/features", error)
    return NextResponse.json({ error: "Could not change the switch." }, { status: 500 })
  }
}
