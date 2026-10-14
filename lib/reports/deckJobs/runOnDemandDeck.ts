/**
 * On-demand deck job. buildDeckForRun is the swap point for the next builder.
 * Today's body is generateCampaignReportForMba, then storePerformanceReport.
 */
import "server-only"

import {
  executeOnDemandDeck,
  onDemandGenerateInput,
  type BuiltOnDemandDeck,
  type OnDemandDeckRow,
} from "@/lib/reports/deckJobs/onDemandDeck"
import {
  claimQueuedOnDemandDeck,
  markOnDemandDeckFailed,
  markOnDemandDeckGenerated,
} from "@/lib/reports/deckJobs/onDemandDeckStore"
import { generateCampaignReportForMba } from "@/lib/reports/campaignReport/generateCampaignReportForMba"
import { storePerformanceReport } from "@/lib/reports/storePerformanceReport"

export async function buildDeckForRun(
  run: Pick<OnDemandDeckRow, "mbaNumber" | "periodStart" | "periodEnd">,
): Promise<BuiltOnDemandDeck> {
  const result = await generateCampaignReportForMba(onDemandGenerateInput(run))
  if (result.skipped) throw new Error(result.skipped)
  return { buffer: result.buffer, fileName: result.fileName }
}

const deckDeps = {
  build: buildDeckForRun,
  store: storePerformanceReport,
  markGenerated: markOnDemandDeckGenerated,
  markFailed: markOnDemandDeckFailed,
}

/** Claim a queued row, then build it. A row already claimed is left alone. */
export async function runOnDemandDeck(runId: string): Promise<void> {
  const run = await claimQueuedOnDemandDeck(runId)
  if (!run) return
  await executeOnDemandDeck(run, deckDeps)
}

/** Build a row the safety-net cron has already claimed. */
export async function runClaimedOnDemandDeck(run: OnDemandDeckRow): Promise<void> {
  await executeOnDemandDeck(run, deckDeps)
}
