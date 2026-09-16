import assert from "node:assert/strict"
import test from "node:test"

import {
  parseCampaignReadAgentJson,
  parseCampaignReadBeats,
  renderCampaignReadMarkdown,
} from "../beats.js"
import { EMPTY_CAMPAIGN_READ_BEAT } from "../types.js"

test("parseCampaignReadBeats fills six keys and empty → Nothing to report yet.", () => {
  const beats = parseCampaignReadBeats({
    planned: "You booked $180K on Search and Meta.",
    happened: "  ",
  })
  assert.equal(beats.planned, "You booked $180K on Search and Meta.")
  assert.equal(beats.happened, EMPTY_CAMPAIGN_READ_BEAT)
  assert.equal(beats.vsPlan, EMPTY_CAMPAIGN_READ_BEAT)
  assert.equal(beats.best, EMPTY_CAMPAIGN_READ_BEAT)
  assert.equal(beats.worst, EMPTY_CAMPAIGN_READ_BEAT)
  assert.equal(beats.upcoming, EMPTY_CAMPAIGN_READ_BEAT)
})

test("renderCampaignReadMarkdown uses the six headings in order", () => {
  const md = renderCampaignReadMarkdown(
    parseCampaignReadBeats({
      planned: "A",
      happened: "B",
      vsPlan: "C",
      best: "D",
      worst: "E",
      upcoming: "F",
    }),
  )
  assert.match(md, /^## What was planned\n\nA/)
  assert.match(md, /## What has happened\n\nB/)
  assert.match(md, /## Against the plan\n\nC/)
  assert.match(md, /## Best thing going on\n\nD/)
  assert.match(md, /## Worst thing\n\nE/)
  assert.match(md, /## Coming up\n\nF/)
})

test("parseCampaignReadAgentJson accepts fenced JSON", () => {
  const parsed = parseCampaignReadAgentJson(`
Here you go
\`\`\`json
{"beats":{"planned":"Booked $90K","happened":"Delivered $40K","vsPlan":"On pace","best":"Search","worst":"Meta lag","upcoming":"July burst"},"sources":["get_delivery_snapshot"]}
\`\`\`
`)
  assert.equal(parsed.beats.planned, "Booked $90K")
  assert.deepEqual(parsed.sources, ["get_delivery_snapshot"])
})
