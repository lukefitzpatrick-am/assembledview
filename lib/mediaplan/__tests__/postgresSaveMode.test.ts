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
  it("maps draft+existing → overwrite / T4a draft (3e22b836 in-place)", () => {
    const r = resolvePostgresSaveMode({
      campaignStatus: "Draft",
      forceIncrement: false,
      publishedVersionNumber: 1,
      versionRowCount: 1,
    })
    assert.deepEqual(r, {
      mode: "draft",
      versionNumber: 1,
      uiMode: "overwrite",
    })
  })

  it("maps draft+forceIncrement → publish / next version", () => {
    const r = resolvePostgresSaveMode({
      campaignStatus: "draft",
      forceIncrement: true,
      publishedVersionNumber: 2,
      versionRowCount: 2,
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
    })
    assert.deepEqual(r, {
      mode: "publish",
      versionNumber: 1,
      uiMode: "increment",
    })
  })

  it("maps approved status → publish next", () => {
    const r = resolvePostgresSaveMode({
      campaignStatus: "Approved",
      forceIncrement: false,
      publishedVersionNumber: 1,
      versionRowCount: 1,
    })
    assert.equal(r.mode, "publish")
    assert.equal(r.versionNumber, 2)
    assert.equal(r.uiMode, "increment")
  })
})
