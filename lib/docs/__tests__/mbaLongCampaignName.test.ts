/**
 * A long campaign name wraps in the left header column and does not
 * swallow the right-aligned "Campaign Brand:" line.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { generateMBA, type MBAData } from "../../generateMBA.js"
import { pdfText } from "./pdfText.js"

const LONG_CAMPAIGN_NAME = "N".repeat(120)

describe("MBA PDF long campaign name", () => {
  it("keeps the full campaign name and the Campaign Brand label", async () => {
    const data: MBAData = {
      date: "08/10/2026",
      mba_number: "wrap001",
      campaign_name: LONG_CAMPAIGN_NAME,
      campaign_brand: "Brand",
      po_number: "PO-1",
      media_plan_version: "1",
      client: {
        name: "Fixture Client",
        streetaddress: "1 Test St",
        suburb: "Melbourne",
        state: "VIC",
        postcode: "3000",
      },
      campaign: { date_start: "01/01/2026", date_end: "31/12/2026" },
      gross_media: [{ media_type: "Search", gross_amount: 100 }],
      totals: {
        gross_media: 100,
        service_fee: 10,
        production: 0,
        adserving: 0,
        totals_ex_gst: 110,
        total_inc_gst: 121,
      },
      billingSchedule: [{ monthYear: "January 2026", totalAmount: "110" }],
    }
    const buf = Buffer.from(await (await generateMBA(data)).arrayBuffer())
    const text = await pdfText(buf)
    const collapsed = text.replace(/\s+/g, "")
    assert.ok(collapsed.includes(LONG_CAMPAIGN_NAME), "full campaign name must be present")
    assert.ok(text.includes("Campaign Brand:"), "Campaign Brand label must still be present")
  })
})
