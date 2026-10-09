/**
 * Offline smoke: build a campaign report deck from a fixture payload (no Xano/Snowflake).
 * Run: npx tsx --require ./scripts/test-shims/mock-server-only.cjs scripts/smoke-campaign-report-fixture.ts
 */
import fs from "fs"
import path from "path"
import { buildCampaignReportDeck } from "@/lib/reports/campaignReport/buildCampaignReportDeck"
import type { CampaignReportPayload } from "@/lib/reports/campaignReport/assembleCampaignReportData"
import { campaignReportPeriodMetrics } from "@/lib/reports/campaignReport/periodMetrics"
import { campaignReportFilename } from "@/lib/reports/campaignReport/filename"
import { getMelbourneTodayISO } from "@/lib/dates/melbourne"

export const campaignReportFixture: CampaignReportPayload = {
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
    metrics: campaignReportPeriodMetrics({
      spend: 18450,
      impressions: 2_450_000,
      clicks: 18200,
      video3sViews: 84_000,
      expectedSpend: 4000,
    }),
    previousMetrics: campaignReportPeriodMetrics({
      spend: 42100,
      impressions: 5_100_000,
      clicks: 31000,
      expectedSpend: 2000,
    }),
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
      metrics: campaignReportPeriodMetrics({
        spend: 9200,
        impressions: 1_200_000,
        clicks: 9800,
        video3sViews: 84_000,
        expectedSpend: 1650,
      }),
      previousMetrics: campaignReportPeriodMetrics({
        spend: 21000,
        impressions: 2_400_000,
        clicks: 14000,
        video3sViews: 40_000,
        expectedSpend: 800,
      }),
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
      metrics: campaignReportPeriodMetrics({
        spend: 6250,
        impressions: 850_000,
        clicks: 7400,
        video3sViews: 0,
        expectedSpend: 1320,
      }),
      previousMetrics: campaignReportPeriodMetrics({
        spend: 14000,
        impressions: 1_900_000,
        clicks: 9000,
        expectedSpend: 700,
      }),
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
  commentary: null,
}

async function main() {
  const buf = await buildCampaignReportDeck(campaignReportFixture)
  const outDir = path.join(process.cwd(), ".claude-scratch")
  fs.mkdirSync(outDir, { recursive: true })
  const filename = campaignReportFilename({
    mbaNumber: campaignReportFixture.mbaNumber,
    periodSlug: campaignReportFixture.period.slug,
    yyyymmdd: getMelbourneTodayISO().replace(/-/g, ""),
  })
  const outPath = path.join(outDir, filename)
  fs.writeFileSync(outPath, buf)
  console.log(JSON.stringify({ outPath, filename, bytes: buf.byteLength }, null, 2))
}

const isEntry = process.argv[1]?.replace(/\\/g, "/").includes("smoke-campaign-report-fixture")
if (isEntry) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
