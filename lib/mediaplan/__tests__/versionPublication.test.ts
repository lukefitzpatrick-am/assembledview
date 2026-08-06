import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  isVersionPublished,
  normalisePublishedByEmail,
  warnIfPublishMissingPublishedBy,
} from "../versionPublication"
import { mapPlanVersionFromPostgres } from "@/lib/data/readMediaPlans"

describe("isVersionPublished", () => {
  it("null publishedAt → false", () => {
    assert.equal(isVersionPublished({ publishedAt: null }), false)
  })

  it("undefined publishedAt → false", () => {
    assert.equal(isVersionPublished({}), false)
    assert.equal(isVersionPublished({ publishedAt: undefined }), false)
  })

  it("timestamp publishedAt → true", () => {
    assert.equal(
      isVersionPublished({ publishedAt: "2025-01-01T00:00:00.000Z" }),
      true
    )
  })
})

describe("normalisePublishedByEmail", () => {
  it("lowercases and trims", () => {
    assert.equal(
      normalisePublishedByEmail("  Luke@Assembled.Media "),
      "luke@assembled.media"
    )
  })

  it("null / empty → null", () => {
    assert.equal(normalisePublishedByEmail(null), null)
    assert.equal(normalisePublishedByEmail(undefined), null)
    assert.equal(normalisePublishedByEmail("   "), null)
  })
})

describe("warnIfPublishMissingPublishedBy", () => {
  it("warns on publish with null email; no throw", () => {
    const warnings: unknown[] = []
    const original = console.warn
    console.warn = (...args: unknown[]) => {
      warnings.push(args)
    }
    try {
      warnIfPublishMissingPublishedBy("publish", null, { mbaNumber: "x" })
      warnIfPublishMissingPublishedBy("draft", null, { mbaNumber: "x" })
      warnIfPublishMissingPublishedBy("publish", "a@b.com", { mbaNumber: "x" })
      assert.equal(warnings.length, 1)
      assert.match(String((warnings[0] as unknown[])?.[0]), /published_by left null/)
    } finally {
      console.warn = original
    }
  })
})

/**
 * Editor version-list shape (see edit page `availableVersions` / MBA GET
 * `versionsMetadata`): id + version_number + created_at + publication columns.
 */
function toEditorVersionListEntry(v: Record<string, unknown>): {
  id: unknown
  version_number: number
  created_at: unknown
  published_at: unknown
  published_by: unknown
} {
  const vn = v.version_number
  return {
    id: v.id,
    version_number:
      typeof vn === "string" ? parseInt(vn, 10) : Number(vn) || 0,
    created_at: v.created_at ?? null,
    published_at: v.published_at ?? null,
    published_by: v.published_by ?? null,
  }
}

describe("published_at survives DB → editor version-list shape", () => {
  it("mapPlanVersionFromPostgres keeps published_at / published_by", () => {
    const mapped = mapPlanVersionFromPostgres({
      id: 99,
      masterId: 1,
      mbaNumber: "001001",
      versionNumber: 3,
      campaignName: "Test",
      campaignStatus: "draft",
      campaignStartDate: null,
      campaignEndDate: null,
      brand: null,
      clientContact: null,
      poNumber: null,
      campaignBudgetCents: null,
      fixedFee: null,
      channelFlags: {},
      legacySchedules: {},
      mediaPlanFile: null,
      mbaPdfFile: null,
      aaMediaPlanFile: null,
      createdAt: "2025-06-01T12:00:00.000Z",
      publishedAt: "2025-06-01T12:00:00.000Z",
      publishedBy: "luke@assembled.media",
    })

    assert.equal(mapped.published_at, "2025-06-01T12:00:00.000Z")
    assert.equal(mapped.published_by, "luke@assembled.media")
    assert.equal(isVersionPublished({ publishedAt: mapped.published_at as string }), true)

    const editorEntry = toEditorVersionListEntry(mapped)
    assert.equal(editorEntry.published_at, "2025-06-01T12:00:00.000Z")
    assert.equal(editorEntry.published_by, "luke@assembled.media")
    assert.equal(editorEntry.version_number, 3)
  })

  it("null published_at maps through as null (unpublished)", () => {
    const mapped = mapPlanVersionFromPostgres({
      id: 100,
      masterId: 1,
      mbaNumber: "001001",
      versionNumber: 4,
      campaignName: "Draft tip",
      campaignStatus: "draft",
      campaignStartDate: null,
      campaignEndDate: null,
      brand: null,
      clientContact: null,
      poNumber: null,
      campaignBudgetCents: null,
      fixedFee: null,
      channelFlags: {},
      legacySchedules: {},
      mediaPlanFile: null,
      mbaPdfFile: null,
      aaMediaPlanFile: null,
      createdAt: "2025-07-01T12:00:00.000Z",
      publishedAt: null,
      publishedBy: null,
    })

    assert.equal(mapped.published_at, null)
    assert.equal(mapped.published_by, null)
    assert.equal(isVersionPublished({ publishedAt: mapped.published_at as null }), false)

    const editorEntry = toEditorVersionListEntry(mapped)
    assert.equal(editorEntry.published_at, null)
    assert.equal(editorEntry.published_by, null)
  })
})
