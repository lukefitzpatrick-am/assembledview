import { NextRequest, NextResponse } from "next/server"

import { builderGate } from "@/lib/webReport/builder/access"
import { resolveBuilderClient } from "@/lib/webReport/builder/repo"
import { KpiMigrationError, KpiNotFoundError, deactivateKpi, setTargets, upsertKpi } from "@/lib/webReport/kpis/repo"
import { parseKpiRequest } from "@/lib/webReport/kpis/request"
import { KpiInputError } from "@/lib/webReport/kpis/types"
import { loadKpiEditor } from "@/lib/webReport/kpis/warehouse"
import { auth0 } from "@/lib/auth0"
import { sydneyYmdFromUtcInstant } from "@/lib/myhours/sydneyWeek"
import { requireRole } from "@/lib/requireRole"

export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ slug: string }> }

const NEEDS_MIGRATION = "Web KPIs need migration 0101"

function actorEmail(session: { user?: { email?: string | null } } | null | undefined): string {
  const email = session?.user?.email
  return typeof email === "string" && email.trim() ? email.trim() : "unknown"
}

/** Admin only. Clients see KPIs in the report but never reach this route. */
async function authorise(
  req: NextRequest,
  context: RouteContext,
): Promise<{ response: NextResponse } | { client: { clientId: number; clientName: string }; actor: string }> {
  const session = await auth0.getSession(req)
  const gate = builderGate(session?.user)
  if (gate === "login") return { response: NextResponse.json({ error: "unauthorised" }, { status: 401 }) }
  if (gate === "not_found") return { response: NextResponse.json({ error: "Not found" }, { status: 404 }) }
  const auth = await requireRole(req, ["admin"])
  if ("response" in auth) return { response: auth.response }
  const { slug } = await context.params
  const client = await resolveBuilderClient(slug)
  if (!client) return { response: NextResponse.json({ error: "Not found" }, { status: 404 }) }
  return { client, actor: actorEmail(auth.session) }
}

export async function GET(req: NextRequest, context: RouteContext) {
  const access = await authorise(req, context)
  if ("response" in access) return access.response
  try {
    const today = sydneyYmdFromUtcInstant(new Date())
    const editor = await loadKpiEditor(access.client.clientId, today)
    return NextResponse.json({ today, ...editor })
  } catch (err) {
    console.error("[web-kpis]", err)
    return NextResponse.json({ error: "KPIs could not be loaded" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  const access = await authorise(req, context)
  if ("response" in access) return access.response
  const { client, actor } = access

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const parsed = parseKpiRequest(payload)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const body = parsed.body

  try {
    if (body.action === "upsert") {
      const kpi = await upsertKpi({ ...body.kpi, clientId: client.clientId }, actor)
      return NextResponse.json({ kpi })
    }
    if (body.action === "targets") {
      const targets = await setTargets(body.kpiId, client.clientId, body.targets, actor)
      return NextResponse.json({ targets })
    }
    const done = await deactivateKpi(body.kpiId, client.clientId, actor)
    if (!done) return NextResponse.json({ error: "KPI not found" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof KpiMigrationError) return NextResponse.json({ error: NEEDS_MIGRATION }, { status: 409 })
    if (err instanceof KpiNotFoundError) return NextResponse.json({ error: "KPI not found" }, { status: 404 })
    if (err instanceof KpiInputError) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error("[web-kpis]", err)
    return NextResponse.json({ error: "The KPI could not be saved" }, { status: 500 })
  }
}
