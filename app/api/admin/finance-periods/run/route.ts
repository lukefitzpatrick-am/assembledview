import { NextRequest, NextResponse } from "next/server"

import { requireRole } from "@/lib/requireRole"
import { isFinancePeriodsEnabled } from "@/lib/finance/periods/flag"
import { executeFinanceRun } from "@/lib/finance/periods/orchestrate"
import { resolveInjectedNow } from "@/lib/finance/periods/sydneyClock"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/** Admin "Run now" — idempotent re-execute for a period month. */
export async function POST(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  if (!isFinancePeriodsEnabled()) {
    return NextResponse.json(
      {
        code: "FINANCE_PERIODS_OFF",
        error:
          "FINANCE_PERIODS is off. Run and lock stay disabled until the flag is shadow or on.",
      },
      { status: 409 }
    )
  }

  const body = (await request.json().catch(() => ({}))) as {
    periodMonth?: string
    now?: string
  }
  const now = body.now ? new Date(body.now) : resolveInjectedNow(request)
  try {
    const result = await executeFinanceRun({
      periodMonth: body.periodMonth,
      now,
    })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
