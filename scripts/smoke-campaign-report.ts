/**
 * Smoke: assemble + build a campaign report deck for PENFOLD013 (this month).
 * Run: npx tsx scripts/smoke-campaign-report.ts
 *
 * Requires Snowflake / Xano env like the local app. Writes under .claude-scratch/.
 */
import fs from "fs"
import path from "path"
import { assembleCampaignReportData } from "@/lib/reports/campaignReport/assembleCampaignReportData"
import { buildCampaignReportDeck } from "@/lib/reports/campaignReport/buildCampaignReportDeck"
import { campaignReportFilename } from "@/lib/reports/campaignReport/filename"
import { getMelbourneTodayISO } from "@/lib/dates/melbourne"

async function main() {
  const mbaNumber = process.argv[2] || "PENFOLD013"
  const payload = await assembleCampaignReportData({
    mbaNumber,
    clientName: "Penfold",
    campaignName: mbaNumber,
    periodKind: "this_month",
    // version left undefined — snapshot resolves published tip lines
  })

  const buf = await buildCampaignReportDeck(payload)
  const outDir = path.join(process.cwd(), ".claude-scratch")
  fs.mkdirSync(outDir, { recursive: true })
  const filename = campaignReportFilename({
    mbaNumber: payload.mbaNumber,
    periodSlug: payload.period.slug,
    yyyymmdd: getMelbourneTodayISO().replace(/-/g, ""),
  })
  const outPath = path.join(outDir, filename)
  fs.writeFileSync(outPath, buf)

  console.log(
    JSON.stringify(
      {
        outPath,
        filename,
        period: payload.period,
        channelCount: payload.channels.length,
        totals: payload.totals,
        kpiCount: payload.kpis.length,
        omittedKpis: payload.kpis.filter((k) => k.omitted).map((k) => k.metric),
        bytes: buf.byteLength,
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
