import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  DOC_SKIP_REASON,
  DOC_STEP_MBA,
  DOC_STEP_MEDIA_PLAN,
  classifyDocStepFailure,
  isExpectedDocGateSkipError,
  savingDialogHasErrors,
  savingDialogTitleKind,
  shouldSkipDocsForCampaignStatus,
  skippedDocStepItems,
  type SaveDocStepItem,
} from "../saveDocSteps"

describe("shouldSkipDocsForCampaignStatus (publication)", () => {
  it("skips when unpublished / null version", () => {
    assert.equal(shouldSkipDocsForCampaignStatus({ publishedAt: null }), true)
    assert.equal(shouldSkipDocsForCampaignStatus({ published_at: null }), true)
    assert.equal(shouldSkipDocsForCampaignStatus(null), true)
    assert.equal(shouldSkipDocsForCampaignStatus(undefined), true)
  })

  it("does not skip when published_at is set", () => {
    assert.equal(
      shouldSkipDocsForCampaignStatus({ publishedAt: "2026-06-01T00:00:00.000Z" }),
      false
    )
    assert.equal(
      shouldSkipDocsForCampaignStatus({ published_at: "2026-06-01T00:00:00.000Z" }),
      false
    )
  })

  // VC1-3 acceptance
  it("VC1-3: published + campaign_status=draft → docs generate (do not skip)", () => {
    assert.equal(
      shouldSkipDocsForCampaignStatus({ publishedAt: "2026-06-01T00:00:00.000Z" }),
      false
    )
  })

  it("VC1-3: unpublished + campaign_status=approved → docs skipped", () => {
    assert.equal(shouldSkipDocsForCampaignStatus({ publishedAt: null }), true)
  })
})

describe("isExpectedDocGateSkipError", () => {
  it("recognises PC3 persisted-render gate messages", () => {
    assert.equal(
      isExpectedDocGateSkipError(
        'Document render requires approved-or-beyond status (got "draft")'
      ),
      true
    )
    assert.equal(
      isExpectedDocGateSkipError(
        'Document download requires a published version (published_at set; campaign_status="draft")'
      ),
      true
    )
    assert.equal(
      isExpectedDocGateSkipError(
        'Document download requires approved-or-beyond status (got "planned")'
      ),
      true
    )
  })

  it("does not treat unrelated failures as skips", () => {
    assert.equal(isExpectedDocGateSkipError("Failed to upload documents"), false)
    assert.equal(isExpectedDocGateSkipError("Network error"), false)
  })
})

describe("saving dialog state with skipped doc steps", () => {
  it("unpublished save → doc steps skipped → success/complete, not errors", () => {
    const items: SaveDocStepItem[] = [
      { name: "Media Plan Version", status: "success" },
      ...skippedDocStepItems(),
      { name: "Search", status: "success" },
    ]
    assert.equal(savingDialogHasErrors(items), false)
    assert.equal(savingDialogTitleKind(items, false), "complete")
    assert.equal(items.find((i) => i.name === DOC_STEP_MBA)?.status, "skipped")
    assert.equal(
      items.find((i) => i.name === DOC_STEP_MEDIA_PLAN)?.error,
      DOC_SKIP_REASON
    )
  })

  it("published publish with forced doc failure → error state preserved", () => {
    const items = [
      { name: "Media Plan Version", status: "success" },
      {
        name: DOC_STEP_MBA,
        status: "error",
        error: "Failed to generate PDF",
      },
      {
        name: DOC_STEP_MEDIA_PLAN,
        status: "error",
        error: "Failed to upload documents",
      },
    ]
    assert.equal(savingDialogHasErrors(items), true)
    assert.equal(savingDialogTitleKind(items, false), "errors")
  })

  it("skips alone never enter error title while still saving", () => {
    const items = skippedDocStepItems()
    assert.equal(savingDialogHasErrors(items), false)
    assert.equal(savingDialogTitleKind(items, true), "saving")
  })
})

describe("classifyDocStepFailure", () => {
  it("reclassifies PC3 gate as skipped with stable copy", () => {
    const c = classifyDocStepFailure(
      'Document render requires a published version (published_at set; campaign_status="draft")'
    )
    assert.equal(c.status, "skipped")
    assert.equal(c.error, DOC_SKIP_REASON)
  })

  it("keeps real failures as errors", () => {
    const c = classifyDocStepFailure("Failed to generate PDF")
    assert.equal(c.status, "error")
    assert.equal(c.error, "Failed to generate PDF")
  })
})
