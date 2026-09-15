/**
 * Published-version watermark helpers — staged rows must never leak as live.
 * Pointer-and-stamp is the published-cut rule; watermark stays ordinal-only.
 * Run: npx tsx --test lib/mediaplan/__tests__/publishedVersionGuard.test.ts
 */
import assert from "node:assert/strict"
import test from "node:test"

import {
  clampLatestToPublished,
  filterPublishedVersions,
  isUnpublishedStagedVersion,
  parseVersionNumber,
  pickPublishedVersionRow,
  publishedVersionFromMaster,
  publishedVersionIdFromMaster,
  publishedVersionIfStamped,
  publishedVersionPointerIdFromMaster,
  PUBLISHED_VERSION_JOIN_SQL,
} from "@/lib/mediaplan/publishedVersionGuard"

test("parseVersionNumber", () => {
  assert.equal(parseVersionNumber(3), 3)
  assert.equal(parseVersionNumber("4"), 4)
  assert.equal(parseVersionNumber(null), 0)
  assert.equal(parseVersionNumber("x"), 0)
})

test("filterPublishedVersions hides staged rows above watermark", () => {
  const rows = [
    { id: 1, version_number: 1 },
    { id: 2, version_number: 2 },
    { id: 3, version_number: 3 },
  ]
  assert.deepEqual(
    filterPublishedVersions(rows, 2).map((r) => r.id),
    [1, 2],
  )
  assert.equal(isUnpublishedStagedVersion(3, 2), true)
  assert.equal(isUnpublishedStagedVersion(2, 2), false)
})

test("pickPublishedVersionRow picks highest at or below watermark", () => {
  const rows = [
    { id: 10, version_number: 1 },
    { id: 20, version_number: 2 },
    { id: 30, version_number: 3 },
  ]
  assert.equal(pickPublishedVersionRow(rows, 2)?.id, 20)
  assert.equal(pickPublishedVersionRow(rows, 0), null)
})

test("clampLatestToPublished and publishedVersionFromMaster", () => {
  assert.equal(clampLatestToPublished(5, 2), 2)
  assert.equal(clampLatestToPublished(1, 2), 1)
  assert.equal(publishedVersionFromMaster({ version_number: 7 }), 7)
})

test("publishedVersionPointerIdFromMaster: absent vs null vs id (no stamp)", () => {
  assert.equal(publishedVersionPointerIdFromMaster({ version_number: 7 }), undefined)
  assert.equal(publishedVersionPointerIdFromMaster({ published_version_id: null }), null)
  assert.equal(publishedVersionPointerIdFromMaster({ published_version_id: 42 }), 42)
  assert.equal(publishedVersionPointerIdFromMaster({ publishedVersionId: "9" }), 9)
  assert.equal(publishedVersionPointerIdFromMaster({ published_version_id: 0 }), null)
})

test("publishedVersionIdFromMaster: pointer AND stamp", () => {
  const master = { published_version_id: 42 }
  assert.equal(publishedVersionIdFromMaster({ version_number: 7 }, { published_at: "2026-01-01T00:00:00.000Z" }), undefined)
  assert.equal(publishedVersionIdFromMaster({ published_version_id: null }, { published_at: "2026-01-01T00:00:00.000Z" }), null)
  assert.equal(publishedVersionIdFromMaster(master, { published_at: "2026-01-01T00:00:00.000Z" }), 42)
  assert.equal(publishedVersionIdFromMaster({ publishedVersionId: "9" }, { publishedAt: "2026-01-01T00:00:00.000Z" }), 9)
  assert.equal(publishedVersionIdFromMaster(master, { published_at: null }), null)
  assert.equal(publishedVersionIdFromMaster(master, {}), null)
  assert.equal(publishedVersionIdFromMaster(master, null), null)
  assert.equal(publishedVersionIdFromMaster({ published_version_id: 0 }, { published_at: "2026-01-01T00:00:00.000Z" }), null)
})

test("publishedVersionIfStamped uses isVersionPublished (no third copy)", () => {
  assert.equal(publishedVersionIfStamped(null), null)
  assert.equal(publishedVersionIfStamped(undefined), null)
  assert.equal(publishedVersionIfStamped({ id: 42, published_at: null }), null)
  assert.equal(publishedVersionIfStamped({ id: 42 }), null)
  const stamped = { id: 42, published_at: "2026-01-01T00:00:00.000Z" }
  assert.equal(publishedVersionIfStamped(stamped), stamped)
  const camel = { id: 9, publishedAt: "2026-01-01T00:00:00.000Z" }
  assert.equal(publishedVersionIfStamped(camel), camel)
})

test("PUBLISHED_VERSION_JOIN_SQL is pointer AND stamp; NULL pointer stays unpublished", () => {
  assert.equal(
    PUBLISHED_VERSION_JOIN_SQL,
    "v.id = m.published_version_id AND v.published_at IS NOT NULL",
  )
})
