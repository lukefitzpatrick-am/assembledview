/** B52: the plan form's shared chrome: steps, flag to key map and accent colours. */
import assert from "node:assert/strict"
import test from "node:test"

import { MEDIA_TYPE_COLORS } from "@/lib/media/mediaTypes"

import { mediaKeyMap } from "../planChannels"
import { getMediaTypeAccentColor, PLAN_CAMPAIGN_STEPS } from "../planFormChrome"

test("the form flag to billing key map covers the 20 channels, as the pages had it", () => {
  assert.equal(Object.keys(mediaKeyMap).length, 20)
  assert.equal(mediaKeyMap.mp_digidisplay, "digiDisplay")
  assert.equal(mediaKeyMap.mp_socialmedia, "socialMedia")
  assert.equal(mediaKeyMap.mp_progooh, "progOoh")
  assert.equal(mediaKeyMap.mp_production, "production")
  assert.equal(mediaKeyMap.mp_magazines, "magazines")
})

test("accent colour: the channel's ARGB as #RRGGBB, or nothing", () => {
  assert.equal(getMediaTypeAccentColor("mp_television"), `#${MEDIA_TYPE_COLORS.television!.slice(2)}`)
  assert.match(getMediaTypeAccentColor("mp_digidisplay")!, /^#[0-9A-Fa-f]{6}$/)
  assert.equal(getMediaTypeAccentColor("mp_unknown"), undefined)
})

test("four steps, in order", () => {
  assert.deepEqual(PLAN_CAMPAIGN_STEPS.map((s) => s.id), ["campaign-setup", "channel-allocation", "mba-billing", "review-export"])
})
