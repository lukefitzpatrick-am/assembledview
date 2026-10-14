/**
 * One paid v5 skill deck for an MBA, campaign to date.
 *
 * node --env-file=.env.local --import ./scripts/test-shims/register-server-only.mjs --import tsx scripts/reports/run-deck-skill-once.ts <mba> --confirm-paid
 *
 * Refuses to run without --confirm-paid. Writes the pptx under
 * scripts/spikes/report-deck-skill/out/.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export function assertDeckSkillPaidConfirm(argv: readonly string[]): void {
  if (!argv.includes("--confirm-paid")) {
    throw new Error("Refusing to run without --confirm-paid")
  }
}

export async function runDeckSkillOnce(argv: readonly string[]): Promise<string> {
  assertDeckSkillPaidConfirm(argv)
  const mba = argv.find((arg) => !arg.startsWith("-"))?.trim()
  if (!mba) throw new Error("Pass an mba number")

  const { loadCampaignReportForMba } = await import(
    "@/lib/reports/campaignReport/generateCampaignReportForMba"
  )
  const { runDeckSkill } = await import("@/lib/reports/deckSkill/runDeckSkill")
  const loaded = await loadCampaignReportForMba({
    mbaNumber: mba,
    period: { kind: "campaign_to_date" },
    store: false,
    withCommentary: true,
  })
  if (loaded.skipped) throw new Error(loaded.skipped)
  const built = await runDeckSkill({
    mbaNumber: mba,
    report: loaded.payload,
    fileName: loaded.fileName,
  })
  const outDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../spikes/report-deck-skill/out",
  )
  fs.mkdirSync(outDir, { recursive: true })
  const dest = path.join(outDir, built.fileName)
  fs.writeFileSync(dest, built.buffer)
  return dest
}

function isDirectRun(): boolean {
  const entry = process.argv[1]?.replace(/\\/g, "/")
  return Boolean(entry?.endsWith("scripts/reports/run-deck-skill-once.ts"))
}

if (isDirectRun()) {
  runDeckSkillOnce(process.argv.slice(2)).then(
    (dest) => {
      console.log(JSON.stringify({ pptx: dest }))
    },
    (err: unknown) => {
      console.error(err instanceof Error ? err.message : String(err))
      process.exitCode = 1
    },
  )
}
