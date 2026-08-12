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

  it("unpublished tip + forceIncrement → new_version / increment_unpublished (NV-1)", () => {
    const r = resolvePostgresSaveMode({
      campaignStatus: "draft",
      forceIncrement: true,
      publishedVersionNumber: 2,
      versionRowCount: 2,
      tipPublishedAt: null,
    })
    assert.deepEqual(r, {
      mode: "new_version",
      versionNumber: 3,
      uiMode: "increment_unpublished",
    })
  })

  it("unpublished tip + intent publish → publish (not new_version)", () => {
    const r = resolvePostgresSaveMode({
      campaignStatus: "draft",
      forceIncrement: false,
      publishedVersionNumber: 2,
      versionRowCount: 2,
      tipPublishedAt: null,
      intent: "publish",
    })
    assert.deepEqual(r, {
      mode: "publish",
      versionNumber: 3,
      uiMode: "increment",
    })
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

  it("VC Stage 2b: published tip + save intent → working_draft (no version cut)", () => {
    const r = resolvePostgresSaveMode({
      campaignStatus: "Approved",
      forceIncrement: false,
      publishedVersionNumber: 1,
      versionRowCount: 1,
      tipPublishedAt: "2026-01-15T00:00:00.000Z",
    })
    assert.deepEqual(r, {
      mode: null,
      versionNumber: 1,
      uiMode: "working_draft",
    })
  })

  it("VC Stage 2b: published tip + intent publish → publish next", () => {
    const r = resolvePostgresSaveMode({
      campaignStatus: "Approved",
      forceIncrement: false,
      publishedVersionNumber: 1,
      versionRowCount: 1,
      tipPublishedAt: "2026-01-15T00:00:00.000Z",
      intent: "publish",
    })
    assert.equal(r.mode, "publish")
    assert.equal(r.versionNumber, 2)
    assert.equal(r.uiMode, "increment")
  })

  it("draft→booked on published v1 with lazy-empty versionRowCount + publish intent → publish v2", () => {
    const r = resolvePostgresSaveMode({
      campaignStatus: "Booked",
      forceIncrement: false,
      publishedVersionNumber: 1,
      versionRowCount: 0,
      tipPublishedAt: "2026-01-15T00:00:00.000Z",
      intent: "publish",
    })
    assert.deepEqual(r, {
      mode: "publish",
      versionNumber: 2,
      uiMode: "increment",
    })
  })

  it("published tip + forceIncrement → publish next (byte-identical to Stage 1)", () => {
    const r = resolvePostgresSaveMode({
      campaignStatus: "Booked",
      forceIncrement: true,
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

  // VC1-3 / Stage 2b — save on published tip writes working draft; publish is explicit
  it("VC1-3: published + status 'draft' + save → working_draft", () => {
    const r = resolvePostgresSaveMode({
      campaignStatus: "draft",
      forceIncrement: false,
      publishedVersionNumber: 1,
      versionRowCount: 1,
      tipPublishedAt: "2026-06-01T00:00:00.000Z",
    })
    assert.equal(r.uiMode, "working_draft")
    assert.equal(r.versionNumber, 1)
    assert.equal(r.mode, null)
  })

  it("VC1-3: published + status 'planned' + save → working_draft", () => {
    const r = resolvePostgresSaveMode({
      campaignStatus: "planned",
      forceIncrement: false,
      publishedVersionNumber: 1,
      versionRowCount: 1,
      tipPublishedAt: "2026-06-01T00:00:00.000Z",
    })
    assert.equal(r.uiMode, "working_draft")
    assert.equal(r.versionNumber, 1)
  })

  it("VC1-3: published + status 'approved' + save → working_draft", () => {
    const r = resolvePostgresSaveMode({
      campaignStatus: "approved",
      forceIncrement: false,
      publishedVersionNumber: 1,
      versionRowCount: 1,
      tipPublishedAt: "2026-06-01T00:00:00.000Z",
    })
    assert.equal(r.uiMode, "working_draft")
    assert.equal(r.versionNumber, 1)
  })

  it("VC1-3: unpublished (draft) -> save OVERWRITES in place", () => {
    const r = resolvePostgresSaveMode({
      campaignStatus: "draft",
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

  it("returns new_version only for unpublished-tip forceIncrement (NV-1)", () => {
    const unpublishedForce = resolvePostgresSaveMode({
      campaignStatus: "draft",
      forceIncrement: true,
      publishedVersionNumber: 1,
      versionRowCount: 1,
      tipPublishedAt: null,
    })
    assert.equal(unpublishedForce.mode, "new_version")
    assert.equal(unpublishedForce.uiMode, "increment_unpublished")

    for (const tipPublishedAt of [
      "2026-01-01T00:00:00.000Z",
      undefined,
    ] as const) {
      const r = resolvePostgresSaveMode({
        campaignStatus: "draft",
        forceIncrement: false,
        publishedVersionNumber: 1,
        versionRowCount: 1,
        tipPublishedAt,
      })
      assert.notEqual(r.mode as string | null, "new_version")
    }

    const firstCreate = resolvePostgresSaveMode({
      campaignStatus: "Draft",
      forceIncrement: false,
      publishedVersionNumber: 0,
      versionRowCount: 0,
      tipPublishedAt: null,
    })
    assert.notEqual(firstCreate.mode as string | null, "new_version")

    const intentPublish = resolvePostgresSaveMode({
      campaignStatus: "draft",
      forceIncrement: false,
      publishedVersionNumber: 1,
      versionRowCount: 1,
      tipPublishedAt: null,
      intent: "publish",
    })
    assert.equal(intentPublish.mode, "publish")
  })
})
