import assert from "node:assert/strict"
import test from "node:test"
import JSZip from "jszip"

import {
  buildPerformanceReport,
  escapeXmlText,
  type PerformanceReportPayload,
} from "../buildPerformanceReport.js"

const samplePayload = (): PerformanceReportPayload => ({
  execSummary: "Spend is on track; search leads efficiency gains this month.",
  deliverySpend: "Delivered $120k vs $125k planned to date (96% pace).",
  deliveryDeliverables: "Impressions at 98% of plan; clicks ahead at 104%.",
  channels: [
    "Search: pacing ahead; CPA within band.",
    "Social: slight underspend; creative fatigue watch.",
    "Programmatic: on track; viewability stable.",
    "BVOD: late start; catch-up booked for next fortnight.",
  ],
  kpis: [
    "CPM $8.40 vs $9.00 target",
    "CTR 0.42% vs 0.35% target",
    "CPC $1.90 vs $2.20 target",
    "CVR 2.1% vs 1.8% target",
  ],
  keyInsight: "Efficiency gains are concentrated in branded search; prospecting needs refresh.",
  insights: [
    "Branded search CPA improved 18% MoM.",
    "Meta frequency above 3.5 on core audience.",
    "BVOD delivery lag is flighting, not inventory.",
  ],
  recsInFlight: "Shift 8% social → search; pause fatigued Meta creative.",
  recsNextPeriod: "Launch new prospecting set; bring BVOD back to plan by week 3.",
  steps: [
    { when: "This week", what: "Approve budget shift" },
    { when: "Next week", what: "Rotate Meta creative" },
    { when: "Fortnight", what: "BVOD catch-up live" },
    { when: "Month end", what: "Re-forecast Q remainder" },
  ],
})

test("escapeXmlText escapes ampersand first", () => {
  assert.equal(escapeXmlText(`A & B <C> "D" 'E'`), "A &amp; B &lt;C&gt; &quot;D&quot; &apos;E&apos;")
})

test("buildPerformanceReport fills template with no remaining {{ tokens", async () => {
  const buffer = await buildPerformanceReport(samplePayload())
  assert.ok(buffer.byteLength > 1_000_000)

  const zip = await JSZip.loadAsync(buffer)
  const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
  assert.equal(slides.length, 10)

  for (const name of slides) {
    const xml = await zip.file(name)!.async("string")
    assert.equal(xml.includes("{{"), false, `unfilled token in ${name}`)
  }
})
