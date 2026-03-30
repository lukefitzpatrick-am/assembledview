import assert from "node:assert/strict"
import test from "node:test"
import {
  dropLeadingNonNumericWeekHeaderRow,
  normalizePastedNumericRaw,
  parseDatePasteValue,
  parseNumericPasteString,
  parseRatePasteValue,
  parseWeeklyPasteValue,
  splitClipboardMatrix,
  trimEmptyEdgeColumns,
} from "../../lib/mediaplan/expertGridPaste.js"

test("splitClipboardMatrix handles TSV and trailing newline", () => {
  const m = splitClipboardMatrix("a\tb\n1\t2\n")
  assert.deepEqual(m, [
    ["a", "b"],
    ["1", "2"],
  ])
})

test("parseWeeklyPasteValue accepts currency and thousands", () => {
  assert.deepEqual(parseWeeklyPasteValue("$1,234.5"), { ok: true, value: 1234.5 })
  assert.deepEqual(parseWeeklyPasteValue("  42 "), { ok: true, value: 42 })
})

test("parseWeeklyPasteValue accepts accounting negative", () => {
  const r = parseWeeklyPasteValue("(100)")
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.value, -100)
})

test("parseRatePasteValue matches weekly numeric rules", () => {
  const r = parseRatePasteValue("$2,500.00")
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.value, "2500.00")
})

test("parseDatePasteValue handles ISO and Excel serial", () => {
  assert.deepEqual(parseDatePasteValue("2025-03-15"), { ok: true, value: "2025-03-15" })
  const serial = parseDatePasteValue("45678")
  assert.equal(serial.ok, true)
})

test("normalizePastedNumericRaw strips currency", () => {
  assert.equal(normalizePastedNumericRaw("$ 1,200.50"), "1200.50")
})

test("parseNumericPasteString EU-style comma decimal", () => {
  const r = parseNumericPasteString("1.234,5")
  assert.equal(r.ok, true)
  if (r.ok) assert.ok(Math.abs(r.value - 1234.5) < 0.001)
})

test("trimEmptyEdgeColumns removes all-empty lead/trail columns", () => {
  const m = trimEmptyEdgeColumns([
    ["", "a", "b", ""],
    ["", "1", "2", ""],
  ])
  assert.deepEqual(m, [
    ["a", "b"],
    ["1", "2"],
  ])
})

test("dropLeadingNonNumericWeekHeaderRow removes date-only header row", () => {
  const m = dropLeadingNonNumericWeekHeaderRow([
    ["Mon 1 Jan", "Tue 2 Jan"],
    ["10", "20"],
  ])
  assert.deepEqual(m, [["10", "20"]])
})

test("dropLeadingNonNumericWeekHeaderRow keeps single-row paste", () => {
  const one = [["5", "6"]]
  assert.deepEqual(dropLeadingNonNumericWeekHeaderRow(one), one)
})
