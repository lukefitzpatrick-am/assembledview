import assert from "node:assert/strict"
import test from "node:test"
import type { LineItem, MediaItems } from "../../lib/generateMediaPlan.js"
import type { Publisher } from "../../lib/types/publisher.js"
import { addGst } from "../../lib/finance/gst.js"
import {
  advertisingAssociatesFilteredPlanHasLineItems,
  buildAdvertisingAssociatesMbaDataFromMediaItems,
  filterMediaItemsForAdvertisingAssociates,
  lineItemBillsViaAdvertisingAssociates,
  parseLineItemGrossMedia,
} from "../../lib/mediaplan/advertisingAssociatesExcel.js"

function emptyMediaItems(): MediaItems {
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

function baseLine(over: Partial<LineItem> & Pick<LineItem, "network" | "startDate" | "endDate">): LineItem {
  return {
    market: "",
    deliverables: 0,
    deliverablesAmount: over.deliverablesAmount ?? "0",
    grossMedia: over.grossMedia ?? "0",
    buyType: over.buyType ?? "cpm",
    ...over,
  }
}

const publishers: Publisher[] = [
  {
    id: 1,
    publisher_name: "Acme AA",
    billingagency: "advertising associates",
  } as Publisher,
  {
    id: 2,
    publisher_name: "Other Co",
    billingagency: "assembled media",
  } as Publisher,
]

test("lineItemBillsViaAdvertisingAssociates matches network to AA publisher", () => {
  const item = baseLine({
    network: "Acme AA",
    startDate: "2025-01-01",
    endDate: "2025-01-31",
    grossMedia: "100",
  })
  assert.equal(lineItemBillsViaAdvertisingAssociates(item, publishers), true)
})

test("lineItemBillsViaAdvertisingAssociates is false for assembled media publisher", () => {
  const item = baseLine({
    network: "Other Co",
    startDate: "2025-01-01",
    endDate: "2025-01-31",
    grossMedia: "50",
  })
  assert.equal(lineItemBillsViaAdvertisingAssociates(item, publishers), false)
})

test("filterMediaItemsForAdvertisingAssociates keeps only AA-billed rows", () => {
  const mediaItems: MediaItems = {
    ...emptyMediaItems(),
    search: [
      baseLine({
        network: "Acme AA",
        startDate: "2025-01-01",
        endDate: "2025-01-31",
        grossMedia: "10",
      }),
      baseLine({
        network: "Other Co",
        startDate: "2025-01-01",
        endDate: "2025-01-31",
        grossMedia: "99",
      }),
    ],
  }
  const out = filterMediaItemsForAdvertisingAssociates(mediaItems, publishers)
  assert.equal(out.search.length, 1)
  assert.equal(out.search[0]?.network, "Acme AA")
})

test("buildAdvertisingAssociatesMbaDataFromMediaItems splits media vs production totals", () => {
  const filtered: MediaItems = {
    ...emptyMediaItems(),
    television: [
      baseLine({
        network: "Acme AA",
        startDate: "2025-01-01",
        endDate: "2025-01-31",
        grossMedia: "200",
      }),
    ],
    production: [
      baseLine({
        network: "Acme AA",
        startDate: "2025-01-01",
        endDate: "2025-01-31",
        grossMedia: "40",
      }),
    ],
  }
  const mba = buildAdvertisingAssociatesMbaDataFromMediaItems(filtered)
  assert.equal(mba.totals.gross_media, 200)
  assert.equal(mba.totals.production, 40)
  assert.equal(mba.totals.service_fee, 0)
  assert.equal(mba.totals.adserving, 0)
  assert.equal(mba.totals.totals_ex_gst, 240)
  assert.equal(mba.totals.total_inc_gst, 264)
  assert.ok(mba.gross_media.some((r) => r.media_type === "Television" && r.gross_amount === 200))
  assert.ok(mba.gross_media.some((r) => r.media_type === "Production" && r.gross_amount === 40))
})

/**
 * Workbook totals contract (Luke N56 / N61 defect class).
 * AA builder (advertisingAssociatesExcel.ts:186-218) is the reference: production is its own
 * totals component; Total Gross Media never includes it. Standard Media Plan Excel omits
 * production from gross_media[] entirely (edit page filters mp_production); AA still lists a
 * Production breakdown row but excludes it from totals.gross_media — both shapes must satisfy
 * the additive identities below.
 */
test("mbaData totals contract: Gross Media = row sum; nett + GST identities hold with production", () => {
  const filtered: MediaItems = {
    ...emptyMediaItems(),
    radio: [
      baseLine({
        network: "Acme AA",
        startDate: "2026-09-01",
        endDate: "2026-11-30",
        grossMedia: "100000",
      }),
    ],
    production: [
      baseLine({
        network: "Acme AA",
        startDate: "2026-09-01",
        endDate: "2026-11-30",
        grossMedia: "1000",
      }),
    ],
  }
  const aa = buildAdvertisingAssociatesMbaDataFromMediaItems(filtered)

  // AA lists Production in gross_media[]; Total Gross Media excludes it.
  const aaMediaRows = aa.gross_media.filter((r) => r.media_type !== "Production")
  assert.equal(
    aa.totals.gross_media,
    aaMediaRows.reduce((s, r) => s + r.gross_amount, 0),
    "AA totals.gross_media must equal non-production gross_media rows"
  )

  // Standard workbook shape (edit/create Media Plan): production omitted from gross_media[].
  const standard = {
    gross_media: aaMediaRows,
    totals: {
      gross_media: aa.totals.gross_media,
      service_fee: aa.totals.service_fee,
      production: aa.totals.production,
      adserving: aa.totals.adserving,
      totals_ex_gst: aa.totals.totals_ex_gst,
      total_inc_gst: addGst(aa.totals.totals_ex_gst),
    },
  }

  // (a) Total Gross Media === Σ media-type rows printed above it
  assert.equal(
    standard.totals.gross_media,
    standard.gross_media.reduce((s, r) => s + r.gross_amount, 0)
  )
  // (b) Total Ex GST === gross + fee + adserving + production (each once)
  assert.equal(
    standard.totals.totals_ex_gst,
    standard.totals.gross_media +
      standard.totals.service_fee +
      standard.totals.adserving +
      standard.totals.production
  )
  // (c) Total Inc GST via shared GST helper
  assert.equal(standard.totals.total_inc_gst, addGst(standard.totals.totals_ex_gst))
})

test("parseLineItemGrossMedia strips currency", () => {
  const item = baseLine({
    network: "X",
    startDate: "2025-01-01",
    endDate: "2025-01-31",
    grossMedia: "$1,234.50",
  })
  assert.equal(parseLineItemGrossMedia(item), 1234.5)
})

test("advertisingAssociatesFilteredPlanHasLineItems", () => {
  assert.equal(advertisingAssociatesFilteredPlanHasLineItems(emptyMediaItems()), false)
  assert.equal(
    advertisingAssociatesFilteredPlanHasLineItems({
      ...emptyMediaItems(),
      radio: [baseLine({ network: "Acme AA", startDate: "2025-01-01", endDate: "2025-01-31" })],
    }),
    true,
  )
})
