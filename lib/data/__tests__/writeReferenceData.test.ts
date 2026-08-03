import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  PUBLISHER_MIRROR_FAILURE_KIND,
  buildPublisherMirrorFailurePayload,
  normalizePublisherWritePayload,
} from "../writePublishers"
import {
  REFERENCE_MIRROR_FAILURE_KIND,
  buildReferenceMirrorFailurePayload,
  isReferenceWritePath,
  normalizeReferenceWritePayload,
  resolveReferenceWriteTable,
} from "../writeReferenceMediaDetail"
import {
  BP_MIRROR_FAILURE_KIND,
  buildBpMirrorFailurePayload,
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

describe("buildPublisherMirrorFailurePayload", () => {
  it("shapes app_notifications payload", () => {
    const p = buildPublisherMirrorFailurePayload({
      op: "create",
      publisherId: 9,
      error: "upstream 500",
      at: new Date("2026-08-02T00:00:00.000Z"),
    })
    assert.equal(p.publisherId, 9)
    assert.equal(p.timestamp, "2026-08-02T00:00:00.000Z")
    assert.equal(PUBLISHER_MIRROR_FAILURE_KIND, "xano_publisher_mirror_failed")
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

  it("shapes mirror failure payload", () => {
    const p = buildReferenceMirrorFailurePayload({
      table: "tv_stations",
      rowId: 3,
      error: "boom",
      at: new Date("2026-08-02T00:00:00.000Z"),
    })
    assert.equal(p.table, "tv_stations")
    assert.equal(REFERENCE_MIRROR_FAILURE_KIND, "xano_reference_mirror_failed")
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

  it("shapes mirror failure kind", () => {
    const p = buildBpMirrorFailurePayload({
      op: "update",
      id: 2,
      error: "x",
      at: new Date("2026-08-02T00:00:00.000Z"),
    })
    assert.equal(p.op, "update")
    assert.equal(BP_MIRROR_FAILURE_KIND, "xano_media_container_bp_mirror_failed")
  })
})
