/**
 * M2 (C-417): the document builders pass `one_net_media` to planned
 * deliverables. The draft documents read it from the switch (the same read
 * as `readDeliveryFlags`); the published workbook build takes it as an arg.
 * Fixture: 1,050 at 7%, CPC $1 (976.5 clicks, a rounding edge), and 0.70 at
 * 19.5% display, CPM $1 (563.5 impressions, priced by ad serving).
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import ExcelJS from "exceljs"

import { buildMediaItemsFromPlanDetail } from "../buildMediaItemsFromPersisted.js"
import type { DraftDocumentsBody } from "../draftDocumentsBody.js"
import { renderDraftDocuments } from "../renderDraftDocuments.js"
import { setFeatureRowReaderForTests } from "../../features/server.js"
import { pdfText } from "./pdfText.js"

const burst = (budget: number) => ({ startDate: "2026-03-01", endDate: "2026-03-20", budget, buyAmount: 1 })

function body(kind: DraftDocumentsBody["kind"]): DraftDocumentsBody {
  return {
    mbaNumber: "m2edge001",
    versionNumber: 1,
    mode: "publish",
    campaignName: "Edge",
    brand: "Brand",
    poNumber: "PO-1",
    campaignStartDate: "2026-03-01",
    campaignEndDate: "2026-03-31",
    lineItems: [
      { lineItemId: "search-1", channel: "search", mediaType: "search", rate: 1, enteredAmount: 1050, buyType: "cpc", publisher: "Google", platform: "Google", approval: "approved", budgetIncludesFees: true, feePct: 7, bursts: [burst(1050)] },
      { lineItemId: "display-1", channel: "digitalDisplay", mediaType: "digidisplay", rate: 1, enteredAmount: 0.7, buyType: "cpm", publisher: "Site", platform: "Site", approval: "approved", budgetIncludesFees: true, feePct: 19.5, bursts: [burst(0.7)] },
    ],
    feeLoading: {},
    adservaudio: 0,
    adservvideo: 0,
    adservdisplay: 1000,
    adservimp: 0,
    kind,
    clientAddress: { name: "Fixture Client", streetaddress: "1 Test St", suburb: "Melbourne", state: "VIC", postcode: "3000" },
    campaignStatus: "Draft",
  } as DraftDocumentsBody
}

async function withSwitch<T>(on: boolean, fn: () => Promise<T>): Promise<T> {
  setFeatureRowReaderForTests(
    async () => new Map([["one_net_media", { key: "one_net_media", enabled: on, updatedAt: null, updatedBy: null, updatedByName: null, note: null }]]),
  )
  try {
    return await fn()
  } finally {
    setFeatureRowReaderForTests(null)
  }
}

async function workbookNumbers(on: boolean): Promise<Set<number>> {
  const result = await withSwitch(on, () => renderDraftDocuments(body("media_plan")))
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(result.buffer as unknown as ExcelJS.Buffer)
  const seen = new Set<number>()
  wb.getWorksheet("Media Plan")!.eachRow((row) => row.eachCell((cell) => {
    if (typeof cell.value === "number") seen.add(cell.value)
  }))
  return seen
}

describe("draft documents follow one_net_media for planned deliverables", () => {
  it("the Media Plan rows show the edge count the editor shows", async () => {
    const on = await workbookNumbers(true)
    const off = await workbookNumbers(false)
    assert.ok(on.has(977) && on.has(564), "on: 977 clicks and 564 impressions")
    assert.ok(!on.has(976) && !on.has(563))
    assert.ok(off.has(976) && off.has(563), "off: 976 clicks and 563 impressions")
    assert.ok(!off.has(977) && !off.has(564))
  })

  it("the MBA ad serving prices the same count", async () => {
    const text = async (on: boolean) => pdfText((await withSwitch(on, () => renderDraftDocuments(body("mba_pdf")))).buffer)
    const on = await text(true)
    const off = await text(false)
    assert.ok(on.includes("$564.00"), "on: $564.00 ad serving")
    assert.ok(off.includes("$563.00") && !off.includes("$564.00"), "off: $563.00 ad serving")
  })
})

describe("the published workbook build takes one_net_media as an arg", () => {
  const build = (oneNetMedia: boolean) =>
    buildMediaItemsFromPlanDetail({
      versionData: { published_at: "2026-02-01T00:00:00Z", campaign_start_date: "2026-03-01", campaign_end_date: "2026-03-31" },
      clientName: "Client",
      lineItems: { search: [{ line_item_id: "X1", buy_type: "cpc", budget_includes_fees: true, platform: "Google", bursts: [burst(1050)] }] } as never,
      feeSnapshot: { feesearch: 7 },
      publishers: [],
      logoBase64: "",
      oneNetMedia,
    }).mediaItems.search.map((row) => row.deliverables)

  it("on: 977, off: 976", () => {
    assert.deepEqual(build(true), [977])
    assert.deepEqual(build(false), [976])
  })
  it("the ad serving month weights follow the same counts (two months, both bursts on an exact half)", () => {
    // 0.35 and 1.05 at 7%, CPM $1: 325.5 and 976.5 impressions; the frozen slice sets $1,302.
    const weights = (oneNetMedia: boolean) =>
      buildMediaItemsFromPlanDetail({
        versionData: { published_at: "2026-02-01T00:00:00Z", campaign_start_date: "2026-03-01", campaign_end_date: "2026-04-30" },
        clientName: "Client",
        lineItems: {
          digitalDisplay: [{
            line_item_id: "X1",
            buy_type: "cpm",
            budget_includes_fees: true,
            platform: "Site",
            bursts: [
              { startDate: "2026-03-01", endDate: "2026-03-31", budget: 0.35, buyAmount: 1 },
              { startDate: "2026-04-01", endDate: "2026-04-30", budget: 1.05, buyAmount: 1 },
            ],
          }],
        } as never,
        feeSnapshot: { feedigidisplay: 7 },
        publishers: [],
        logoBase64: "",
        approvedSlice: { lines: [{ lineItemId: "X1", adservingCents: 130_200 }] },
        oneNetMedia,
      }).serviceMonthWeights.adServing
    assert.deepEqual(weights(true), { "March 2026": 325.75, "April 2026": 976.25 })
    assert.deepEqual(weights(false), { "March 2026": 325.25, "April 2026": 976.75 })
  })
})
