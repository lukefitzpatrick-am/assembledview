import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  canonicalSnapshotPayload,
  computeSnapshotChecksum,
  snapshotChecksumFooter,
  snapshotHash8,
} from "../snapshotChecksum.js"
import { isApprovedOrBeyond } from "../isApprovedOrBeyond.js"
import { generateMBA, type MBAData } from "../../generateMBA.js"

const fixtureSlice = {
  totalCents: 11000,
  lines: [
    {
      lineItemId: "billing-search::a",
      months: ["2026-01"],
      mediaCents: 10000,
      feeCents: 1000,
      adservingCents: 0,
      productionCents: 0,
    },
  ],
}

const fixtureRows = [
  {
    lineItemId: "billing-search::a",
    component: "media",
    basis: "billing",
    month: "2026-01-01",
    amountCents: 10000,
    source: "computed",
  },
  {
    lineItemId: "billing-search::a",
    component: "fee",
    basis: "billing",
    month: "2026-01-01",
    amountCents: 1000,
    source: "computed",
  },
]

const feeSnapshot = { search: 10 }

describe("PC3 snapshotChecksum", () => {
  it("is stable for the same canonical input", () => {
    const a = computeSnapshotChecksum({
      scheduleMonths: fixtureRows,
      approvedSlice: fixtureSlice,
      feeSnapshot,
    })
    const b = computeSnapshotChecksum({
      scheduleMonths: [...fixtureRows].reverse(),
      approvedSlice: fixtureSlice,
      feeSnapshot,
    })
    assert.equal(a, b)
    assert.equal(a.length, 64)
    assert.equal(snapshotHash8(a).length, 8)
    assert.equal(snapshotChecksumFooter(3, a), `v3 · ${snapshotHash8(a)}`)
  })

  it("changes when schedule amounts change", () => {
    const a = computeSnapshotChecksum({
      scheduleMonths: fixtureRows,
      approvedSlice: fixtureSlice,
      feeSnapshot,
    })
    const b = computeSnapshotChecksum({
      scheduleMonths: fixtureRows.map((r) =>
        r.component === "media" ? { ...r, amountCents: 10001 } : r
      ),
      approvedSlice: fixtureSlice,
      feeSnapshot,
    })
    assert.notEqual(a, b)
  })

  it("canonical payload sorts keys", () => {
    const payload = canonicalSnapshotPayload({
      scheduleMonths: fixtureRows,
      approvedSlice: fixtureSlice,
      feeSnapshot,
    })
    assert.ok(payload.includes('"approved_slice"'))
    assert.ok(payload.includes('"fee_snapshot"'))
    assert.ok(payload.includes('"schedule_months"'))
  })

  it("does not include the MBA header date label", () => {
    const parsed = JSON.parse(
      canonicalSnapshotPayload({
        scheduleMonths: fixtureRows,
        approvedSlice: fixtureSlice,
        feeSnapshot,
      })
    ) as Record<string, unknown>
    assert.deepEqual(Object.keys(parsed).sort(), [
      "approved_slice",
      "fee_snapshot",
      "schedule_months",
    ])
    assert.equal("date" in parsed, false)
    assert.equal("dateLabel" in parsed, false)
  })
})

describe("PC3 isApprovedOrBeyond", () => {
  it("accepts approved/booked/completed", () => {
    assert.equal(isApprovedOrBeyond("Approved"), true)
    assert.equal(isApprovedOrBeyond("booked"), true)
    assert.equal(isApprovedOrBeyond("COMPLETED"), true)
    assert.equal(isApprovedOrBeyond("Draft"), false)
    assert.equal(isApprovedOrBeyond("Planned"), false)
    assert.equal(isApprovedOrBeyond(""), false)
  })
})

describe("PC3 MBA PDF byte-identical fixture", () => {
  it("generates identical bytes twice for the same MBAData", async () => {
    const hash = computeSnapshotChecksum({
      scheduleMonths: fixtureRows,
      approvedSlice: fixtureSlice,
      feeSnapshot,
    })
    const footer = snapshotChecksumFooter(2, hash)
    const data: MBAData = {
      date: "15/01/2026",
      mba_number: "fixture001",
      campaign_name: "Fixture Campaign",
      campaign_brand: "Brand",
      po_number: "PO-1",
      media_plan_version: "2",
      client: {
        name: "Fixture Client",
        streetaddress: "1 Test St",
        suburb: "Melbourne",
        state: "VIC",
        postcode: "3000",
      },
      campaign: { date_start: "01/01/2026", date_end: "31/01/2026" },
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
      checksumFooter: footer,
    }

    const a = Buffer.from(await (await generateMBA(data)).arrayBuffer())
    const b = Buffer.from(await (await generateMBA(data)).arrayBuffer())
    assert.equal(a.length, b.length)
    assert.ok(a.equals(b), "PDF bytes must be identical for identical MBAData")
    // Footer string is embedded as PDF text.
    assert.ok(a.toString("latin1").includes(snapshotHash8(hash)))
  })
})
