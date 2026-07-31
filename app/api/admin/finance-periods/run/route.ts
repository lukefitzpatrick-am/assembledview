import { NextRequest, NextResponse } from "next/server"

import { requireRole } from "@/lib/requireRole"
import { executeFinanceRun } from "@/lib/finance/periods/orchestrate"
import { resolveInjectedNow } from "@/lib/finance/periods/sydneyClock"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/** Admin "Run now" — idempotent re-execute for a period month. */
export async function POST(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  const body = (await request.json().catch(() => ({}))) as {
    periodMonth?: string
    now?: string
  }
  const now = body.now ? new Date(body.now) : resolveInjectedNow(request)
  try {
    const result = await executeFinanceRun({
      periodMonth: body.periodMonth,
      now,
      force: true,
    })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
