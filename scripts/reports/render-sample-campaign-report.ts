/**
 * Render the campaign report fixture to tmp/overnight-reports for a visual check.
 * Run: npx tsx --import ./scripts/test-shims/register-server-only.mjs scripts/reports/render-sample-campaign-report.ts
 */
import fs from "fs"
import path from "path"

import { buildCampaignReportDeck } from "@/lib/reports/campaignReport/buildCampaignReportDeck"
import { campaignReportFilename } from "@/lib/reports/campaignReport/filename"
import { campaignReportFixture } from "../smoke-campaign-report-fixture"
import { getMelbourneTodayISO } from "@/lib/dates/melbourne"

async function main() {
  const buf = await buildCampaignReportDeck(campaignReportFixture)
  const outDir = path.join(process.cwd(), "tmp", "overnight-reports")
  fs.mkdirSync(outDir, { recursive: true })
  const filename = campaignReportFilename({
    mbaNumber: campaignReportFixture.mbaNumber,
    periodSlug: campaignReportFixture.period.slug,
    yyyymmdd: getMelbourneTodayISO().replace(/-/g, ""),
  })
  const outPath = path.join(outDir, filename)
  fs.writeFileSync(outPath, buf)
  console.log(JSON.stringify({ outPath, bytes: buf.byteLength }))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
