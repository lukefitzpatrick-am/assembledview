import assert from "node:assert/strict"
import test from "node:test"
import {
  CLIENT_KPI_DIGITAL_BAND_END_INDEX,
  CLIENT_KPI_MEDIA_TYPE_ORDER,
  clientKpiMediaBand,
  groupClientKpisByMediaType,
  resolveClientKpiGroupSlug,
} from "../clientKpiMediaOrder.js"
import { MEDIA_TYPE_OPTIONS } from "../types.js"

test("CLIENT_KPI_MEDIA_TYPE_ORDER covers every MEDIA_TYPE_OPTIONS slug once", () => {
  const optionSlugs = MEDIA_TYPE_OPTIONS.map((o) => o.value).sort()
  const orderSlugs = [...CLIENT_KPI_MEDIA_TYPE_ORDER].sort()
  assert.deepEqual(orderSlugs, optionSlugs)
})

test("digital band is first and matches KPI-1 named channels", () => {
  const digital = CLIENT_KPI_MEDIA_TYPE_ORDER.slice(0, CLIENT_KPI_DIGITAL_BAND_END_INDEX)
  assert.deepEqual(digital.slice(0, 6), [
    "socialMedia",
    "search",
    "progDisplay",
    "progVideo",
    "digitalDisplay",
    "bvod",
  ])
  assert.equal(clientKpiMediaBand("socialMedia"), "digital")
  assert.equal(clientKpiMediaBand("television"), "other")
  assert.equal(clientKpiMediaBand("influencers"), "other")
})

test("resolveClientKpiGroupSlug accepts digi* aliases for digital* groups", () => {
  assert.equal(resolveClientKpiGroupSlug("digiDisplay"), "digitalDisplay")
  assert.equal(resolveClientKpiGroupSlug("digitalDisplay"), "digitalDisplay")
  assert.equal(resolveClientKpiGroupSlug("socialMedia"), "socialMedia")
})

test("groupClientKpisByMediaType nests rows and parks unknown at end", () => {
  const buckets = groupClientKpisByMediaType([
    { media_type: "television", id: 1 },
    { media_type: "socialMedia", id: 2 },
    { media_type: "mysteryChannel", id: 3 },
    { media_type: "digiDisplay", id: 4 },
  ])
  const bySlug = Object.fromEntries(buckets.map((b) => [b.slug, b.items.map((r) => r.id)]))
  assert.deepEqual(bySlug.socialMedia, [2])
  assert.deepEqual(bySlug.digitalDisplay, [4])
  assert.deepEqual(bySlug.television, [1])
  assert.deepEqual(bySlug.__other__, [3])
  assert.ok(buckets.findIndex((b) => b.slug === "socialMedia") < buckets.findIndex((b) => b.slug === "television"))
})
