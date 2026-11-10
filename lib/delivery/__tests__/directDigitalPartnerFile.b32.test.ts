/**
 * B32: the Channel Factory Direct Booked Digital Video line test lives in
 * `lib/delivery` so the dashboard section and the pacing ad-serving composer
 * share it. The dashboard re-export is the same function.
 */
import assert from "node:assert/strict"
import test from "node:test"

import {
  directDigitalPartnerFileLineIds,
  isDirectDigitalPartnerFileLine,
  PARTNER_FILE_VIDEO_CHANNEL,
} from "@/lib/delivery/directDigitalPartnerFile"
import { directDigitalPartnerFileLineIds as dashboardHelper } from "@/components/dashboard/delivery/channels/directDigitalAdapterShared"

const ITEMS = [
  { line_item_id: "a1dv1", publisher: "Channel Factory", platform: "" },
  { line_item_id: "A1DV2", publisher: "", platform: "Channel Factory" },
  { line_item_id: "a1dv3", publisher: "  channel factory ", platform: null },
  { line_item_id: "a1dv4", publisher: "Vistar", platform: "" },
  { line_item_id: "a1dv5", publisher: "Quantcast", platform: "" },
  { line_item_id: "a1dv6", publisher: "UMG Popsta", platform: "Channel Factory" },
  { line_item_id: "a1dv7", publisher: "Broadsign", platform: "" },
  { line_item_id: "", publisher: "Channel Factory", platform: "" },
  { line_item_id: "undefined", publisher: "Channel Factory", platform: "" },
]

test("B32: the dashboard imports the lib helper (one function)", () => {
  assert.equal(dashboardHelper, directDigitalPartnerFileLineIds)
  assert.equal(PARTNER_FILE_VIDEO_CHANNEL, "programmatic-video")
})

test("B32: Channel Factory on Digital Video only; publisher wins over platform", () => {
  assert.deepEqual([...directDigitalPartnerFileLineIds("digital-video", ITEMS)], ["a1dv1", "a1dv2", "a1dv3"])
  for (const key of ["digital-display", "digital-audio", "bvod", "programmatic-video", ""]) {
    assert.equal(directDigitalPartnerFileLineIds(key, ITEMS).size, 0, key)
  }
})

test("B32: isDirectDigitalPartnerFileLine matches the set test line by line", () => {
  assert.equal(isDirectDigitalPartnerFileLine("digital-video", "Channel Factory", ""), true)
  assert.equal(isDirectDigitalPartnerFileLine("digital-video", "", "channel factory"), true)
  assert.equal(isDirectDigitalPartnerFileLine("digital-video", null, " Channel Factory "), true)
  // Vistar and Broadsign are partner_file too, but not Channel Factory.
  assert.equal(isDirectDigitalPartnerFileLine("digital-video", "Vistar", ""), false)
  assert.equal(isDirectDigitalPartnerFileLine("digital-video", "Broadsign", ""), false)
  assert.equal(isDirectDigitalPartnerFileLine("digital-video", "UMG Popsta", "Channel Factory"), false)
  assert.equal(isDirectDigitalPartnerFileLine("digital-video", "", ""), false)
  assert.equal(isDirectDigitalPartnerFileLine("digital-display", "Channel Factory", ""), false)
  assert.equal(isDirectDigitalPartnerFileLine("bvod", "Channel Factory", ""), false)
})
