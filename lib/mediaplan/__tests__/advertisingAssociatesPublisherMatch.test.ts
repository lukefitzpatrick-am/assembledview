import assert from "node:assert/strict"
import test from "node:test"

import type { LineItem, MediaItems } from "@/lib/generateMediaPlan"
import {
  filterMediaItemsForAdvertisingAssociates,
  lineItemBillsViaAdvertisingAssociates,
  planHasAdvertisingAssociatesLineItem,
  publisherResolver,
  shouldIncludeMediaPlanLineItem,
} from "@/lib/mediaplan/advertisingAssociatesExcel"
import type { Publisher } from "@/lib/types/publisher"

function pub(publisher_name: string, publisherid: string, billingagency: string): Publisher {
  return { publisher_name, publisherid, billingagency } as unknown as Publisher
}

const PUBLISHERS: Publisher[] = [
  pub("Southern Cross Austereo", "sca", "advertising associates"),
  pub("CarSales", "Farm Machinery Sales", "advertising associates"),
  pub("Meta", "meta", "assembled media"),
  // Same id on two publishers with different agencies (live data: Broadsheet).
  pub("Broadsheet", "Broadsheet", "assembled media"),
  pub("Broadsheet Media", "Broadsheet", "advertising associates"),
]

function production(network: string): LineItem {
  return {
    market: "",
    network,
    startDate: "2026-09-01",
    endDate: "2027-06-30",
    deliverables: 1,
    deliverablesAmount: "1200",
    grossMedia: "1200",
    buyType: "production",
  }
}

function emptyMedia(overrides: Partial<MediaItems>): MediaItems {
  const keys = [
    "search", "socialMedia", "digiAudio", "digiDisplay", "digiVideo", "bvod", "progDisplay",
    "progVideo", "progBvod", "progOoh", "progAudio", "newspaper", "magazines", "television",
    "radio", "ooh", "cinema", "integration", "influencers", "production",
  ] as const
  const out = {} as MediaItems
  for (const key of keys) out[key] = []
  return { ...out, ...overrides }
}

test("free-text SCA matches Southern Cross Austereo on publisherid (STRMEA001)", () => {
  assert.equal(lineItemBillsViaAdvertisingAssociates(production("SCA"), PUBLISHERS), true)
  assert.equal(lineItemBillsViaAdvertisingAssociates(production("sca "), PUBLISHERS), true)
  const media = emptyMedia({ production: [production("SCA")] })
  assert.equal(planHasAdvertisingAssociatesLineItem(media, PUBLISHERS, shouldIncludeMediaPlanLineItem), true)
  const filtered = filterMediaItemsForAdvertisingAssociates(media, PUBLISHERS)
  assert.equal(filtered.production.length, 1)
})

test("a name match wins over an id match", () => {
  const resolve = publisherResolver([
    ...PUBLISHERS,
    pub("SCA", "sca-other", "assembled media"),
  ])
  assert.equal(resolve("SCA")?.publisher_name, "SCA")
})

test("an id shared by two publishers never matches", () => {
  const resolve = publisherResolver([
    pub("Broadsheet One", "dup", "assembled media"),
    pub("Broadsheet Two", "dup", "advertising associates"),
  ])
  assert.equal(resolve("dup"), undefined)
})

test("unknown text and Assembled publishers stay off the AA plan", () => {
  assert.equal(lineItemBillsViaAdvertisingAssociates(production("Southern Cross"), PUBLISHERS), false)
  assert.equal(lineItemBillsViaAdvertisingAssociates(production("meta"), PUBLISHERS), false)
  assert.equal(publisherResolver(PUBLISHERS)(""), undefined)
})
