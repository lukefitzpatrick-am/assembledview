/**
 * MBA header "Date:" is the Melbourne generation day, not campaign start.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

import { generateMBA, type MBAData } from "../../generateMBA.js"
import { mbaHeaderDateLabel } from "../buildMbaFromPersisted.js"

const srcPath = join(dirname(fileURLToPath(import.meta.url)), "../buildMbaFromPersisted.ts")
const src = readFileSync(srcPath, "utf8")

const JUST_BEFORE_UTC_MIDNIGHT = new Date("2026-09-04T23:59:59.000Z")
const JUST_AFTER_UTC_MIDNIGHT = new Date("2026-09-05T00:00:01.000Z")

describe("mbaHeaderDateLabel", () => {
  it("uses the injected now, not a campaign start date", () => {
    const now = new Date("2026-09-05T00:00:01.000Z")
    assert.equal(mbaHeaderDateLabel(now), "05/09/2026")
    assert.notEqual(mbaHeaderDateLabel(now), "01/01/2026")
  })

  it("stays 05/09/2026 just before and after midnight UTC on 5 Sep 2026 AEST", () => {
    assert.equal(mbaHeaderDateLabel(JUST_BEFORE_UTC_MIDNIGHT), "05/09/2026")
    assert.equal(mbaHeaderDateLabel(JUST_AFTER_UTC_MIDNIGHT), "05/09/2026")
  })
})

describe("buildMbaFromPersisted date wiring", () => {
  it("accepts optional now so tests can pin generation time", () => {
    assert.match(src, /now\?:\s*Date/)
  })

  it("sets the header date from mbaHeaderDateLabel(now), not campaignStartDate", () => {
    assert.match(
      src,
      /dateLabel\s*=\s*mbaHeaderDateLabel\(\s*args\.now\s*\?\?\s*new Date\(\)\s*\)/
    )
    assert.doesNotMatch(
      src,
      /dateLabel\s*=\s*[\s\S]{0,80}formatDateDdMmYyyy\(\s*version\.campaignStartDate\s*\)/
    )
  })

  it("leaves campaign.date_start / date_end on the version campaign dates", () => {
    assert.match(src, /date_start:\s*formatDateDdMmYyyy\(\s*version\.campaignStartDate\s*\)/)
    assert.match(src, /date_end:\s*formatDateDdMmYyyy\(\s*version\.campaignEndDate\s*\)/)
  })
})

describe("MBA PDF header Date", () => {
  it("embeds the Melbourne generation date, not the campaign start", async () => {
    const date = mbaHeaderDateLabel(JUST_BEFORE_UTC_MIDNIGHT)
    const data: MBAData = {
      date,
      mba_number: "header001",
      campaign_name: "Header Date Campaign",
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
    const latin1 = buf.toString("latin1")
    assert.ok(latin1.includes("Date: 05/09/2026"), "header Date must be Melbourne generation day")
    assert.ok(
      latin1.includes("Campaign Dates: From 01/01/2026 to 31/12/2026"),
      "campaign dates stay on their own line"
    )
    assert.ok(!latin1.includes("Date: 01/01/2026"))
  })
})
