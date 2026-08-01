/**
 * Offline smoke: build a campaign report deck from a fixture payload (no Xano/Snowflake).
 * Run: npx tsx --require ./scripts/test-shims/mock-server-only.cjs scripts/smoke-campaign-report-fixture.ts
 */
import fs from "fs"
import path from "path"
import { buildCampaignReportDeck } from "@/lib/reports/campaignReport/buildCampaignReportDeck"
import type { CampaignReportPayload } from "@/lib/reports/campaignReport/assembleCampaignReportData"
import { campaignReportFilename } from "@/lib/reports/campaignReport/filename"
import { getMelbourneTodayISO } from "@/lib/dates/melbourne"

const payload: CampaignReportPayload = {
  mbaNumber: "PENFOLD013",
  clientName: "Penfold",
  campaignName: "Penfold always on",
  versionNumber: 1,
  asOf: "2026-08-01",
  period: {
    kind: "this_month",
    slug: "this-month",
    label: "This month (August 2026)",
    current: { startISO: "2026-08-01", endISO: "2026-08-01" },
    previous: { startISO: "2026-07-01", endISO: "2026-07-31" },
  },
  totals: {
    plannedBudget: 120000,
    spend: 18450,
    impressions: 2_450_000,
    clicks: 18200,
    results: 410,
    previousSpend: 42100,
    previousImpressions: 5_100_000,
    expectedSpendToDate: 4000,
    timeElapsedPct: 0.033,
  },
  channels: [
    {
      group: "social_meta",
      label: "Social (Meta)",
      plannedBudget: 50000,
      spend: 9200,
      impressions: 1_200_000,
      clicks: 9800,
      results: 120,
      previousSpend: 21000,
      previousImpressions: 2_400_000,
    },
    {
      group: "search",
      label: "Search",
      plannedBudget: 40000,
      spend: 6250,
      impressions: 850_000,
      clicks: 7400,
      results: 260,
      previousSpend: 14000,
      previousImpressions: 1_900_000,
    },
  ],
  kpis: [
    {
      metric: "ctr",
      label: "CTR",
      targetDisplay: "1.50%",
      actualDisplay: "0.74%",
      omitted: false,
    },
    {
      metric: "vtr",
      label: "VTR",
      targetDisplay: "—",
      actualDisplay: null,
      omitted: true,
      omitReason: "Pending KPI data review",
    },
  ],
  commentaryPlaceholder:
    "PLACEHOLDER: insight commentary will be written by the assembled-insight-commentary skill after delivery review. Do not treat this slide as final client copy.",
}

async function main() {
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
  console.log(JSON.stringify({ outPath, filename, bytes: buf.byteLength }, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
