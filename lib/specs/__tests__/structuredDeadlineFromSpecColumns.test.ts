/**
 * C-53: publisher_specs deadline columns win; prose parse is fallback only.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { deriveMaterialDeadlines } from "../deriveMaterialDeadlines.js"
import { parseSupplyDeadline } from "../parseSupplyDeadline.js"
import { structuredDeadlineFromSpecColumns } from "../structuredDeadlineFromSpecColumns.js"

const TEN_WD = { min_days: 10, max_days: 10, business_days: true }
const RANGE_5_10 = { min_days: 5, max_days: 10, business_days: true }

const QMS_COLUMNS = {
  supplyDeadlineMinDays: 10,
  supplyDeadlineMaxDays: 10,
  supplyDeadlineBusinessDays: true,
}

test("columns set: uses publisher_specs numbers and does not call the parser", () => {
  let calls = 0
  const parse = (prose: string | null | undefined) => {
    calls += 1
    return parseSupplyDeadline(prose)
  }
  const result = structuredDeadlineFromSpecColumns(
    QMS_COLUMNS,
    "5 working days before live",
    parse,
  )
  assert.deepEqual(result, TEN_WD)
  assert.equal(calls, 0)
})

test("row missing or columns NULL: falls back to the prose parse", () => {
  let calls = 0
  const parse = (prose: string | null | undefined) => {
    calls += 1
    return parseSupplyDeadline(prose)
  }
  assert.deepEqual(
    structuredDeadlineFromSpecColumns(
      null,
      "5-10 working days before live (confirm per booking)",
      parse,
    ),
    RANGE_5_10,
  )
  assert.equal(calls, 1)

  const incomplete = {
    supplyDeadlineMinDays: 10,
    supplyDeadlineMaxDays: null,
    supplyDeadlineBusinessDays: true,
  }
  assert.deepEqual(
    structuredDeadlineFromSpecColumns(incomplete, "10 working days before live", parse),
    TEN_WD,
  )
  assert.equal(calls, 2)

  assert.equal(
    structuredDeadlineFromSpecColumns(
      {
        supplyDeadlineMinDays: null,
        supplyDeadlineMaxDays: null,
        supplyDeadlineBusinessDays: null,
      },
      "Typically 3-5 business days before broadcast — confirm with Seven",
      parse,
    ),
    null,
  )
  assert.equal(calls, 3)
})

test("golden Cover text unchanged for QMS / JCDecaux when columns supply TEN_WD", () => {
  const qmsStructured = structuredDeadlineFromSpecColumns(
    QMS_COLUMNS,
    "10 working days before live",
    () => {
      throw new Error("parser must not run when QMS columns are set")
    },
  )
  const jcStructured = structuredDeadlineFromSpecColumns(
    {
      supplyDeadlineMinDays: 10,
      supplyDeadlineMaxDays: 10,
      supplyDeadlineBusinessDays: true,
    },
    "10 working days before live",
    () => {
      throw new Error("parser must not run when JCDecaux columns are set")
    },
  )
  const qms = deriveMaterialDeadlines({
    lines: [
      {
        publisherKey: "qms",
        publisherLabel: "QMS",
        liveYmd: "2026-08-31",
        structured: qmsStructured,
      },
      {
        publisherKey: "tonic",
        publisherLabel: "Tonic",
        liveYmd: "2026-08-31",
        structured: null,
      },
    ],
    asOfYmd: "2026-08-01",
  })
  assert.equal(
    qms.coverText,
    "Mon 17 Aug 2026 (QMS: 10 wd before live); 1 publisher without stated deadlines",
  )
  assert.equal(qms.provenance, "(QMS: 10 wd before live)")

  const jc = deriveMaterialDeadlines({
    lines: [
      {
        publisherKey: "jcdecaux",
        publisherLabel: "JCDecaux",
        liveYmd: "2026-08-31",
        structured: jcStructured,
      },
    ],
    asOfYmd: "2026-08-01",
  })
  assert.equal(jc.coverText, "Mon 17 Aug 2026 (JCDecaux: 10 wd before live)")
  assert.equal(jc.provenance, "(JCDecaux: 10 wd before live)")
})
