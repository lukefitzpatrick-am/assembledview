import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { mapUiMediaTypeToLineChannel } from "../mapUiMediaTypeToLineChannel"
import {
  buildSaveModeInput,
  resolvePostgresSaveMode,
  type ResolvePostgresSaveModeInput,
} from "../resolvePostgresSaveMode"

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

  it("editing older + save → new_version / increment_unpublished at newest+1", () => {
    const r = resolvePostgresSaveMode({
      campaignStatus: "draft",
      forceIncrement: false,
      publishedVersionNumber: 5,
      editingVersionNumber: 3,
      versionRowCount: 5,
      tipPublishedAt: null,
      intent: "save",
    })
    assert.deepEqual(r, {
      mode: "new_version",
      versionNumber: 6,
      uiMode: "increment_unpublished",
    })
  })

  it("editing older + save on a published newest still cuts next unpublished (not working_draft)", () => {
    const r = resolvePostgresSaveMode({
      campaignStatus: "approved",
      forceIncrement: false,
      publishedVersionNumber: 5,
      editingVersionNumber: 3,
      versionRowCount: 5,
      tipPublishedAt: "2026-08-01T00:00:00.000Z",
      intent: "save",
    })
    assert.deepEqual(r, {
      mode: "new_version",
      versionNumber: 6,
      uiMode: "increment_unpublished",
    })
  })

  it("editing older + publish → unchanged from today", () => {
    const unpublishedNewest = resolvePostgresSaveMode({
      campaignStatus: "draft",
      forceIncrement: false,
      publishedVersionNumber: 5,
      editingVersionNumber: 3,
      versionRowCount: 5,
      tipPublishedAt: null,
      intent: "publish",
    })
    const unpublishedNewestToday = resolvePostgresSaveMode({
      campaignStatus: "draft",
      forceIncrement: false,
      publishedVersionNumber: 5,
      versionRowCount: 5,
      tipPublishedAt: null,
      intent: "publish",
    })
    assert.deepEqual(unpublishedNewest, unpublishedNewestToday)
    assert.deepEqual(unpublishedNewest, {
      mode: "publish",
      versionNumber: 6,
      uiMode: "increment",
    })

    const publishedNewest = resolvePostgresSaveMode({
      campaignStatus: "approved",
      forceIncrement: false,
      publishedVersionNumber: 5,
      editingVersionNumber: 3,
      versionRowCount: 5,
      tipPublishedAt: "2026-08-01T00:00:00.000Z",
      intent: "publish",
    })
    const publishedNewestToday = resolvePostgresSaveMode({
      campaignStatus: "approved",
      forceIncrement: false,
      publishedVersionNumber: 5,
      versionRowCount: 5,
      tipPublishedAt: "2026-08-01T00:00:00.000Z",
      intent: "publish",
    })
    assert.deepEqual(publishedNewest, publishedNewestToday)
    assert.deepEqual(publishedNewest, {
      mode: "publish",
      versionNumber: 6,
      uiMode: "increment",
    })
  })

  it("S2 regression: editing newest + save, unpublished → overwrite", () => {
    const r = resolvePostgresSaveMode({
      campaignStatus: "draft",
      forceIncrement: false,
      publishedVersionNumber: 5,
      editingVersionNumber: 5,
      versionRowCount: 5,
      tipPublishedAt: null,
      intent: "save",
    })
    assert.deepEqual(r, {
      mode: "draft",
      versionNumber: 5,
      uiMode: "overwrite",
    })
  })

  it("S3 regression: editing newest + save, published → working_draft", () => {
    const r = resolvePostgresSaveMode({
      campaignStatus: "approved",
      forceIncrement: false,
      publishedVersionNumber: 5,
      editingVersionNumber: 5,
      versionRowCount: 5,
      tipPublishedAt: "2026-08-01T00:00:00.000Z",
      intent: "save",
    })
    assert.deepEqual(r, {
      mode: null,
      versionNumber: 5,
      uiMode: "working_draft",
    })
  })

  it("editingVersionNumber omitted → identical result to today, every branch", () => {
    const branches: ResolvePostgresSaveModeInput[] = [
      {
        campaignStatus: "Draft",
        forceIncrement: false,
        publishedVersionNumber: 1,
        versionRowCount: 1,
        tipPublishedAt: null,
      },
      {
        campaignStatus: "draft",
        forceIncrement: true,
        publishedVersionNumber: 2,
        versionRowCount: 2,
        tipPublishedAt: null,
      },
      {
        campaignStatus: "draft",
        forceIncrement: false,
        publishedVersionNumber: 2,
        versionRowCount: 2,
        tipPublishedAt: null,
        intent: "publish",
      },
      {
        campaignStatus: "Draft",
        forceIncrement: false,
        publishedVersionNumber: 0,
        versionRowCount: 0,
        tipPublishedAt: null,
      },
      {
        campaignStatus: "Approved",
        forceIncrement: false,
        publishedVersionNumber: 1,
        versionRowCount: 1,
        tipPublishedAt: "2026-01-15T00:00:00.000Z",
      },
      {
        campaignStatus: "Approved",
        forceIncrement: false,
        publishedVersionNumber: 1,
        versionRowCount: 1,
        tipPublishedAt: "2026-01-15T00:00:00.000Z",
        intent: "publish",
      },
      {
        campaignStatus: "Booked",
        forceIncrement: true,
        publishedVersionNumber: 1,
        versionRowCount: 0,
        tipPublishedAt: "2026-01-15T00:00:00.000Z",
      },
      {
        campaignStatus: "Draft",
        forceIncrement: false,
        publishedVersionNumber: 1,
        versionRowCount: 0,
        tipPublishedAt: null,
      },
    ]
    for (const branch of branches) {
      const omitted = resolvePostgresSaveMode(branch)
      const explicitUndefined = resolvePostgresSaveMode({
        ...branch,
        editingVersionNumber: undefined,
      })
      const equalToNewest = resolvePostgresSaveMode({
        ...branch,
        editingVersionNumber: branch.publishedVersionNumber,
      })
      assert.deepEqual(omitted, explicitUndefined)
      assert.deepEqual(omitted, equalToNewest)
    }
  })

  it("editingVersionNumber > published (impossible) → treated as newest, not older", () => {
    const unpublished = resolvePostgresSaveMode({
      campaignStatus: "draft",
      forceIncrement: false,
      publishedVersionNumber: 3,
      editingVersionNumber: 5,
      versionRowCount: 5,
      tipPublishedAt: null,
      intent: "save",
    })
    assert.deepEqual(unpublished, {
      mode: "draft",
      versionNumber: 3,
      uiMode: "overwrite",
    })

    const published = resolvePostgresSaveMode({
      campaignStatus: "approved",
      forceIncrement: false,
      publishedVersionNumber: 3,
      editingVersionNumber: 5,
      versionRowCount: 5,
      tipPublishedAt: "2026-08-01T00:00:00.000Z",
      intent: "save",
    })
    assert.deepEqual(published, {
      mode: null,
      versionNumber: 3,
      uiMode: "working_draft",
    })
  })
})

