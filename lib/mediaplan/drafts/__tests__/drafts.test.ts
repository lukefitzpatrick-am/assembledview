import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { resolvePostgresSaveMode } from "../../resolvePostgresSaveMode.js"
import {
  describePlanSavePill,
  describeVersionHeaderTrail,
  summarizeDraftOffer,
  pickNewerDraft,
  buildStaleBaseCompare,
  draftAgeDays,
  shouldNudgeStaleDraft,
} from "../pill.js"
import { compareDraftToTip } from "../compare.js"

describe("PC7 pill shares T4c resolvePostgresSaveMode", () => {
  it("draft overwrite → Draft of v{n} — publish overwrites", () => {
    const mode = resolvePostgresSaveMode({
      campaignStatus: "Draft",
      forceIncrement: false,
      publishedVersionNumber: 2,
      versionRowCount: 2,
      tipPublishedAt: null,
    })
    const pill = describePlanSavePill({
      modeResolved: mode,
      hasWorkingDraft: true,
      autosavedSecondsAgo: 12,
      editingUnpublishedDraft: false,
    })
    assert.equal(mode.uiMode, "overwrite")
    assert.match(pill.primary, /Draft of v2/i)
    assert.match(pill.primary, /overwrite/i)
    assert.match(pill.secondary ?? "", /autosaved 12s/i)
  })

  it("increment publish → Publish will create v{n+1}", () => {
    const mode = resolvePostgresSaveMode({
      campaignStatus: "Approved",
      forceIncrement: false,
      publishedVersionNumber: 1,
      versionRowCount: 1,
      tipPublishedAt: "2026-01-15T00:00:00.000Z",
      intent: "publish",
    })
    const pill = describePlanSavePill({
      modeResolved: mode,
      hasWorkingDraft: false,
      autosavedSecondsAgo: null,
      editingUnpublishedDraft: false,
    })
    assert.equal(mode.uiMode, "increment")
    assert.match(pill.primary, /Publish will create v2/i)
  })

  it("working_draft → Working draft of v{n}", () => {
    const mode = resolvePostgresSaveMode({
      campaignStatus: "Approved",
      forceIncrement: false,
      publishedVersionNumber: 1,
      versionRowCount: 1,
      tipPublishedAt: "2026-01-15T00:00:00.000Z",
    })
    const pill = describePlanSavePill({
      modeResolved: mode,
      hasWorkingDraft: true,
      autosavedSecondsAgo: null,
      editingUnpublishedDraft: false,
    })
    assert.equal(mode.uiMode, "working_draft")
    assert.match(pill.primary, /Working draft of v1/i)
  })

  it("editing unpublished draft label", () => {
    const mode = resolvePostgresSaveMode({
      campaignStatus: "Draft",
      forceIncrement: false,
      publishedVersionNumber: 3,
      versionRowCount: 3,
      tipPublishedAt: null,
    })
    const pill = describePlanSavePill({
      modeResolved: mode,
      hasWorkingDraft: true,
      autosavedSecondsAgo: 3,
      editingUnpublishedDraft: true,
    })
    assert.match(pill.primary, /Editing v3 — unpublished draft/i)
  })
})

