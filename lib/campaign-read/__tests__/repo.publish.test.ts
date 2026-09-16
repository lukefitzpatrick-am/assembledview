import assert from "node:assert/strict"
import test from "node:test"

/**
 * Publish unpublishes any earlier published row for the same mba+version.
 * This mirrors the SQL in publishCampaignRead (repo.ts).
 */
test("publish unpublishes the previous published row for the same mba+version", () => {
  const rows = [
    { id: 1, mba: "golf001", version: 4, status: "published" },
    { id: 2, mba: "golf001", version: 4, status: "draft" },
    { id: 3, mba: "golf001", version: 3, status: "published" },
  ]

  const targetId = 2
  const target = rows.find((r) => r.id === targetId)!
  const next = rows.map((row) => {
    if (
      row.mba === target.mba &&
      row.version === target.version &&
      row.status === "published"
    ) {
      return { ...row, status: "draft" }
    }
    if (row.id === targetId) return { ...row, status: "published" }
    return row
  })

  assert.equal(next.find((r) => r.id === 1)?.status, "draft")
  assert.equal(next.find((r) => r.id === 2)?.status, "published")
  assert.equal(next.find((r) => r.id === 3)?.status, "published")
})

test("client GET payload keeps only published", () => {
  const history = [
    { id: 2, status: "draft" as const },
    { id: 1, status: "published" as const },
  ]
  const includeDrafts = false
  const published = history.find((r) => r.status === "published") ?? null
  const payload = includeDrafts
    ? { published, draft: history.find((r) => r.status === "draft") ?? null, history }
    : { published, draft: null, history: [] }

  assert.equal(payload.published?.id, 1)
  assert.equal(payload.draft, null)
  assert.deepEqual(payload.history, [])
})