describe("buildSaveModeInput", () => {
  it("label helper and submit helper return the SAME input object for the same state", () => {
    const sharedState = {
      latestVersionNumber: 5,
      mediaPlan: {
        version_number: 3,
        published_at: "2026-07-01T00:00:00.000Z" as string | null,
      },
      availableVersions: [
        { version_number: 1, published_at: "2026-01-01T00:00:00.000Z" },
        { version_number: 3, published_at: "2026-07-01T00:00:00.000Z" },
        { version_number: 5, published_at: null },
      ],
      selectedVersionNumber: 3,
      forceIncrement: false,
      intent: "save" as const,
      campaignStatus: "draft",
    }
    const labelInput = buildSaveModeInput(sharedState)
    const submitInput = buildSaveModeInput(sharedState)
    assert.deepEqual(labelInput, submitInput)
    assert.equal(labelInput.publishedVersionNumber, 5)
    assert.equal(labelInput.editingVersionNumber, 3)
    assert.equal(labelInput.tipPublishedAt, "2026-07-01T00:00:00.000Z")
  })

  it("unifies the former label/submit fallbacks onto newest, not selected", () => {
    const input = buildSaveModeInput({
      latestVersionNumber: undefined,
      mediaPlan: { version_number: undefined, published_at: undefined },
      availableVersions: [
        { version_number: 2, published_at: null },
        { version_number: 5, published_at: null },
      ],
      selectedVersionNumber: 2,
      forceIncrement: false,
      intent: "save",
      campaignStatus: "draft",
    })
    assert.equal(input.publishedVersionNumber, 5)
    assert.equal(input.editingVersionNumber, 2)
  })
})
