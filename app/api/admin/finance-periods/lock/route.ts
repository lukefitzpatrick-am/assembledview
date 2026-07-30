import { NextRequest, NextResponse } from "next/server"

import { requireRole } from "@/lib/requireRole"
import { executeFinanceLock } from "@/lib/finance/periods/orchestrate"
import { resolveInjectedNow } from "@/lib/finance/periods/sydneyClock"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/** Admin "Lock now" override. */
export async function POST(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  const body = (await request.json().catch(() => ({}))) as {
    periodMonth?: string
    now?: string
  }
  const now = body.now ? new Date(body.now) : resolveInjectedNow(request)
  const lockedBy = gate.session?.user?.email || gate.session?.user?.name || "admin"
  try {
    const result = await executeFinanceLock({
      periodMonth: body.periodMonth,
      lockedBy: String(lockedBy),
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
