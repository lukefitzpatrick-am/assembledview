import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { resolvePostgresSaveMode, SAVE_PUBLISHES_IMMEDIATELY } from "../../resolvePostgresSaveMode.js"
import {
  describePlanSavePill,
  describeVersionHeaderTrail,
  describePartialMbaPublishRail,
  summarizeDraftOffer,
  summarizeLocalOnlyDraftOffer,
  pickNewerDraft,
  isOrphanLocalDraft,
  buildStaleBaseCompare,
  isStalePublishedTip,
  draftAgeDays,
  shouldNudgeStaleDraft,
} from "../pill.js"
import { compareDraftToTip } from "../compare.js"
import { resolveDraftBaseVersionNumber } from "../resolveDraftBaseVersionNumber.js"

describe("PC7 pill shares T4c resolvePostgresSaveMode", () => {
  it("draft overwrite → Draft of v{n} (never published)", { skip: SAVE_PUBLISHES_IMMEDIATELY }, () => {
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
    assert.match(pill.primary, /never published/i)
    assert.match(pill.secondary ?? "", /Autosaved 12s/i)
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

  it("working_draft → Draft of v{n}. Publishing will create next", { skip: SAVE_PUBLISHES_IMMEDIATELY }, () => {
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
    assert.match(pill.primary, /Draft of v1/i)
    assert.match(pill.primary, /Publishing will create v2/i)
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
    assert.match(pill.primary, /Editing v3 \(not yet published\)/i)
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
    assert.match(pill.primary, /Publishing replaces v4/i)
    assert.equal(trail, "Publishing replaces v4")
    assert.doesNotMatch(trail, /Next/i)
  })

  it("published tip → Publishing creates v{n+1}", { skip: SAVE_PUBLISHES_IMMEDIATELY }, () => {
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
    assert.match(pill.primary, /Draft of v4\. Publishing will create v5/i)
    assert.equal(trail, "Publishing creates v5")
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
    assert.match(pill.primary, /(?:Publish|Publishing) will create v5/i)
    assert.equal(trail, "Publishing creates v5")
  })

  it("interim: save on published tip → Publishing will create v{n}", { skip: !SAVE_PUBLISHES_IMMEDIATELY }, () => {
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
    assert.match(pill.primary, /Publishing will create v2/i)
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
    assert.equal(onTip.primary, "Publishing will create v6")

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
      "You're editing v3. Publishing will create v6 and replace v5 for clients"
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
    assert.equal(create.primary, "Publish creates v1")
    assert.doesNotMatch(create.primary, /from v/i)
  })

  it("NV-1: unpublished tip + forceIncrement → Saves as v{n} without publishing", { skip: SAVE_PUBLISHES_IMMEDIATELY }, () => {
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
    assert.equal(pill.primary, "Saves as v3 without publishing")
    assert.equal(trail, "Saves as v3 without publishing")
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

  it("local present, server absent is still pickNewerDraft local — orphan is the caller's load policy", () => {
    const r = pickNewerDraft({
      localUpdatedAt: "2026-08-14T00:00:00.000Z",
      serverUpdatedAt: null,
    })
    assert.equal(r.winner, "local")
    assert.equal(r.reason, "Local draft only")
    assert.equal(
      isOrphanLocalDraft({
        masterId: 1,
        localUpdatedAt: "2026-08-14T00:00:00.000Z",
        serverUpdatedAt: null,
      }),
      true
    )
    assert.equal(
      isOrphanLocalDraft({
        masterId: null,
        localUpdatedAt: "2026-08-14T00:00:00.000Z",
        serverUpdatedAt: null,
      }),
      false,
      "create has no master — local-only is the store, not an orphan"
    )
    assert.equal(
      isOrphanLocalDraft({
        masterId: 1,
        localUpdatedAt: "2026-08-14T00:00:00.000Z",
        serverUpdatedAt: "2026-08-14T00:00:00.000Z",
      }),
      false
    )
    assert.equal(
      isOrphanLocalDraft({
        masterId: 1,
        localUpdatedAt: null,
        serverUpdatedAt: null,
      }),
      false
    )
  })

  it("orphan copy names the local date", () => {
    const s = summarizeLocalOnlyDraftOffer("2026-08-14T00:00:00.000Z")
    assert.match(s, /You have unsaved local changes from/)
    assert.match(s, /2026/)
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

describe("Partial MBA When you publish rail", () => {
  it("names the scoped line count", () => {
    assert.equal(
      describePartialMbaPublishRail({
        isPartial: true,
        inCount: 4,
        totalCount: 7,
      }),
      "Client MBA covers 4 of 7 lines."
    )
    assert.equal(
      describePartialMbaPublishRail({
        isPartial: false,
        inCount: 7,
        totalCount: 7,
      }),
      null
    )
  })
})
