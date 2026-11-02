import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import type { XeroCronStageResult } from "@/lib/xero/runLoggedStage"
import type { XeroCronStageName } from "@/lib/xero/syncLogNotes"

function unauthorised() {
  return NextResponse.json(
    { error: "unauthorised", hint: "cron_secret_required" },
    { status: 401 },
  )
}

export function xeroCronResponse(result: XeroCronStageResult): NextResponse {
  const httpStatus = result.status === "failed" ? 500 : 200
  return NextResponse.json(result, { status: httpStatus })
}

export async function handleXeroCronGet(
  request: Request,
  stage: XeroCronStageName,
  run: () => Promise<XeroCronStageResult>,
): Promise<NextResponse> {
  if (!assertCronSecret(request)) return unauthorised()
  try {
    const result = await run()
    console.log(
      JSON.stringify({
        event: "xero_sync_stage",
        stage,
        status: result.status,
        sync_log_id: result.log_id,
        duration_ms: result.duration_ms,
        invoices_upserted: result.invoices_upserted,
        contacts_upserted: result.contacts_upserted,
      }),
    )
    return xeroCronResponse(result)
  } catch (err) {
    console.error(`[xero-sync-${stage}] fatal`, err)
    return NextResponse.json(
      {
        stage,
        status: "failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}
