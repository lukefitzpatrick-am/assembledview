import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { logJob } from "@/lib/log"
import { runOnDemandDeckSafetyNet } from "@/lib/reports/deckJobs/onDemandDeck"
import {
  claimStaleQueuedOnDemandDeck,
  failStuckOnDemandDecks,
} from "@/lib/reports/deckJobs/onDemandDeckStore"
import { runClaimedOnDemandDeck } from "@/lib/reports/deckJobs/runOnDemandDeck"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 300
export const preferredRegion = ["syd1"]

/**
 * Every 5 minutes. Claims one on_demand_deck row queued for more than
 * 2 minutes, and fails rows that have been generating for more than 10 minutes.
 */
export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json(
      { error: "unauthorised", hint: "cron_secret_required" },
      { status: 401 },
    )
  }

  try {
    const summary = await runOnDemandDeckSafetyNet({
      failTimedOut: failStuckOnDemandDecks,
      claimStale: claimStaleQueuedOnDemandDeck,
      run: runClaimedOnDemandDeck,
    })
    logJob("[on-demand-deck] safety net", summary)
    return NextResponse.json(summary)
  } catch (err) {
    const message = err instanceof Error ? err.message : "On-demand deck cron failed"
    console.error("[on-demand-deck] safety net", err)
    return NextResponse.json({ status: "error", message }, { status: 500 })
  }
}
