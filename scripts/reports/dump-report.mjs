/**
 * Dump assembleCampaignReportData for September 2026 (last_month as of 2026-10-12).
 *
 * node --env-file=.env.local --import ./scripts/test-shims/register-server-only.mjs --require ./scripts/test-shims/mock-server-only.cjs --import tsx scripts/reports/dump-report.mjs hema007
 */
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const require = createRequire(path.join(root, "package.json"))
require("./scripts/test-shims/mock-server-only.cjs")

const { resolvePublishedCampaignReport } = await import(
  pathToFileURL(path.join(root, "lib/reports/campaignReport/generateCampaignReportForMba.ts")).href
)
const { assembleCampaignReportData } = await import(
  pathToFileURL(path.join(root, "lib/reports/campaignReport/assembleCampaignReportData.ts")).href
)
const { closeSnowflakePool } = await import(
  pathToFileURL(path.join(root, "lib/snowflake/pool.ts")).href
)
const { closeDb } = await import(pathToFileURL(path.join(root, "db/index.ts")).href)
const fs = await import("node:fs")

const mbas = process.argv.slice(2)
const targets = mbas.length > 0 ? mbas : ["hema007", "curatif004"]
const outDir = path.join(root, "docs/superpowers/overnight-av-fixes/discovery")

try {
  for (const mba of targets) {
    const identity = await resolvePublishedCampaignReport(mba)
    if (!identity) {
      console.error("NO_PUBLISHED", mba)
      continue
    }
    const payload = await assembleCampaignReportData({
      mbaNumber: mba,
      clientName: identity.clientName,
      campaignName: identity.campaignName,
      versionNumber: identity.versionNumber,
      campaignStartISO: identity.campaignStartISO,
      campaignEndISO: identity.campaignEndISO,
      periodKind: "last_month",
      todayISO: "2026-10-12",
      mpSearchEnabled: identity.mpSearchEnabled,
      generateCommentary: async () => null,
    })
    const file = path.join(outDir, `AV-TP10-${mba}-2026-09.json`)
    fs.writeFileSync(file, JSON.stringify(payload, null, 2))
    const channels = (payload.channels ?? []).map((ch) => ({
      group: ch.group,
      label: ch.label,
      spend: ch.spend,
      planned: ch.plannedBudget,
      pace: ch.metrics?.spendPacePct ?? null,
      impressions: ch.impressions,
    }))
    console.log(JSON.stringify({
      mba,
      client: payload.clientName,
      campaign: payload.campaignName,
      version: payload.versionNumber,
      period: payload.period?.label,
      window: payload.period?.current,
      previous: payload.period?.previous,
      spend: payload.totals?.spend,
      expected: payload.totals?.expectedSpendToDate,
      elapsed: payload.totals?.timeElapsedPct,
      campaignPace: payload.totals?.metrics?.spendPacePct ?? null,
      channels: channels.length,
      channelSpend: channels,
      file,
    }))
  }
} catch (err) {
  console.error(err)
  process.exitCode = 1
} finally {
  await closeSnowflakePool()
  await closeDb()
}
