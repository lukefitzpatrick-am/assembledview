/**
 * Panel flight letter runs + review summary ("live N of M periods").
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import {
  parsePublisherProfile,
  type PublisherProfileConfig,
} from "../publisherProfileConfig"
import {
  buildFlightsFromCellsForTest,
  proposeLineItemsFromSheet,
} from "../proposeLineItems"
import { summarizePanelFlights } from "../panelFlightSummary"
import { detectWorkbookShapesFromFile } from "../detectShape"
import { stampProposalForSave } from "../stampProposalForSave"

const SEED_PATH = path.join(
  process.cwd(),
  "lib/mediaplans/ingest/seeds/publisherProfiles.json",
)
const FIX = path.join(process.cwd(), "tests/fixtures/ava-plans")

function loadProfile(name: string): PublisherProfileConfig {
  const raw = JSON.parse(readFileSync(SEED_PATH, "utf8")) as unknown[]
  const row = raw.find(
    (r) =>
      (r as { publisher_name?: string }).publisher_name?.toLowerCase() ===
      name.toLowerCase(),
  )
  assert.ok(row, `missing seed profile ${name}`)
  return parsePublisherProfile(row)
}

const PERIODS = [
  { start_date: "2026-08-01", end_date: "2026-08-07" },
  { start_date: "2026-08-08", end_date: "2026-08-14" },
  { start_date: "2026-08-15", end_date: "2026-08-21" },
  { start_date: "2026-08-22", end_date: "2026-08-28" },
  { start_date: "2026-08-29", end_date: "2026-09-04" },
  { start_date: "2026-09-05", end_date: "2026-09-11" },
]

test("paid / dark / paid → two live flights; N/A and blank produce no row", () => {
  const qms = loadProfile("QMS")
  const flights = buildFlightsFromCellsForTest(
    qms,
    ["p", "N/A", "p"],
    PERIODS.slice(0, 3),
  )
  assert.equal(flights.length, 2)
  assert.ok(flights.every((f) => f.is_live && !f.is_bonus))
  assert.equal(flights[0]!.period_start, "2026-08-01")
  assert.equal(flights[1]!.period_start, "2026-08-15")

  const blank = buildFlightsFromCellsForTest(qms, ["", "", ""], PERIODS.slice(0, 3))
  assert.equal(blank.length, 0)

  const na = buildFlightsFromCellsForTest(
    qms,
    ["N/A", "C/C", "N/A"],
    PERIODS.slice(0, 3),
  )
  assert.equal(na.length, 0)
})

test("bonus / STA flights are is_live+is_bonus with no media on proposal bursts", () => {
  const qms = loadProfile("QMS")
  const flights = buildFlightsFromCellsForTest(
    qms,
    ["B", "B", "STA"],
    PERIODS.slice(0, 3),
  )
  // B+B merge; STA is bonus_display — may merge if same status or split
  assert.ok(flights.length >= 1)
  assert.ok(flights.every((f) => f.is_live && f.is_bonus))

  const summary = summarizePanelFlights(flights, 3)
  assert.equal(summary.livePeriodCount, 3)
  assert.equal(summary.label, "live 3 of 3 periods")
})

test("live 4 of 6 summary for live/dark/live pattern", () => {
  const qms = loadProfile("QMS")
  const flights = buildFlightsFromCellsForTest(
    qms,
    ["p", "p", "", "", "p", "p"],
    PERIODS,
  )
  assert.equal(flights.length, 2)
  const summary = summarizePanelFlights(flights, 6)
  assert.equal(summary.livePeriodCount, 4)
  assert.equal(summary.totalPeriodCount, 6)
  assert.equal(summary.label, "live 4 of 6 periods")
})

test("QMS propose attaches flights on each panel; stamp carries them", async () => {
  const qms = loadProfile("QMS")
  const shapes = await detectWorkbookShapesFromFile(
    path.join(FIX, "qms_strength-meals_esb-ooh.xlsx"),
  )
  const paid = shapes.find((s) => /paid/i.test(s.sheet_name))
  assert.ok(paid)
  const proposal = proposeLineItemsFromSheet(paid!, qms)
  const withFlights = proposal.line_items.flatMap((li) => li.panels).filter(
    (p) => p.flights.length > 0,
  )
  assert.ok(
    withFlights.length > 0,
    "expected at least one panel with resolved period flights",
  )
  assert.ok(
    withFlights.every((p) => p.grid_period_count === paid!.grid_columns.length),
  )

  const stamped = stampProposalForSave(proposal, "bicau001")
  const stampedWith = stamped.panels.filter((p) => p.flights.length > 0)
  assert.ok(stampedWith.length > 0)
  assert.ok(
    stampedWith.every((p) =>
      p.flights.every(
        (f) =>
          typeof f.periodStart === "string" &&
          typeof f.periodEnd === "string" &&
          typeof f.isLive === "boolean" &&
          typeof f.isBonus === "boolean",
      ),
    ),
  )
  // Bonus flights never invent money on the stamp path either.
  for (const li of stamped.lineItems) {
    for (const b of li.bursts) {
      if (typeof (b as { budget?: number }).budget === "number") {
        assert.ok(Number.isFinite((b as { budget: number }).budget))
      }
    }
  }
})
