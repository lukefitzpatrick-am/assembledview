import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { resolvePostgresSaveMode, SAVE_PUBLISHES_IMMEDIATELY } from "../../resolvePostgresSaveMode.js"
import {
  describePlanSavePill,
  describeVersionHeaderTrail,
  summarizeDraftOffer,
  pickNewerDraft,
  buildStaleBaseCompare,
  isStalePublishedTip,
  draftAgeDays,
  shouldNudgeStaleDraft,
} from "../pill.js"
import { compareDraftToTip } from "../compare.js"
import { resolveDraftBaseVersionNumber } from "../resolveDraftBaseVersionNumber.js"

describe("PC7 pill shares T4c resolvePostgresSaveMode", () => {
  it("draft overwrite → Draft of v{n} — publish overwrites", { skip: SAVE_PUBLISHES_IMMEDIATELY }, () => {
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

  it("increment publish → Publish will create v{n+1}", { skip: SAVE_PUBLISHES_IMMEDIATELY }, () => {
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

  it("working_draft → Working draft of v{n}", { skip: SAVE_PUBLISHES_IMMEDIATELY }, () => {
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
  it("unpublished draft tip → overwrite trail, no Next version", { skip: SAVE_PUBLISHES_IMMEDIATELY }, () => {
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

  it("published tip → Next: v{n+1}, pill says publish creates next", { skip: SAVE_PUBLISHES_IMMEDIATELY }, () => {
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
    assert.match(pill.primary, /(?:Publish|Save) will create v5/i)
    assert.equal(trail, "Next: v5")
  })

  it("interim: save on published tip → Save will create v{n}", { skip: !SAVE_PUBLISHES_IMMEDIATELY }, () => {
    const mode = resolvePostgresSaveMode({
      campaignStatus: "Approved",
      forceIncrement: false,
      publishedVersionNumber: 1,
      versionRowCount: 1,
      tipPublishedAt: "2026-01-15T00:00:00.000Z",
    })
    const pill = describePlanSavePill({
      modeResolved: mode,
      hasWorkingDraft: false,
      autosavedSecondsAgo: null,
      editingUnpublishedDraft: false,
      editingVersionNumber: 1,
      publishedTipVersionNumber: 1,
    })
    assert.equal(mode.uiMode, "increment")
    assert.match(pill.primary, /Save will create v2/i)
    assert.doesNotMatch(pill.primary, /from v/i)
  })

  it("SV-1: three pill copies — tip / older base / create", { skip: !SAVE_PUBLISHES_IMMEDIATELY }, () => {
    const tipMode = resolvePostgresSaveMode({
      forceIncrement: false,
      publishedVersionNumber: 5,
      versionRowCount: 5,
      tipPublishedAt: "2026-01-15T00:00:00.000Z",
      intent: "publish",
    })
    const onTip = describePlanSavePill({
      modeResolved: tipMode,
      hasWorkingDraft: false,
      autosavedSecondsAgo: null,
      editingUnpublishedDraft: false,
      editingVersionNumber: 5,
      publishedTipVersionNumber: 5,
    })
    assert.equal(onTip.primary, "Save will create v6")

    const fromOlder = describePlanSavePill({
      modeResolved: tipMode,
      hasWorkingDraft: false,
      autosavedSecondsAgo: null,
      editingUnpublishedDraft: false,
      editingVersionNumber: 3,
      publishedTipVersionNumber: 5,
    })
    assert.equal(
      fromOlder.primary,
      "Save will create v6 from v3 · published tip is v5"
    )

    const createMode = resolvePostgresSaveMode({
      forceIncrement: false,
      publishedVersionNumber: 0,
      versionRowCount: 0,
    })
    const create = describePlanSavePill({
      modeResolved: createMode,
      hasWorkingDraft: false,
      autosavedSecondsAgo: null,
      editingUnpublishedDraft: false,
    })
    assert.equal(create.primary, "Save will create v1")
    assert.doesNotMatch(create.primary, /from v/i)
  })

  it("NV-1: unpublished tip + forceIncrement → Will cut v{n} (stays unpublished)", { skip: SAVE_PUBLISHES_IMMEDIATELY }, () => {
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

  it("SV-1: stale guard checks tip-at-load vs tip-now, not the chosen base", () => {
    // base v3, tip-at-load v5, tip-now v5 → proceed
    assert.equal(
      isStalePublishedTip({
        mode: "publish",
        tipVersionIdAtLoad: 50,
        currentPublishedVersionId: 50,
      }),
      false
    )
    // base v3, tip-at-load v5, tip-now v6 → 409
    assert.equal(
      isStalePublishedTip({
        mode: "publish",
        tipVersionIdAtLoad: 50,
        currentPublishedVersionId: 60,
      }),
      true
    )
    // create (no tip) → proceed even if a pointer exists
    assert.equal(
      isStalePublishedTip({
        mode: "publish",
        tipVersionIdAtLoad: null,
        currentPublishedVersionId: 50,
      }),
      false
    )
    // chosen base must not participate
    assert.equal(
      isStalePublishedTip({
        mode: "publish",
        tipVersionIdAtLoad: 50,
        currentPublishedVersionId: 50,
      }),
      false
    )
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

describe("SM-31: stale banner names the draft base version_number", () => {
  const versions = [
    { id: 10, version_number: 3 },
    { id: "11", version_number: "5" },
  ]

  it("resolves version_number from base_version_id", () => {
    assert.equal(resolveDraftBaseVersionNumber(versions, 10), 3)
    assert.equal(resolveDraftBaseVersionNumber(versions, "11"), 5)
  })

  it("returns null when the id is missing from versions meta", () => {
    assert.equal(resolveDraftBaseVersionNumber(versions, 99), null)
    assert.equal(resolveDraftBaseVersionNumber(versions, null), null)
    assert.equal(resolveDraftBaseVersionNumber([], 10), null)
  })
})
