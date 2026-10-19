import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { runBillingPartnerReminders } from "@/lib/finance/billingPartner/reminders"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 120
export const preferredRegion = ["syd1"]

/**
 * 21:30 UTC daily. That is 08:30 Melbourne in AEDT and 07:30 in AEST.
 * The handler itself acts only on the Melbourne 10th, 15th and 17th.
 */
export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json(
      { error: "unauthorised", hint: "cron_secret_required" },
      { status: 401 },
    )
  }

  try {
    const result = await runBillingPartnerReminders()
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Billing partner reminder failed"
    console.error("[billing-partner-reminders]", err)
    return NextResponse.json({ status: "error", message }, { status: 500 })
  }
}