describe("version header trail shares resolvePostgresSaveMode with pill", () => {
  it("unpublished draft tip → overwrite trail, no Next version", () => {
    const mode = resolvePostgresSaveMode({
      campaignStatus: "Draft",
      forceIncrement: false,
      publishedVersionNumber: 4,
      versionRowCount: 4,
      tipPublishedAt: null,
    })
    const pill = describePlanSavePill({
      modeResolved: mode,
      hasWorkingDraft: false,
      autosavedSecondsAgo: null,
      editingUnpublishedDraft: false,
    })
    const trail = describeVersionHeaderTrail(mode)
    assert.equal(mode.uiMode, "overwrite")
    assert.match(pill.primary, /publish overwrites v4/i)
    assert.equal(trail, "publish overwrites v4")
    assert.doesNotMatch(trail, /Next/i)
  })

  it("published tip → Next: v{n+1}, pill says publish creates next", () => {
    const mode = resolvePostgresSaveMode({
      campaignStatus: "Approved",
      forceIncrement: false,
      publishedVersionNumber: 4,
      versionRowCount: 4,
      tipPublishedAt: "2026-01-15T00:00:00.000Z",
    })
    const pill = describePlanSavePill({
      modeResolved: mode,
      hasWorkingDraft: true,
      autosavedSecondsAgo: null,
      editingUnpublishedDraft: false,
    })
    const trail = describeVersionHeaderTrail(mode)
    assert.equal(mode.uiMode, "working_draft")
    assert.match(pill.primary, /publish creates next version/i)
    assert.equal(trail, "Next: v5")
  })

  it("publish intent on published tip → Next uses resolved increment version", () => {
    const mode = resolvePostgresSaveMode({
      campaignStatus: "Approved",
      forceIncrement: false,
      publishedVersionNumber: 4,
      versionRowCount: 4,
      tipPublishedAt: "2026-01-15T00:00:00.000Z",
      intent: "publish",
    })
    const pill = describePlanSavePill({
      modeResolved: mode,
      hasWorkingDraft: false,
      autosavedSecondsAgo: null,
      editingUnpublishedDraft: false,
    })
    const trail = describeVersionHeaderTrail(mode)
    assert.equal(mode.uiMode, "increment")
    assert.match(pill.primary, /Publish will create v5/i)
    assert.equal(trail, "Next: v5")
  })

  it("NV-1: unpublished tip + forceIncrement → Will cut v{n} (stays unpublished)", () => {
    const mode = resolvePostgresSaveMode({
      campaignStatus: "Draft",
      forceIncrement: true,
      publishedVersionNumber: 2,
      versionRowCount: 2,
      tipPublishedAt: null,
    })
    const pill = describePlanSavePill({
      modeResolved: mode,
      hasWorkingDraft: false,
      autosavedSecondsAgo: null,
      editingUnpublishedDraft: false,
    })
    const trail = describeVersionHeaderTrail(mode)
    assert.equal(mode.uiMode, "increment_unpublished")
    assert.equal(mode.mode, "new_version")
    assert.equal(pill.primary, "Will cut v3 (stays unpublished)")
    assert.equal(trail, "Will cut v3 (stays unpublished)")
  })
})

describe("PC7 draft offer + newer wins", () => {
  it("summarises resume offer", () => {
    const s = summarizeDraftOffer({
      updatedAt: "2026-07-30T10:00:00.000Z",
      linesChanged: 4,
      budgetDeltaDollars: 1250,
    })
    assert.match(s, /Draft from/)
    assert.match(s, /4 lines/)
    assert.match(s, /\+\$1250/)
  })

  it("picks newer of local vs server", () => {
    const r = pickNewerDraft({
      localUpdatedAt: "2026-07-30T12:00:00.000Z",
      serverUpdatedAt: "2026-07-30T11:00:00.000Z",
    })
    assert.equal(r.winner, "local")
    assert.match(r.reason, /newer/i)
  })
})

describe("PC7 compare + stale-base", () => {
  it("line-level compare vs tip", () => {
    const diff = compareDraftToTip({
      tipLineIds: ["A", "B"],
      draftLineIds: ["B", "C"],
      tipBudgetCents: 10000,
      draftBudgetCents: 12000,
    })
    assert.deepEqual(diff.added, ["C"])
    assert.deepEqual(diff.removed, ["A"])
    assert.deepEqual(diff.kept, ["B"])
    assert.equal(diff.budgetDeltaCents, 2000)
  })

  it("stale-base compare payload", () => {
    const c = buildStaleBaseCompare({
      baseVersionId: 10,
      currentVersionId: 12,
      yoursLineCount: 5,
      tipLineCount: 4,
    })
    assert.equal(c.baseVersionId, 10)
    assert.equal(c.currentVersionId, 12)
    assert.ok(c.sections.base && c.sections.yours && c.sections.current)
  })
})

describe("PC7 retention nudge", () => {
  it("nudges after 30 days", () => {
    assert.equal(draftAgeDays("2026-06-01T00:00:00Z", new Date("2026-07-02T00:00:00Z")), 31)
    assert.equal(
      shouldNudgeStaleDraft({
        updatedAt: "2026-06-01T00:00:00Z",
        now: new Date("2026-07-02T00:00:00Z"),
      }),
      true
    )
    assert.equal(
      shouldNudgeStaleDraft({
        updatedAt: "2026-07-01T00:00:00Z",
        now: new Date("2026-07-02T00:00:00Z"),
      }),
      false
    )
  })
})
