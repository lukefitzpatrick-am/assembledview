/**
 * Morning-smoke samples for DS-E. Writes into tmp/overnight-exports/ (gitignored).
 * MBA, scope and media-plan workbooks need full plan fixtures; this script renders
 * the billing schedule PDF and the HTML emails whose builders take a small payload.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { buildUploadDigestEmailHtml } from "../../lib/creative/uploadDigestEmail"
import { generateBillingSchedulePDF } from "../../lib/generateBillingSchedulePDF"
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

console.log("wrote", outDir)
console.log("skipped: MBA PDF, scope PDF, media plan xlsx, finance xlsx, invite HTML, relabel pre (builders are not fixture-sized or not exported)")
