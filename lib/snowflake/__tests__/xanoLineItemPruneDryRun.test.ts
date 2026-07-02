import assert from "node:assert/strict"
import test from "node:test"

const {
  buildSnapshotPruneQueries,
  normaliseSnapshotPruneMode,
  formatSnapshotPruneLog,
} = await import("../xanoLineItemPruneDryRun.js")

test("defaults snapshot prune mode to dryrun", () => {
  assert.equal(normaliseSnapshotPruneMode(undefined), "dryrun")
})

test("active snapshot prune mode still builds only read-only dry-run queries", () => {
  const queries = buildSnapshotPruneQueries(["LI-1", "LI-1", "LI-2"], "active")

  assert.deepEqual(queries.binds, ["LI-1", "LI-2"])
  assert.match(queries.countSql, /NOT IN/i)
  assert.match(queries.sampleSql, /NOT IN/i)
  assert.doesNotMatch(queries.countSql, /\bDELETE\b/i)
  assert.doesNotMatch(queries.sampleSql, /\bDELETE\b/i)
  assert.doesNotMatch(queries.countSql, /\bTRUNCATE\b/i)
  assert.doesNotMatch(queries.sampleSql, /\bTRUNCATE\b/i)
})

test("formats prune log with total, fixed-cost count, and orphan sample", () => {
  const line = formatSnapshotPruneLog({
    mode: "dryrun",
    orphanCount: 2,
    fixedCostMediaOrphanCount: 1,
    sample: [
      {
        lineItemId: "OLD-1",
        mbaNumber: "MBA-OLD",
        sourceTable: "media_plan_search",
      },
    ],
  })

  assert.match(line, /orphan_count=2/)
  assert.match(line, /fixed_cost_media_orphan_count=1/)
  assert.match(line, /OLD-1/)
  assert.match(line, /MBA-OLD/)
  assert.match(line, /media_plan_search/)
})
