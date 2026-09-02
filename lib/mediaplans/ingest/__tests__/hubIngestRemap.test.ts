/**
 * Hub remap is the same persistColumnRemap path as review, keyed by
 * publisher_name while 1:1 holds.
 */
import assert from "node:assert/strict"
import test from "node:test"
import {
  clearPublisherProfileSeedOverlayForTests,
  persistColumnRemap,
} from "../persistColumnRemap"
import { remapIngestColumn } from "../remapIngestColumn"
import { loadSeedPublisherProfiles } from "../loadPublisherProfiles"

const TEST_REMAP = {
  changedBy: "test@assembledmedia.com.au",
  source: "hub_remap" as const,
}

test("Hub remap persists identically to review remap", async () => {
  clearPublisherProfileSeedOverlayForTests()
  const review = await persistColumnRemap({
    publisherName: "QMS",
    header: "PANEL EXCLUSIVITY",
    mappedTo: "panel_name",
    knownHeaders: ["PANEL EXCLUSIVITY"],
    ...TEST_REMAP,
  })
  assert.equal(review.ok, true)
  if (!review.ok) return
  clearPublisherProfileSeedOverlayForTests()
  const hub = await remapIngestColumn({
    publisherName: "QMS",
    header: "PANEL EXCLUSIVITY",
    mappedTo: "panel_name",
    knownHeaders: ["PANEL EXCLUSIVITY"],
    ...TEST_REMAP,
  })
  assert.equal(hub.ok, true)
  if (!hub.ok) return
  assert.equal(hub.profile.column_map["PANEL EXCLUSIVITY"], "panel_name")
  assert.deepEqual(hub.profile.column_map, review.profile.column_map)
  assert.equal(hub.profile.publisher_name, "QMS")
})

test("remap stays keyed by publisher_name, not catalogue display name", async () => {
  clearPublisherProfileSeedOverlayForTests()
  await assert.rejects(
    () =>
      remapIngestColumn({
        publisherName: "Southern Cross Austereo",
        header: "Daypart",
        mappedTo: "daypart",
        knownHeaders: ["Daypart"],
        ...TEST_REMAP,
      }),
    /Unknown publisher profile/i,
  )
  const sca = await remapIngestColumn({
    publisherName: "SCA",
    header: "Daypart",
    mappedTo: "daypart",
    knownHeaders: ["Daypart"],
    ...TEST_REMAP,
  })
  assert.equal(sca.ok, true)
  if (!sca.ok) return
  assert.equal(sca.profile.publisher_name, "SCA")
  const seed = loadSeedPublisherProfiles().find((p) => p.publisher_name === "SCA")
  assert.ok(seed)
})
