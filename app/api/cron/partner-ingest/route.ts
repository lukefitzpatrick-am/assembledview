import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { runPartnerIngestJob } from "@/lib/partner-ingest/runPartnerIngestJob"
import { logJob } from "@/lib/log"

export const dynamic = "force-dynamic"
export const maxDuration = 300
export const runtime = "nodejs"
export const preferredRegion = ["syd1"]

/**
 * Pull supplier delivery attachments from snowflake@assembledview.com.au into
 * ASSEMBLEDVIEW.RAW.PARTNER_*, one parser per PARTNER_SOURCE_MAP.SOURCE_SLUG.
 * Auth: CRON_SECRET. Never deletes mailbox messages. Never UPDATE on RAW.
 * The response is the run summary, including staleSources[].
 * Cron: 30 22 * * * (08:30 AEST, after the Datorama send).
 * Files are cumulative, so only the newest pending message per source is
 * parsed and loaded; older pending ones are logged `superseded` and moved to
 * the Superseded folder unparsed. No new load starts after
 * PARTNER_INGEST_BUDGET_MS (150 s); the rest stay in the inbox and `deferred`
 * counts them.
 * One run at a time (DATA-7): a run that starts while another holds the
 * Postgres advisory lock returns 409 `already_running` and touches nothing.
 * If the lock cannot be checked (database down), the run errors (500) and does
 * not load, so a second copy can never load the same file twice.
 */
function partnerIngestConfigured(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  return Boolean(
    env.PARTNER_INGEST_TENANT_ID?.trim() &&
      env.PARTNER_INGEST_CLIENT_ID?.trim() &&
      env.PARTNER_INGEST_CLIENT_SECRET?.trim()
  )
}

export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json(
      { error: "unauthorised", hint: "cron_secret_required" },
      { status: 401 }
    )
  }

  if (!partnerIngestConfigured()) {
    return NextResponse.json(
      {
        status: "not configured",
        wrote: false,
        reason: "PARTNER_INGEST_TENANT_ID / CLIENT_ID / CLIENT_SECRET unset",
      },
      { status: 200 }
    )
  }

  try {
    const summary = await runPartnerIngestJob()
    if (summary.alreadyRunning) {
      logJob(JSON.stringify({ event: "partner_ingest_already_running" }))
      return NextResponse.json(
        {
          status: "already_running",
          wrote: false,
          reason: "another partner ingest run holds the lock",
        },
        { status: 409 }
      )
    }
    logJob(JSON.stringify({ event: "partner_ingest", ...summary }))
    return NextResponse.json(summary, {
      status: summary.failed > 0 ? 207 : 200,
    })
  } catch (err) {
    console.error("[partner-ingest] fatal", err)
    return NextResponse.json(
      {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  return GET(request)
}
