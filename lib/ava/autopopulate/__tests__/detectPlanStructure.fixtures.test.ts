/**
 * Golden-file acceptance for detectPlanStructure against real media-owner fixtures.
 * Source of truth: tests/fixtures/ava-plans/cursor-ava-skill-acceptance-tests.md
 */
import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { detectPlanStructure } from "../detectPlanStructure.js"

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../tests/fixtures/ava-plans"
)

type GoldenEntry = {
  sheetName: string
  headerRow: number
  granularity: string
  junkColumns?: string[]
  junkColumnsMustInclude?: string[]
  flightColumnCount: number
  mustNotSelectSheets?: string[]
  bonusSheetName?: string
  notes?: string
}

const golden = JSON.parse(
  await readFile(join(FIXTURE_DIR, "detect.golden.json"), "utf8")
) as Record<string, GoldenEntry>

for (const [fileName, expect] of Object.entries(golden)) {
  test(`detect golden: ${fileName}`, async () => {
    const buf = await readFile(join(FIXTURE_DIR, fileName))
    const detected = await detectPlanStructure(buf)

    assert.equal(
      detected.sheetName,
      expect.sheetName,
      `sheetName for ${fileName}`
    )
    assert.equal(
      detected.headerRow,
      expect.headerRow,
      `headerRow for ${fileName}`
    )
    assert.equal(
      detected.flight.granularity,
      expect.granularity,
      `granularity for ${fileName}`
    )
    assert.equal(
      detected.flight.columns.length,
      expect.flightColumnCount,
      `flightColumnCount for ${fileName}`
    )

    if (expect.junkColumns) {
      assert.deepEqual(detected.junkColumns, expect.junkColumns)
    }
    if (expect.junkColumnsMustInclude) {
      for (const letter of expect.junkColumnsMustInclude) {
        assert.ok(
          detected.junkColumns.includes(letter),
          `${fileName} junkColumns must include ${letter}; got ${detected.junkColumns.join(",")}`
        )
      }
    }

    // Junk must never appear in the flight band
    const flightLetters = new Set(detected.flight.columns.map((c) => c.letter))
    for (const j of detected.junkColumns) {
      assert.ok(
        !flightLetters.has(j),
        `${fileName}: junk column ${j} leaked into flight band`
      )
    }

    if (expect.mustNotSelectSheets) {
      for (const bad of expect.mustNotSelectSheets) {
        assert.notEqual(
          detected.sheetName,
          bad,
          `${fileName} must not select ${bad}`
        )
      }
    }

    if (expect.bonusSheetName) {
      assert.ok(
        detected.bonusSheets?.some((b) => b.sheetName === expect.bonusSheetName),
        `${fileName} should expose bonus sheet ${expect.bonusSheetName}`
      )
      assert.ok(
        detected.bonusSheets?.every((b) => b.isBonusSheet === true),
        `${fileName} bonus sheets must be tagged isBonusSheet`
      )
    }

    // ARN lock: text-month path must yield real ISO dates (not empty flight)
    if (expect.granularity === "textMonthWeekly") {
      assert.ok(detected.flight.columns.length > 0)
      for (const col of detected.flight.columns.slice(0, 5)) {
        assert.match(col.date, /^\d{4}-\d{2}-\d{2}$/)
      }
    }
  })
}
