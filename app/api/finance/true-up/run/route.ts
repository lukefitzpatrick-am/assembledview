import { NextResponse, type NextRequest } from "next/server"

import { runTrueUpMonthly } from "@/lib/finance/trueUp/monthlyRun"
import { gateTrueUpRoute, readJsonBody } from "@/lib/finance/trueUp/routeGate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * POST { asOf? } (finance admin, TRUE_UP_ACTIONS). Runs the true-up now:
 * saves a true_up_runs row and emails the summary to OPS_EMAIL_TO. No plan changes.
 */
export async function POST(request: NextRequest) {
  const gate = await gateTrueUpRoute(request)
  if ("response" in gate) return gate.response
  try {
    const body = await readJsonBody(request)
    const result = await runTrueUpMonthly({
      source: "manual",
      asOfMonth: typeof body?.asOf === "string" ? body.asOf : undefined,
      actor: { teamMemberId: gate.actor.teamMemberId, name: gate.actor.name },
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error("POST /api/finance/true-up/run", error)
    return NextResponse.json({ error: "server_error", message: "Could not run the true-up." }, { status: 500 })
  }
}
