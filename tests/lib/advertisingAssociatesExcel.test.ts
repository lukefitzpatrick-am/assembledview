import assert from "node:assert/strict"
import test from "node:test"
import type { LineItem, MediaItems } from "../../lib/generateMediaPlan.js"
import type { Publisher } from "../../lib/types/publisher.js"
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
