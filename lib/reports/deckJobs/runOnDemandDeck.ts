/**
 * On-demand deck job. DECK_RENDERER=skill builds with the pinned v5 skill.
 * Any other value, and a skill failure, builds the Node deck.
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
import {
  generateCampaignReportForMba,
  loadCampaignReportForMba,
  type GenerateCampaignReportInput,
} from "@/lib/reports/campaignReport/generateCampaignReportForMba"
import { runDeckSkill, type DeckSkillDeps, type DeckSkillInput } from "@/lib/reports/deckSkill/runDeckSkill"
import { storePerformanceReport } from "@/lib/reports/storePerformanceReport"

type LoadedForSkill = {
  report: unknown
  fileName: string
  skipped: string | null
}

export type BuildDeckForRunDeps = {
  generate?: typeof generateCampaignReportForMba
  loadReport?: (input: GenerateCampaignReportInput) => Promise<LoadedForSkill>
  runSkill?: (input: DeckSkillInput, skillDeps?: DeckSkillDeps) => Promise<{ buffer: Buffer; fileName: string }>
  skill?: DeckSkillDeps
}

function fallbackReason(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  const line = message.split("\n")[0]?.trim() || "Skill deck failed"
  return line.slice(0, 180)
}

function commentaryFrom(report: unknown): GenerateCampaignReportInput["commentary"] {
  if (!report || typeof report !== "object") return undefined
  const commentary = (report as { commentary?: GenerateCampaignReportInput["commentary"] }).commentary
  if (!commentary || typeof commentary !== "object") return undefined
  return commentary
}

async function nodeDeck(
  run: Pick<OnDemandDeckRow, "mbaNumber" | "periodStart" | "periodEnd">,
  generate: typeof generateCampaignReportForMba,
  report: unknown,
): Promise<BuiltOnDemandDeck> {
  const commentary = commentaryFrom(report)
  const result = await generate({
    ...onDemandGenerateInput(run),
    ...(commentary ? { commentary } : {}),
  })
  if (result.skipped) throw new Error(result.skipped)
  return { buffer: result.buffer, fileName: result.fileName }
}

export async function buildDeckForRun(
  run: Pick<OnDemandDeckRow, "mbaNumber" | "periodStart" | "periodEnd">,
  deps?: BuildDeckForRunDeps,
): Promise<BuiltOnDemandDeck> {
  const generate = deps?.generate ?? generateCampaignReportForMba
  if (process.env.DECK_RENDERER !== "skill") {
    return nodeDeck(run, generate, undefined)
  }

  let loaded: LoadedForSkill | null = null
  try {
    const load = deps?.loadReport ?? (async (input: GenerateCampaignReportInput) => {
      const report = await loadCampaignReportForMba(input)
      return { report: report.payload, fileName: report.fileName, skipped: report.skipped }
    })
    loaded = await load({ ...onDemandGenerateInput(run), withCommentary: false })
    if (loaded.skipped) throw new Error(loaded.skipped)
    const runSkill = deps?.runSkill ?? runDeckSkill
    const built = await runSkill(
      { mbaNumber: run.mbaNumber, report: loaded.report, fileName: loaded.fileName },
      deps?.skill,
    )
    return { buffer: built.buffer, fileName: built.fileName }
  } catch (err) {
    if (loaded?.skipped) throw err
    const node = await nodeDeck(run, generate, loaded?.report)
    return { ...node, note: `Basic layout: ${fallbackReason(err)}` }
  }
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
