/**
 * Morning-smoke samples. Writes into tmp/overnight-exports/ (gitignored).
 * HTML emails, billing schedule PDF, MBA PDF (normal and draft), scope of work PDF,
 * and a media plan workbook with Television, Radio, Newspaper, Search and Social lines.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { buildUploadDigestEmailHtml } from "../../lib/creative/uploadDigestEmail"
import { generateBillingSchedulePDF } from "../../lib/generateBillingSchedulePDF"
import { generateMBA, type MBAData } from "../../lib/generateMBA"
import { generateScopeOfWork } from "../../lib/generateScopeOfWork"
import type { LineItem, MediaItems } from "../../lib/generateMediaPlan"
import { buildMediaPlanWorkbook } from "../../lib/docs/mediaPlanWorkbook"
import { buildPacingDigestEmailHtml } from "../../lib/ops/digest/email"
import { groupDigestByBand } from "../../lib/ops/digest/banding"
import { buildOpsHealthEmailHtml } from "../../lib/ops/health/email"

const outDir = join(process.cwd(), "tmp", "overnight-exports")
mkdirSync(outDir, { recursive: true })

const groups = groupDigestByBand([])

writeFileSync(
  join(outDir, "pacing-digest.html"),
  buildPacingDigestEmailHtml({
    asOfDate: "2026-10-07",
    builtAt: "2026-10-07T09:00:00+11:00",
    cacheNote: "sample",
    rows: [],
    atRisk: [],
    groups,
    counts: { atRisk: 0, behind: 0, on: 0, ahead: 0, noData: 0, total: 0 },
  }),
)

writeFileSync(
  join(outDir, "ops-health.html"),
  buildOpsHealthEmailHtml({
    asOfDate: "2026-10-07",
    checkedAt: "2026-10-07T09:00:00+11:00",
    results: [
      { name: "Warehouse", status: "green", detail: "Fresh" },
      { name: "Xero", status: "amber", detail: "One day behind" },
      { name: "Volume", status: "red", detail: "Below trailing mean" },
    ],
    redCount: 1,
    amberCount: 1,
    greenCount: 1,
  }),
)

writeFileSync(
  join(outDir, "upload-digest.html"),
  buildUploadDigestEmailHtml({
    windowMinutes: 65,
    sinceIso: "2026-10-07T08:00:00+11:00",
    builtAt: "2026-10-07T09:00:00+11:00",
    totalFiles: 1,
    totalUploaders: 1,
    groups: [],
  }),
)

const billing = await generateBillingSchedulePDF({
  date: "7 Oct 2026",
  mba_number: "MBA-SAMPLE",
  campaign_name: "Sample campaign",
  campaign_brand: "Sample brand",
  client_name: "Sample client",
  billingSchedule: [
    {
      monthYear: "Oct 2026",
      totalAmount: "$1,000.00",
      mediaTypes: [
        {
          mediaType: "Television",
          lineItems: [{ header1: "Prime", header2: "30s", amount: "$1,000.00" }],
        },
      ],
    },
  ],
})
writeFileSync(join(outDir, "billing-schedule.pdf"), Buffer.from(await billing.arrayBuffer()))

const LONG_CAMPAIGN_NAME =
  "Overnight sample campaign name that is long enough to wrap the MBA header line past the brand column"

const mba: MBAData = {
  date: "08/10/2026",
  mba_number: "SAMPLE001",
  campaign_name: LONG_CAMPAIGN_NAME,
  campaign_brand: "Sample brand",
  po_number: "PO-SAMPLE",
  media_plan_version: "1",
  client: {
    name: "Sample client",
    streetaddress: "1 Test St",
    suburb: "Melbourne",
    state: "VIC",
    postcode: "3000",
  },
  campaign: { date_start: "01/01/2026", date_end: "31/12/2026" },
  gross_media: [
    { media_type: "Television", gross_amount: 1000 },
    { media_type: "Search", gross_amount: 500 },
  ],
  totals: {
    gross_media: 1500,
    service_fee: 150,
    production: 0,
    adserving: 0,
    totals_ex_gst: 1650,
    total_inc_gst: 1815,
  },
  billingSchedule: [{ monthYear: "January 2026", totalAmount: "1650" }],
}

const mbaPdf = await generateMBA(mba)
writeFileSync(join(outDir, "mba.pdf"), Buffer.from(await mbaPdf.arrayBuffer()))
const mbaDraft = await generateMBA({ ...mba, draft: true })
writeFileSync(join(outDir, "mba-draft.pdf"), Buffer.from(await mbaDraft.arrayBuffer()))

const scope = await generateScopeOfWork({
  client_name: "Sample client",
  contact_name: "Sample contact",
  contact_email: "sample@example.com",
  scope_date: "08/10/2026",
  scope_version: 1,
  project_name: LONG_CAMPAIGN_NAME,
  project_status: "Draft",
  project_overview: "Sample scope of work for the overnight brand export.",
  deliverables: "Media plan and billing schedule.",
  tasks_steps: "Plan, book, report.",
  timelines: "January to December 2026.",
  responsibilities: "Assembled Media plans. The client approves.",
  requirements: "Approved brief.",
  assumptions: "Rates hold for the campaign window.",
  exclusions: "Production is excluded.",
  cost: [{ expense_category: "Service fee", description: "Planning", cost: 150 }],
  payment_terms_and_conditions: "30 days.",
  billing_schedule: [{ month: "January 2026", cost: 150 }],
})
writeFileSync(join(outDir, "scope-of-work.pdf"), Buffer.from(await scope.arrayBuffer()))

function sampleLine(label: string): LineItem {
  return {
    market: "National",
    network: label,
    platform: label,
    station: label,
    title: label,
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    deliverables: 10,
    deliverablesAmount: "1000",
    grossMedia: "1000",
    buyType: "cpm",
    size: "30s",
  }
}

function emptyItems(): MediaItems {
  return {
    search: [],
    socialMedia: [],
    digiAudio: [],
    digiDisplay: [],
    digiVideo: [],
    bvod: [],
    progDisplay: [],
    progVideo: [],
    progBvod: [],
    progOoh: [],
    progAudio: [],
    newspaper: [],
    magazines: [],
    television: [],
    radio: [],
    ooh: [],
    cinema: [],
    integration: [],
    influencers: [],
    production: [],
  }
}

const mediaItems = emptyItems()
mediaItems.television = [sampleLine("Television")]
mediaItems.radio = [sampleLine("Radio")]
mediaItems.newspaper = [sampleLine("Newspaper")]
mediaItems.search = [sampleLine("Search")]
mediaItems.socialMedia = [sampleLine("Social")]

const logoBase64 = readFileSync(join(process.cwd(), "public/brand/logo-full-colour.png")).toString("base64")
const plan = await buildMediaPlanWorkbook({
  header: {
    logoBase64,
    logoWidth: 457,
    logoHeight: 71,
    client: "Sample client",
    brand: "Sample brand",
    campaignName: LONG_CAMPAIGN_NAME,
    mbaNumber: "SAMPLE001",
    clientContact: "",
    planVersion: "1",
    poNumber: "PO-SAMPLE",
    campaignBudget: "$5,000.00",
    campaignStatus: "Draft",
    campaignStart: "01/01/2026",
    campaignEnd: "31/12/2026",
  },
  mediaItems,
  mbaData: {
    gross_media: [],
    totals: {
      gross_media: 5000,
      service_fee: 500,
      production: 0,
      adserving: 0,
      totals_ex_gst: 5500,
      total_inc_gst: 6050,
    },
  },
  clientName: "Sample client",
  campaignName: LONG_CAMPAIGN_NAME,
  versionNumber: 1,
  variant: "standard",
  draft: false,
  kpiRows: [],
})
writeFileSync(join(outDir, "media-plan.xlsx"), plan.buffer)

console.log("wrote", outDir)
