import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  normalizePublisherWritePayload,
} from "../writePublishers"
import {
  isReferenceWritePath,
  normalizeReferenceWritePayload,
  resolveReferenceWriteTable,
} from "../writeReferenceMediaDetail"
import {
  normalizeBpWritePayload,
} from "../writeMediaContainerBestPractice"

describe("normalizePublisherWritePayload", () => {
  it("keeps known columns and drops legacy/KPI junk", () => {
    const out = normalizePublisherWritePayload({
      publisher_name: "Seven",
      publisherid: "SEV",
      publishertype: "direct",
      billingagency: "assembled media",
      financecode: "F1",
      pub_television: true,
      digitaldisplay_cpm_default: 12,
      pub_radio_comms: 5,
      radio_comms: 10,
      unknown: "x",
    })
    assert.equal(out.publisher_name, "Seven")
    assert.equal(out.publisherid, "SEV")
    assert.equal(out.radio_comms, 10)
    assert.equal(out.digitaldisplay_cpm_default, undefined)
    assert.equal((out as Record<string, unknown>).unknown, undefined)
  })

  it("requires publisher_name + publisherid on create", () => {
    assert.throws(
      () => normalizePublisherWritePayload({ publisherid: "X" }),
      /publisher_name/
    )
  })
})

describe("reference media-detail write paths", () => {
  it("maps POST_* and bare site paths to tables", () => {
    assert.equal(resolveReferenceWriteTable("POST_tv_stations"), "tv_stations")
    assert.equal(resolveReferenceWriteTable("audio_site"), "audio_site")
    assert.equal(isReferenceWritePath("POST_magazines"), true)
    assert.equal(isReferenceWritePath("not_a_table"), false)
  })

  it("normalizes required fields", () => {
    const out = normalizeReferenceWritePayload("tv_stations", {
      station: " Nine ",
      network: "Nine",
      junk: 1,
    })
    assert.deepEqual(out, { station: "Nine", network: "Nine" })
    assert.throws(
      () => normalizeReferenceWritePayload("audio_site", { platform: "Spotify" }),
      /site/
    )
  })

})

describe("media_container_best_practice write payload", () => {
  it("requires media_container on create", () => {
    assert.throws(() => normalizeBpWritePayload({}), /media_container/)
    const out = normalizeBpWritePayload({
      media_container: "television",
      best_practice: { a: 1 },
      _name: "admin@test",
    })
    assert.equal(out.media_container, "television")
    assert.deepEqual(out.best_practice, { a: 1 })
    assert.equal(out._name, "admin@test")
  })

})
