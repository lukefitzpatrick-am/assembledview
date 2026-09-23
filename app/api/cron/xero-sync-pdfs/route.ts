import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { handleXeroCronGet } from "@/lib/xero/cronHttp"
import { runXeroPdfsCron } from "@/lib/xero/cronStages"

export const dynamic = "force-dynamic"
export const maxDuration = 120
export const runtime = "nodejs"
export const preferredRegion = ["syd1"]

/** Attach up to 10 invoice PDFs, stopping at a 40s budget. */
export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json(
      { error: "unauthorised", hint: "cron_secret_required" },
      { status: 401 },
    )
  }
  return handleXeroCronGet(request, "pdfs", runXeroPdfsCron)
}

export async function POST(request: Request) {
  return GET(request)
}
