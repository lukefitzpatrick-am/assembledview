import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { handleXeroCronGet } from "@/lib/xero/cronHttp"
import { runXeroContactsCron } from "@/lib/xero/cronStages"

export const dynamic = "force-dynamic"
export const maxDuration = 300
export const runtime = "nodejs"
export const preferredRegion = ["syd1"]

/** Refresh Xero contacts from the contacts watermark. */
export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json(
      { error: "unauthorised", hint: "cron_secret_required" },
      { status: 401 },
    )
  }
  return handleXeroCronGet(request, "contacts", runXeroContactsCron)
}

export async function POST(request: Request) {
  return GET(request)
}
