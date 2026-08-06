import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { mapUiMediaTypeToLineChannel } from "../mapUiMediaTypeToLineChannel"
import { resolvePostgresSaveMode } from "../resolvePostgresSaveMode"

describe("mapUiMediaTypeToLineChannel", () => {
  it("maps editor keys and aliases onto LINE_CHANNELS", () => {
    assert.equal(mapUiMediaTypeToLineChannel("socialMedia"), "social")
    assert.equal(mapUiMediaTypeToLineChannel("digiDisplay"), "digi_display")
    assert.equal(mapUiMediaTypeToLineChannel("digitalDisplay"), "digi_display")
    assert.equal(mapUiMediaTypeToLineChannel("progBVOD"), "prog_bvod")
    assert.equal(mapUiMediaTypeToLineChannel("integration"), "integrations")
    assert.equal(mapUiMediaTypeToLineChannel("production"), "production")
  })

  it("accepts already-canonical channel enums", () => {
    assert.equal(mapUiMediaTypeToLineChannel("prog_display"), "prog_display")
  })

  it("returns null for unknown", () => {
    assert.equal(mapUiMediaTypeToLineChannel("nope"), null)
  })
})

describe("resolvePostgresSaveMode", () => {
  it("unpublished tip → overwrite / T4a draft (in-place)", () => {
    const r = resolvePostgresSaveMode({
      campaignStatus: "Draft",
      forceIncrement: false,
      publishedVersionNumber: 1,
      versionRowCount: 1,
      tipPublishedAt: null,
    })
    assert.deepEqual(r, {
      mode: "draft",
      versionNumber: 1,
      uiMode: "overwrite",
    })
  })

  it("unpublished tip + forceIncrement → publish / next version", () => {
    const r = resolvePostgresSaveMode({
      campaignStatus: "draft",
      forceIncrement: true,
      publishedVersionNumber: 2,
      versionRowCount: 2,
      tipPublishedAt: null,
    })
    assert.equal(r.mode, "publish")
    assert.equal(r.versionNumber, 3)
    assert.equal(r.uiMode, "increment")
  })

  it("maps first create (no versions) → publish v1", () => {
    const r = resolvePostgresSaveMode({
      campaignStatus: "Draft",
      forceIncrement: false,
      publishedVersionNumber: 0,
      versionRowCount: 0,
      tipPublishedAt: null,
    })
    assert.deepEqual(r, {
      mode: "publish",
      versionNumber: 1,
      uiMode: "increment",
    })
  })

  it("published tip → publish next (status irrelevant)", () => {
    const r = resolvePostgresSaveMode({
      campaignStatus: "Approved",
      forceIncrement: false,
      publishedVersionNumber: 1,
      versionRowCount: 1,
      tipPublishedAt: "2026-01-15T00:00:00.000Z",
    })
    assert.equal(r.mode, "publish")
    assert.equal(r.versionNumber, 2)
    assert.equal(r.uiMode, "increment")
  })

  it("draft→booked on published v1 with lazy-empty versionRowCount → publish v2", () => {
    const r = resolvePostgresSaveMode({
      campaignStatus: "Booked",
      forceIncrement: false,
      publishedVersionNumber: 1,
      versionRowCount: 0,
      tipPublishedAt: "2026-01-15T00:00:00.000Z",
    })
    assert.deepEqual(r, {
      mode: "publish",
      versionNumber: 2,
      uiMode: "increment",
    })
  })

  it("unpublished overwrite still works when version history is lazy-empty", () => {
    const r = resolvePostgresSaveMode({
      campaignStatus: "Draft",
      forceIncrement: false,
      publishedVersionNumber: 1,
      versionRowCount: 0,
      tipPublishedAt: null,
    })
    assert.deepEqual(r, {
      mode: "draft",
      versionNumber: 1,
      uiMode: "overwrite",
    })
  })

  // VC1-3 acceptance — previously unrepresentable cross-states
  it("VC1-3: published + campaign_status=draft → spawn (not overwrite)", () => {
    const r = resolvePostgresSaveMode({
      campaignStatus: "draft",
      forceIncrement: false,
      publishedVersionNumber: 1,
      versionRowCount: 1,
      tipPublishedAt: "2026-06-01T00:00:00.000Z",
    })
    assert.deepEqual(r, {
      mode: "publish",
      versionNumber: 2,
      uiMode: "increment",
    })
  })

  it("VC1-3: unpublished + campaign_status=approved → overwrite in place", () => {
    const r = resolvePostgresSaveMode({
      campaignStatus: "approved",
      forceIncrement: false,
      publishedVersionNumber: 1,
      versionRowCount: 1,
      tipPublishedAt: null,
    })
    assert.deepEqual(r, {
      mode: "draft",
      versionNumber: 1,
      uiMode: "overwrite",
    })
  })

  it("never returns new_version", () => {
    for (const tipPublishedAt of [null, "2026-01-01T00:00:00.000Z", undefined] as const) {
      const r = resolvePostgresSaveMode({
        campaignStatus: "draft",
        forceIncrement: false,
        publishedVersionNumber: 1,
        versionRowCount: 1,
        tipPublishedAt,
      })
      assert.notEqual(r.mode, "new_version")
    }
  })
})
