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
} from "../saveDocSteps"

describe("shouldSkipDocsForCampaignStatus", () => {
  it("skips draft / planned / empty", () => {
    assert.equal(shouldSkipDocsForCampaignStatus("draft"), true)
    assert.equal(shouldSkipDocsForCampaignStatus("Draft"), true)
    assert.equal(shouldSkipDocsForCampaignStatus("planned"), true)
    assert.equal(shouldSkipDocsForCampaignStatus(""), true)
    assert.equal(shouldSkipDocsForCampaignStatus(null), true)
  })

  it("does not skip approved / booked / completed", () => {
    assert.equal(shouldSkipDocsForCampaignStatus("approved"), false)
    assert.equal(shouldSkipDocsForCampaignStatus("booked"), false)
    assert.equal(shouldSkipDocsForCampaignStatus("completed"), false)
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
  it("draft save → doc steps skipped → success/complete, not errors", () => {
    const items = [
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

  it("approved publish with forced doc failure → error state preserved", () => {
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
      'Document render requires approved-or-beyond status (got "draft")'
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
