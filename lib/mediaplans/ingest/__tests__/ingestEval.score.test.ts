/**
 * Ingest eval scorer — unit, no workbook I/O.
 */
import assert from "node:assert/strict"
import test from "node:test"
import {
  rollupPublishers,
  scoreFixture,
  scoreLine,
  type GoldenFixtureFile,
  type GoldenLine,
} from "../ingestEval"

function line(over: Partial<GoldenLine> = {}): GoldenLine {
  return {
    source_row_ref: "Paid!r10",
    money: 100.01,
    dates: [{ from: "2026-10-01", to: "2026-10-07" }],
    format: "large_format",
    placement: null,
    buy_type: "fixed_cost",
    ...over,
  }
}

test("scoreLine is exact on money/dates/format/placement/buy type", () => {
  const a = line()
  assert.deepEqual(scoreLine(a, a), {
    money: true,
    dates: true,
    format: true,
    placement: true,
    buy_type: true,
  })
  assert.equal(scoreLine(a, line({ money: 100.02 })).money, false)
  assert.equal(
    scoreLine(a, line({ dates: [{ from: "2026-10-01", to: "2026-10-08" }] }))
      .dates,
    false,
  )
  assert.equal(scoreLine(a, line({ format: "unresolved:RAIL" })).format, false)
  assert.equal(scoreLine(a, line({ placement: "station" })).placement, false)
  assert.equal(scoreLine(a, line({ buy_type: "spots" })).buy_type, false)
})

test("scoreFixture treats extra/missing source_row_ref as all-fields miss", () => {
  const expected: GoldenFixtureFile = {
    id: "qms",
    publisher: "QMS",
    file: "qms.xlsx",
    line_item_count: 1,
    file_stated_total: 100,
    total_media_amount: 100,
    dates: ["2026-10-01"],
    lines: [line()],
  }
  const actual: GoldenFixtureFile = {
    ...expected,
    line_item_count: 2,
    lines: [line(), line({ source_row_ref: "Paid!r11" })],
  }
  const score = scoreFixture(expected, actual)
  assert.equal(score.n_compared, 1)
  assert.equal(score.n_extra, 1)
  assert.equal(score.n_missing, 0)
  assert.ok(score.overall < 1)
  const pubs = rollupPublishers([score])
  assert.equal(pubs[0]!.publisher, "QMS")
})
