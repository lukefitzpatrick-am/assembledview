/**
 * One paid v5 skill deck for an MBA, campaign to date.
 *
 * npm run deck:once -- <mba> --confirm-paid
 *
 * Refuses to run without --confirm-paid. Writes the pptx under
 * scripts/spikes/report-deck-skill/out/.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import type { ContainerStep } from "@/lib/reports/deckSkill/containerSteps"
import { deckStepsFromError } from "@/lib/reports/deckSkill/runDeckSkill"

export function assertDeckSkillPaidConfirm(argv: readonly string[]): void {
  if (!argv.includes("--confirm-paid")) {
    throw new Error("Refusing to run without --confirm-paid")
  }
}

export function deckSkillOnceReportInput(mbaNumber: string) {
  return {
    mbaNumber,
    period: { kind: "campaign_to_date" as const },
    store: false as const,
    withCommentary: false as const,
  }
}

export function deckSkillOutDir(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../spikes/report-deck-skill/out",
  )
}

export function writeDeckSkillSteps(mba: string, steps: readonly ContainerStep[]): string {
  const outDir = deckSkillOutDir()
  fs.mkdirSync(outDir, { recursive: true })
  const dest = path.join(outDir, `${mba}-steps.json`)
  fs.writeFileSync(dest, `${JSON.stringify(steps, null, 2)}\n`)
  return dest
}

export async function closeDeckSkillOnce(
  code: number,
  deps?: { closePool?: () => Promise<void>; exit?: (status: number) => void },
): Promise<void> {
  const closePool = deps?.closePool ?? (async () => {
    const { closeSnowflakePool } = await import("@/lib/snowflake/pool")
    await closeSnowflakePool()
  })
  try {
    await closePool()
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
  }
  const exit = deps?.exit ?? ((status: number) => {
    process.exit(status)
  })
  exit(code)
}

export async function runDeckSkillOnce(argv: readonly string[]): Promise<string> {
  assertDeckSkillPaidConfirm(argv)
  const mba = argv.find((arg) => !arg.startsWith("-"))?.trim()
  if (!mba) throw new Error("Pass an mba number")

  const { loadCampaignReportForMba } = await import(
    "@/lib/reports/campaignReport/generateCampaignReportForMba"
  )
  const { runDeckSkill } = await import("@/lib/reports/deckSkill/runDeckSkill")
  const loaded = await loadCampaignReportForMba(deckSkillOnceReportInput(mba))
  if (loaded.skipped) throw new Error(loaded.skipped)
  try {
    const built = await runDeckSkill({
      mbaNumber: mba,
      report: loaded.payload,
      fileName: loaded.fileName,
    })
    const outDir = deckSkillOutDir()
    fs.mkdirSync(outDir, { recursive: true })
    const dest = path.join(outDir, built.fileName)
    fs.writeFileSync(dest, built.buffer)
    return dest
  } catch (err) {
    const steps = deckStepsFromError(err)
    if (steps) writeDeckSkillSteps(mba, steps)
    throw err
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1]?.replace(/\\/g, "/")
  return Boolean(entry?.endsWith("scripts/reports/run-deck-skill-once.ts"))
}

if (isDirectRun()) {
  runDeckSkillOnce(process.argv.slice(2)).then(
    (dest) => {
      console.log(JSON.stringify({ pptx: dest }))
      return closeDeckSkillOnce(0)
    },
    (err: unknown) => {
      console.error(err instanceof Error ? err.message : String(err))
      return closeDeckSkillOnce(1)
    },
  )
}
