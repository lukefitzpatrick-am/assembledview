/**
 * Published-version watermark helpers — staged rows must never leak as live.
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
