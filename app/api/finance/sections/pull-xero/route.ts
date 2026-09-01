import { NextRequest, NextResponse } from "next/server"
import { requireFinanceAdmin } from "@/lib/requireRole"
import { checkPullXeroRateLimit } from "@/lib/finance/sections/pullXeroRateLimit"
import { runPullXero } from "@/lib/finance/sections/pullXero"

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

  const userKey =
    (typeof gate.session?.user?.sub === "string" && gate.session.user.sub) ||
    (typeof gate.session?.user?.email === "string" && gate.session.user.email) ||
    "unknown"

  const limit = await checkPullXeroRateLimit(userKey)
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited", retry_after_seconds: limit.retryAfterSeconds },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      }
    )
  }

  try {
    const result = await runPullXero({ pulledBy: userKey })
    return NextResponse.json(result)
  } catch (error) {
    console.error("[finance/sections/pull-xero]", error)
    return NextResponse.json({ error: "Failed to pull from Xero" }, { status: 500 })
  }
}
