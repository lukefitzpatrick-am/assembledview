/**
 * B22fix R1: the typed-number boxes on the edit client form keep what is
 * typed. Pure helpers here; the key-by-key render test is
 * components/clients/__tests__/EditClientForm.feeTyping.b22fix.test.tsx (Vitest).
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import {
  isFormattableTypedNumber,
  parseTypedNumber,
  typedNumberDisplayText,
  typedNumberEditText,
  typedNumberValueText,
} from "@/lib/clients/typedNumberInput"

const pct = (text: string) => {
  const numericValue = text.replace(/[^0-9.]/g, "")
  return numericValue ? `${Number(numericValue).toFixed(2)}%` : ""
}

/** Every prefix of `text`, as a box sees it key by key. */
function keyByKey(text: string, empty: 0 | null) {
  return [...text].map((_, i) => parseTypedNumber(text.slice(0, i + 1), empty))
}

test("each keystroke parses the text as typed", () => {
  assert.deepEqual(keyByKey("10", 0), [1, 10])
  assert.deepEqual(keyByKey("12.5", null), [1, 12, 12, 12.5])
  assert.deepEqual(keyByKey("0.5", 0), [0, 0, 0.5])
  assert.equal(parseTypedNumber("10%", 0), 10)
  assert.equal(parseTypedNumber("$1,250.50", 0), 1250.5)
  assert.equal(parseTypedNumber(" 7 ", null), 7)
})

test("cleared is the box's empty value: 0 for the old 8 and money, null for the 12", () => {
  assert.equal(parseTypedNumber("", 0), 0)
  assert.equal(parseTypedNumber("", null), null)
  assert.equal(parseTypedNumber("%", null), null)
})

test("text that isn't one number stays text (the schema refuses it)", () => {
  assert.equal(parseTypedNumber("1..5", 0), "1..5")
  assert.equal(parseTypedNumber(".", null), ".")
  assert.equal(isFormattableTypedNumber("1..5"), false)
  assert.equal(typedNumberDisplayText("1..5", pct), "1..5")
})

test("display without focus is the old box's text", () => {
  for (const v of [15, 0, 17.654, 100, "12.5", "", null, undefined]) {
    const old = pct((v as { toString(): string } | null | undefined)?.toString() || "")
    assert.equal(typedNumberDisplayText(v, pct), old, String(v))
  }
  assert.equal(typedNumberValueText(0), "0")
  assert.equal(typedNumberValueText(null), "")
})

test("on focus the box shows the plain number", () => {
  assert.equal(typedNumberEditText(15), "15")
  assert.equal(typedNumberEditText(17.654), "17.654")
  assert.equal(typedNumberEditText(0), "0")
  assert.equal(typedNumberEditText(null), "")
  assert.equal(typedNumberEditText(undefined), "")
  assert.equal(typedNumberEditText(Number.NaN), "")
  assert.equal(typedNumberEditText("12.5"), "12.5")
})

const editForm = readFileSync(join(process.cwd(), "components/EditClientForm.tsx"), "utf8")
const box = readFileSync(join(process.cwd(), "components/clients/TypedNumberInput.tsx"), "utf8")

test("source: all 20 fee boxes use TypedNumberInput; none reformat on type", () => {
  const fees = editForm.slice(editForm.indexOf('<h3 className="text-lg font-semibold mb-4">Fees</h3>'))
  const feesSection = fees.slice(0, fees.indexOf("Ad Serving Fees"))
  assert.equal((feesSection.match(/<TypedNumberInput\b/g) ?? []).length, 2, "one per group (8 old, 12 new)")
  const legacy = feesSection.slice(feesSection.indexOf('clientFeeFormRows("legacy")'))
  assert.match(legacy.slice(0, 1200), /<TypedNumberInput \{\.\.\.field\} format=\{formatPercentage\} empty=\{0\} \/>/)
  const channel = feesSection.slice(feesSection.indexOf('clientFeeFormRows("0113")'))
  assert.match(channel.slice(0, 1500), /<TypedNumberInput\s+\{\.\.\.field\}\s+format=\{formatPercentage\}\s+empty=\{null\}/)
  assert.ok(channel.includes('channelFeeInheritPlaceholder(form.watch("feecontentcreator"))'))
  assert.doesNotMatch(feesSection, /value=\{formatPercentage\(/)
  assert.doesNotMatch(feesSection, /e\.target\.value\.replace/)
})

test("source: the box keeps a draft while focused and formats on blur", () => {
  assert.match(box, /value=\{draft \?\? typedNumberDisplayText\(value, format\)\}/)
  assert.match(box, /setDraft\(e\.target\.value\)\s*\n\s*onChange\(parseTypedNumber\(e\.target\.value, empty\)\)/)
  assert.match(box, /setDraft\(null\)\s*\n\s*onBlur\?\.\(e\)/)
  assert.match(box, /inputRef\.current\?\.select\(\)/)
})
