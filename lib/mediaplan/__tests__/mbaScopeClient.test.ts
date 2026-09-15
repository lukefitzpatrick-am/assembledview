import assert from "node:assert/strict"
import test from "node:test"

import { describePartialMbaPublishRail } from "@/lib/mediaplan/drafts/pill"
import {
  buildMbaScopeForSaveBody,
  countablePartialMbaLineCount,
  formatMbaScopeVersionPickerLabel,
  parsePersistedMbaScope,
  selectedLineItemIdsByMediaFromMbaScope,
} from "@/lib/mediaplan/mbaScopeClient"

test("buildMbaScopeForSaveBody: full MBA posts null ids and months", () => {
  assert.deepEqual(
    buildMbaScopeForSaveBody({
      isPartialMBA: false,
      partialMBASelectedLineItemIds: { search: ["billing-search::A"] },
      partialMBAMonthYears: ["May 2026"],
    }),
    { lineItemIds: null, monthYears: null }
  )
})

test("buildMbaScopeForSaveBody: partial flattens canonical line_item_ids", () => {
  assert.deepEqual(
    buildMbaScopeForSaveBody({
      isPartialMBA: true,
      partialMBASelectedLineItemIds: {
        search: ["billing-search::GLENDA008SE1", "GLENDA008SE1"],
        social: ["GLENDA008SM1"],
      },
      partialMBAMonthYears: ["May 2026", " June 2026 "],
    }),
    {
      lineItemIds: ["GLENDA008SE1", "GLENDA008SM1"],
      monthYears: ["May 2026", "June 2026"],
    }
  )
})

test("parsePersistedMbaScope + picker label Full vs Partial", () => {
  assert.equal(parsePersistedMbaScope(null), null)
  const partial = parsePersistedMbaScope({
    lineItemIds: ["A", "B"],
    monthYears: ["May 2026", "July 2026"],
    partial: true,
  })
  assert.equal(
    formatMbaScopeVersionPickerLabel({
      versionNumber: 3,
      scope: partial,
      publishedAt: "2026-09-15T00:00:00.000Z",
      countableLineCount: 7,
    }),
    "v3 · Partial - 2 of 7 lines, months May 2026 to July 2026 · Published"
  )
  assert.equal(
    formatMbaScopeVersionPickerLabel({
      versionNumber: 1,
      scope: { lineItemIds: null, monthYears: null, partial: false },
      publishedAt: null,
      countableLineCount: 7,
    }),
    "v1 · Full"
  )
})

test("selectedLineItemIdsByMediaFromMbaScope subsets by canonical id", () => {
  const byMedia = selectedLineItemIdsByMediaFromMbaScope({
    lineItemIds: ["GLENDA008SE1"],
    allLineIdsByMedia: {
      search: ["billing-search::GLENDA008SE1", "GLENDA008SE2"],
      social: ["GLENDA008SM1"],
    },
  })
  assert.deepEqual(byMedia.search, ["GLENDA008SE1"])
  assert.deepEqual(byMedia.social, [])
})

test("describePartialMbaPublishRail and countable lines", () => {
  assert.equal(
    describePartialMbaPublishRail({
      isPartial: true,
      inCount: 4,
      totalCount: 7,
    }),
    "Client MBA covers 4 of 7 lines."
  )
  assert.equal(
    describePartialMbaPublishRail({
      isPartial: false,
      inCount: 7,
      totalCount: 7,
    }),
    null
  )
  assert.equal(
    countablePartialMbaLineCount([
      { lineItemId: "A", mediaType: "search" },
      { lineItemId: "__service__fee", mediaType: "search" },
      { lineItemId: "P", mediaType: "production" },
    ]),
    1
  )
})
