/**
 * Golden ingest eval — parser vs checked-in fixtures. A moved number fails.
 */
import assert from "node:assert/strict"
import test from "node:test"
import {
  GOLDEN_FIXTURES,
  evaluateGoldenSet,
  readGoldenFile,
} from "../ingestEval"

test("golden set: JCD 95 / 131250.01 / date list; all publishers 100% vs lock", async () => {
  const jcd = readGoldenFile("jcd")
  assert.equal(jcd.line_item_count, 95)
  assert.ok(Math.abs((jcd.file_stated_total ?? 0) - 131250.01) < 0.005)
  assert.ok(jcd.dates.length > 0, "JCD date list must be non-empty")
  assert.equal(GOLDEN_FIXTURES.length, 5)

  const { scores, publishers, failed } = await evaluateGoldenSet()
  assert.deepEqual(failed, [])
  assert.equal(scores.length, 5)
  for (const s of scores) {
    assert.equal(s.n_extra, 0, s.id)
    assert.equal(s.n_missing, 0, s.id)
    assert.equal(s.overall, 1, `${s.id} overall moved`)
  }
  const jcdScore = scores.find((s) => s.id === "jcd")
  assert.equal(jcdScore?.line_count, 95)
  assert.ok(publishers.length >= 4)
})
