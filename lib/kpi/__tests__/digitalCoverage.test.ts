import assert from "node:assert/strict"
import test from "node:test"
import { DIGITAL_KPI_MEDIA_TYPES } from "../digitalChannels.js"
import { idCodeForKpiMediaType } from "../fanOut.js"
import { mediaTypeMatchesKpiRow } from "../matching.js"

test("every digital KPI media type maps to a line-item id code", () => {
  for (const mediaType of DIGITAL_KPI_MEDIA_TYPES) {
    assert.ok(
      idCodeForKpiMediaType(mediaType),
      `missing id code for ${mediaType}`,
    )
  }
})

test("publisher_kpi digitalDisplay alias matches digiDisplay resolver key", () => {
  for (const mediaType of DIGITAL_KPI_MEDIA_TYPES) {
    assert.ok(
      mediaTypeMatchesKpiRow(mediaType, mediaType),
      `reflexive match failed for ${mediaType}`,
    )
  }
  assert.ok(mediaTypeMatchesKpiRow("digiDisplay", "digitalDisplay"))
  assert.ok(mediaTypeMatchesKpiRow("digiAudio", "digitalAudio"))
  assert.ok(mediaTypeMatchesKpiRow("digiVideo", "digitalVideo"))
})
