import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

import { PartnerIngestError } from "../errors"
import { VISTAR_EXPECTED_HEADER } from "../columnNames"
import { parseVistarBuffer, parseVistarMatrix } from "../parsers/parseVistar"
import { readPartnerFileMatrix } from "../parsers"

const FIXTURE_CSV = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "vistar-exchange-sample.csv"
)

function fixtureText(): string {
  return readFileSync(FIXTURE_CSV, "utf8")
}

async function parseFixture() {
  return parseVistarBuffer(readFileSync(FIXTURE_CSV), "vistar-exchange-sample.csv")
}

/** Preamble + header + one data row, so a doctored column list can be tested cheaply. */
function csvFrom(header: string, dataLines: string[]): string {
  return [
    'Date/Time Generated,"9/15/2026, 2:46 PM"',
    'Data Last Updated,"9/15/2026, 2:24 PM"',
    "Report Time Zone,Australia/Sydney (Billing)",
    "Date Range,1/1/2026 - 9/15/2026",
    '""',
    "Report Fields",
    header,
    ...dataLines,
  ].join("\n")
}

test("Vistar fixture: header on row 7, six preamble rows, totals row dropped", async () => {
  const parsed = await parseFixture()
  assert.equal(parsed.headerRow, 7)
  assert.equal(parsed.preambleRowCount, 6)
  assert.equal(parsed.detectedHeader, VISTAR_EXPECTED_HEADER)
  assert.equal(parsed.rows.length, 200)
  // 6 preamble + header + 200 data + totals + the file's trailing newline.
  assert.equal(parsed.rawLines.length, 209)
  assert.match(parsed.rawLines[6]?.rawLine ?? "", /^Day\t/)
  assert.match(parsed.rawLines[207]?.rawLine ?? "", /72112\.68927663649/)
})

test("Vistar fixture: first row maps to the exchange columns exactly", async () => {
  const parsed = await parseFixture()
  const row = parsed.rows[0]!
  assert.equal(row.reportDate, "2026-02-02")
  assert.equal(row.partnerAdvertiserId, "Legal Super")
  assert.equal(
    row.partnerCampaignName,
    "legalsuper - Jan-Mar26 New South Wales - Outdoor|Urban Panels - Jolt AU"
  )
  assert.equal(
    row.partnerLineItemName,
    "LEG0002_NeverSettle_OOH_Static_1080x1920px.jpg"
  )
  assert.equal(row.partnerCampaignId, "7a3PpWQARm0LDir1oGsOOw")
  assert.equal(row.partnerCreativeId, "xArrGiXMR9WBbCw8nAzBAA")
  assert.equal(row.venueType, "Outdoor|Urban Panels")
  assert.equal(row.metroArea, "Greater Sydney")
  assert.equal(row.state, "New South Wales")
  assert.equal(row.plays, 59)
  assert.equal(row.amountSpent, 12.5528646796)
  assert.equal(row.clicks, 0)
  assert.equal(row.videoViews, 0)
  assert.equal(row.completedViews, 0)
  assert.equal(row.rateFullyPlayed, 0)
})

test("Vistar keeps fractional impressions; rounding happens at the INSERT", async () => {
  const parsed = await parseFixture()
  assert.equal(parsed.rows[0]?.impressions, 288.99220399999996)
  assert.equal(parsed.rows[1]?.impressions, 357)
  const total = parsed.rows.reduce((n, r) => n + r.impressions, 0)
  assert.ok(Math.abs(total - 72112.68927663649) < 0.0001)
})

test("blank Contract Number leaves AV_LINE_ITEM_ID null", async () => {
  const parsed = await parseFixture()
  assert.equal(parsed.rows.every((r) => r.avLineItemId == null), true)
})

test("a Contract Number carrying a PO plan code sets AV_LINE_ITEM_ID", async () => {
  const lines = fixtureText().split(/\r?\n/)
  const header = lines[6]!
  const coded = lines[7]!.split(",")
  coded[5] = "legal004PO1"
  const matrix = await readPartnerFileMatrix(
    Buffer.from(csvFrom(header, [coded.join(",")]), "utf8"),
    "coded.csv"
  )
  const parsed = parseVistarMatrix(matrix)
  assert.equal(parsed.rows.length, 1)
  assert.equal(parsed.rows[0]?.avLineItemId, "legal004po1")
})

test("a missing required column fails the parse and names the column", async () => {
  const lines = fixtureText().split(/\r?\n/)
  const header = lines[6]!.replace(",Spots,", ",")
  const data = lines[7]!.split(",")
  data.splice(15, 1)
  const matrix = await readPartnerFileMatrix(
    Buffer.from(csvFrom(header, [data.join(",")]), "utf8"),
    "no-spots.csv"
  )
  assert.throws(
    () => parseVistarMatrix(matrix),
    (err: unknown) =>
      err instanceof PartnerIngestError && /missing required column: Spots/.test(err.message)
  )
})

test("Vistar dates accept d-MMM-yy, ISO, Date and Excel serial", async () => {
  const lines = fixtureText().split(/\r?\n/)
  const header = lines[6]!.split(",")
  const base = lines[7]!.split(",")
  const withDay = (day: unknown) => [day, ...base.slice(1)]
  const parsed = parseVistarMatrix([
    ["Report Fields"],
    header,
    withDay("2-Feb-26"),
    withDay("2026-03-04"),
    withDay(46278),
    withDay(new Date(Date.UTC(2026, 8, 12))),
  ])
  assert.equal(parsed.headerRow, 2)
  assert.deepEqual(
    parsed.rows.map((r) => r.reportDate).sort(),
    ["2026-02-02", "2026-03-04", "2026-09-12", "2026-09-13"]
  )
})
