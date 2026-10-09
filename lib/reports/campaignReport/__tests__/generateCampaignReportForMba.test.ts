import assert from "node:assert/strict"
import test from "node:test"

import type { AssembleCampaignReportInput, CampaignReportPayload } from "@/lib/reports/campaignReport/assembleCampaignReportData"
import { campaignReportPeriodMetrics } from "@/lib/reports/campaignReport/periodMetrics"
import {
  campaignReportDownloadName,
  campaignReportSkipReason,
  generateCampaignReportForMba,
  mpSearchEnabledFromFlags,
  type PublishedCampaignReport,
} from "@/lib/reports/campaignReport/generateCampaignReportForMba"

function payload(overrides: Partial<CampaignReportPayload> = {}): CampaignReportPayload {
  return {
    mbaNumber: "PENFOLD013",
    clientName: "Penfold",
    campaignName: "Always on",
    versionNumber: 4,
    asOf: "2026-08-15",
    period: {
      kind: "custom",
      slug: "custom",
      label: "Custom range (2026-08-01 to 2026-08-31)",
      current: { startISO: "2026-08-01", endISO: "2026-08-31" },
      previous: null,
    },
    totals: {
      plannedBudget: 1000,
      spend: 100,
      impressions: 10,
      clicks: 1,
      results: 0,
      previousSpend: null,
      previousImpressions: null,
      expectedSpendToDate: null,
      timeElapsedPct: null,
      metrics: campaignReportPeriodMetrics({
        spend: 100,
        impressions: 10,
        clicks: 1,
        expectedSpend: null,
      }),
      previousMetrics: null,
    },
    channels: [],
    deliveryStates: ["reported"],
    kpis: [],
    commentary: null,
    ...overrides,
  }
}

const published: PublishedCampaignReport = {
  versionNumber: 4,
  clientName: "Penfold",
  campaignName: "Always on",
  campaignStartISO: "2026-07-01",
  campaignEndISO: "2026-09-30",
  mpSearchEnabled: false,
}

test("mpSearchEnabledFromFlags reads the published search flag", () => {
  assert.equal(mpSearchEnabledFromFlags({ search: true }), true)
  assert.equal(mpSearchEnabledFromFlags({ search: false }), false)
  assert.equal(mpSearchEnabledFromFlags({ mp_search: "yes" }), true)
  assert.equal(mpSearchEnabledFromFlags({}), false)
  assert.equal(mpSearchEnabledFromFlags(null), false)
})

test("download name is client, campaign and period month", () => {
  assert.equal(
    campaignReportDownloadName({
      clientName: "Penfold",
      campaignName: "Always on",
      periodStartISO: "2026-08-01",
    }),
    "Penfold-Always-on-report-2026-08.pptx",
  )
})

test("skip reason covers no source and no rows", () => {
  assert.equal(campaignReportSkipReason(["reported"]), null)
  assert.equal(campaignReportSkipReason(["spend_only"]), null)
  assert.match(campaignReportSkipReason(["no_source"]) ?? "", /No delivery source/)
  assert.match(campaignReportSkipReason(["no_rows_yet"]) ?? "", /not reported yet/)
  assert.match(campaignReportSkipReason([]) ?? "", /No delivery reported/)
  assert.equal(campaignReportSkipReason(undefined), null)
})

test("generateCampaignReportForMba resolves inputs from the published version", async () => {
  const assembled: AssembleCampaignReportInput[] = []
  const result = await generateCampaignReportForMba(
    {
      mbaNumber: "penfold013",
      period: { kind: "custom", start: "2026-08-01", end: "2026-08-31" },
      store: true,
      withCommentary: false,
    },
    {
      resolvePublished: async () => published,
      assemble: async (input) => {
        assembled.push(input)
        return payload()
      },
      buildDeck: async () => Buffer.from("deck"),
      storeReport: async (mba, filename) => ({
        pathname: `exports/reports/${mba}/${filename.replace(".pptx", "")}-Ab12.pptx`,
        filename,
      }),
    },
  )

  assert.equal(assembled.length, 1)
  assert.equal(assembled[0].mbaNumber, "penfold013")
  assert.equal(assembled[0].versionNumber, 4)
  assert.equal(assembled[0].clientName, "Penfold")
  assert.equal(assembled[0].campaignName, "Always on")
  assert.equal(assembled[0].campaignStartISO, "2026-07-01")
  assert.equal(assembled[0].campaignEndISO, "2026-09-30")
  assert.equal(assembled[0].mpSearchEnabled, false)
  assert.equal(assembled[0].periodKind, "custom")
  assert.equal(assembled[0].customStartISO, "2026-08-01")
  assert.equal(assembled[0].customEndISO, "2026-08-31")
  assert.equal(result.fileName, "Penfold-Always-on-report-2026-08.pptx")
  assert.equal(
    result.blobPathname,
    "exports/reports/penfold013/Penfold-Always-on-report-2026-08-Ab12.pptx",
  )
  assert.equal(result.commentaryGenerated, false)
  assert.equal(result.skipped, undefined)
  assert.equal(result.buffer.toString(), "deck")
})

test("generateCampaignReportForMba skips a period with no delivery", async () => {
  let built = 0
  const result = await generateCampaignReportForMba(
    {
      mbaNumber: "PENFOLD013",
      period: { kind: "this_month" },
      store: true,
      withCommentary: true,
    },
    {
      resolvePublished: async () => published,
      assemble: async () => payload({ deliveryStates: ["no_source", "no_rows_yet"] }),
      buildDeck: async () => {
        built += 1
        return Buffer.from("deck")
      },
      generateCommentary: async () => {
        throw new Error("commentary should not run")
      },
      storeReport: async () => {
        throw new Error("store should not run")
      },
    },
  )

  assert.equal(built, 0)
  assert.equal(result.commentaryGenerated, false)
  assert.match(result.skipped ?? "", /No delivery reported/)
  assert.equal(result.blobPathname, undefined)
})
