import assert from "node:assert/strict"
import test from "node:test"

import {
  deriveMaterialDeadlines,
  formatSupplyDeadlineCell,
  type DeadlineOverride,
  type MaterialDeadlineLine,
} from "../deriveMaterialDeadlines.js"

const FIVE_WD = { min_days: 5, max_days: 5, business_days: true }
const TEN_WD = { min_days: 10, max_days: 10, business_days: true }
const RANGE_5_10 = { min_days: 5, max_days: 10, business_days: true }

function line(
  partial: Partial<MaterialDeadlineLine> & Pick<MaterialDeadlineLine, "publisherKey" | "publisherLabel" | "liveYmd">,
): MaterialDeadlineLine {
  return {
    mediaType: "display",
    formatLabel: "Standard Display",
    structured: null,
    ...partial,
  }
}

test("range uses max_days (conservative / earlier date)", () => {
  const result = deriveMaterialDeadlines({
    lines: [
      line({
        publisherKey: "cartology",
        publisherLabel: "Cartology",
        liveYmd: "2026-08-31",
        structured: RANGE_5_10,
      }),
    ],
    asOfYmd: "2026-08-01",
  })
  // 10 wd before Mon 31 Aug 2026 = Mon 17 Aug (same as a 10-wd single).
  assert.equal(result.earliestMaterialYmd, "2026-08-17")
  assert.equal(result.perLine[0]!.derivedYmd, "2026-08-17")
})

test("prose-only publisher contributes nothing to Cover, strip, or earliest", () => {
  const result = deriveMaterialDeadlines({
    lines: [
      line({
        publisherKey: "tonic",
        publisherLabel: "Tonic",
        liveYmd: "2026-08-31",
        structured: null,
      }),
      line({
        publisherKey: "seven",
        publisherLabel: "Seven",
        liveYmd: "2026-08-31",
        structured: null,
      }),
    ],
    asOfYmd: "2026-08-01",
  })
  assert.equal(result.earliestMaterialYmd, null)
  assert.equal(result.coverText, "2 publishers without stated deadlines")
  assert.equal(result.stripItems.length, 0)
  assert.equal(result.perLine[0]!.derivedYmd, null)
  assert.equal(result.publishersWithoutStated, 2)
})

test("Cover provenance: date + (QMS: 10 wd before live); notes publishers without stated deadlines", () => {
  const result = deriveMaterialDeadlines({
    lines: [
      line({
        publisherKey: "qms",
        publisherLabel: "QMS",
        liveYmd: "2026-08-31",
        structured: TEN_WD,
      }),
      line({
        publisherKey: "tonic",
        publisherLabel: "Tonic",
        liveYmd: "2026-08-31",
        structured: null,
      }),
    ],
    asOfYmd: "2026-08-01",
  })
  assert.equal(result.earliestMaterialYmd, "2026-08-17")
  assert.equal(
    result.coverText,
    "Mon 17 Aug 2026 (QMS: 10 wd before live); 1 publisher without stated deadlines",
  )
  assert.equal(result.provenance, "(QMS: 10 wd before live)")
  assert.equal(result.publishersWithoutStated, 1)
  assert.equal(result.stripItems.length, 1)
  assert.equal(result.stripItems[0]!.publisherLabel, "QMS")
  assert.equal(result.stripItems[0]!.displayYmd, "2026-08-17")
})

test("SPECS append: stated prose unchanged, computed date when derivable", () => {
  assert.equal(
    formatSupplyDeadlineCell("5 working days before live", "2026-08-18"),
    "5 working days before live — due Tue 18 Aug 2026",
  )
  assert.equal(
    formatSupplyDeadlineCell("5 working days before live", null),
    "5 working days before live",
  )
})

test("override recorded (who/when/value) wins display; derivation kept struck-through", () => {
  const override: DeadlineOverride = {
    publisherKey: "qms",
    derivedYmd: "2026-08-17",
    overrideYmd: "2026-08-20",
    overriddenBy: "luke@assembledmedia.com.au",
    overriddenAt: "2026-08-13T09:00:00.000Z",
  }
  const result = deriveMaterialDeadlines({
    lines: [
      line({
        publisherKey: "qms",
        publisherLabel: "QMS",
        liveYmd: "2026-08-31",
        structured: TEN_WD,
      }),
    ],
    overrides: [override],
    asOfYmd: "2026-08-01",
  })
  const item = result.stripItems[0]!
  assert.equal(item.displayYmd, "2026-08-20")
  assert.equal(item.derivedYmd, "2026-08-17")
  assert.ok(item.override)
  assert.equal(item.override.overriddenBy, "luke@assembledmedia.com.au")
  assert.equal(item.override.overrideYmd, "2026-08-20")
  assert.equal(item.override.derivedYmd, "2026-08-17")
  assert.match(result.coverText, /Thu 20 Aug 2026/)
  assert.match(result.coverText, /derived Mon 17 Aug 2026/)
  assert.equal(result.provenance, "(QMS: 10 wd before live)")
  assert.match(result.coverText, /QMS: 10 wd before live/)
})

test("strip: nearest date first; urgent within 5 Sydney business days or past", () => {
  const result = deriveMaterialDeadlines({
    lines: [
      line({
        publisherKey: "quantcast",
        publisherLabel: "Quantcast",
        liveYmd: "2026-09-15",
        structured: FIVE_WD,
      }),
      line({
        publisherKey: "qms",
        publisherLabel: "QMS",
        liveYmd: "2026-08-31",
        structured: TEN_WD,
      }),
    ],
    asOfYmd: "2026-08-17",
  })
  assert.deepEqual(
    result.stripItems.map((s) => s.publisherLabel),
    ["QMS", "Quantcast"],
  )
  // QMS due 17 Aug, as-of 17 Aug → 0 remaining → urgent.
  assert.equal(result.stripItems[0]!.urgent, true)
  // Quantcast 5 wd before 15 Sep = 8 Sep; from 17 Aug that is well beyond 5 wd.
  assert.equal(result.stripItems[1]!.urgent, false)
})

test("missing live date: structured line contributes nothing (never invents)", () => {
  const result = deriveMaterialDeadlines({
    lines: [
      {
        publisherKey: "qms",
        publisherLabel: "QMS",
        liveYmd: "",
        structured: TEN_WD,
      },
    ],
    asOfYmd: "2026-08-01",
  })
  assert.equal(result.earliestMaterialYmd, null)
  assert.equal(result.stripItems.length, 0)
})
