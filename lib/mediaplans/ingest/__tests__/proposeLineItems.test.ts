/**
 * Ingest proposal (MR-3) — fixtures + burst semantics.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import { detectWorkbookShapesFromFile } from "../detectShape"
import {
  parsePublisherProfile,
  type PublisherProfileConfig,
} from "../publisherProfileConfig"
import {
  buildBurstsFromCellsForTest,
  proposeLineItemsFromSheet,
  type IngestProposal,
} from "../proposeLineItems"

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

function assertNoLineItemId(proposal: IngestProposal) {
  const json = JSON.stringify(proposal)
  assert.equal(json.includes("line_item_id"), false)
  assert.equal(
    Object.prototype.hasOwnProperty.call(proposal, "line_item_id"),
    false,
  )
}

test("bonus run → quantity > 0 and media_amount == 0; N/A run → no burst", () => {
  const qms = loadProfile("QMS")
  const periods = [
    { start_date: "2026-08-01", end_date: "2026-08-07" },
    { start_date: "2026-08-08", end_date: "2026-08-14" },
    { start_date: "2026-08-15", end_date: "2026-08-21" },
    { start_date: "2026-08-22", end_date: "2026-08-28" },
    { start_date: "2026-08-29", end_date: "2026-09-04" },
  ]

  const bonus = buildBurstsFromCellsForTest(
    qms,
    ["B", "B", "B", "", "p"],
    periods,
  )
  const bonusRun = bonus.find((b) => b.booking_status === "bonus")
  assert.ok(bonusRun)
  assert.ok(bonusRun!.quantity > 0)
  assert.equal(bonusRun!.media_amount, 0)

  const na = buildBurstsFromCellsForTest(
    qms,
    ["N/A", "N/A", "N/A"],
    periods.slice(0, 3),
  )
  assert.equal(na.length, 0)

  const mixed = buildBurstsFromCellsForTest(
    qms,
    ["p", "N/A", "p"],
    periods.slice(0, 3),
  )
  assert.equal(mixed.length, 2)
  assert.ok(mixed.every((b) => b.booking_status === "paid"))
})

test("QMS fixture: grouped by format+state with panels beneath, not 1:1 line items", async () => {
  const qms = loadProfile("QMS")
  const shapes = await detectWorkbookShapesFromFile(
    path.join(FIX, "qms_strength-meals_esb-ooh.xlsx"),
  )
  const paid = shapes.find((s) => /paid/i.test(s.sheet_name))
  assert.ok(paid, "QMS Paid sheet")
  assert.ok(paid!.grid_columns.length >= 3, "grid detected")
  assert.ok(paid!.data_rows.length > 5)

  const proposal = proposeLineItemsFromSheet(paid!, qms)
  assertNoLineItemId(proposal)

  assert.ok(
    proposal.reconciliation.panel_count > proposal.reconciliation.line_item_count,
    `expected panels(${proposal.reconciliation.panel_count}) > line items(${proposal.reconciliation.line_item_count})`,
  )
  assert.ok(proposal.reconciliation.line_item_count >= 1)
  assert.ok(proposal.reconciliation.panel_count >= 2)

  for (const li of proposal.line_items) {
    assert.ok(li.panels.length >= 1)
    assert.ok(
      li.grouping.format || li.grouping.state,
      `grouping missing format/state: ${JSON.stringify(li.grouping)}`,
    )
    for (const p of li.panels) {
      assert.equal(p.source_publisher, "QMS")
      assert.ok(p.source_row_ref.includes("!r"))
      assert.equal(
        Object.prototype.hasOwnProperty.call(p, "line_item_id"),
        false,
      )
    }
  }

  console.log(
    "QMS Paid reconciliation",
    JSON.stringify(proposal.reconciliation),
  )
})

test("SCA fixture: spot-count bursts, not status bursts; no line_item_id", async () => {
  const sca = loadProfile("SCA")
  const shapes = await detectWorkbookShapesFromFile(
    path.join(FIX, "sca_boss-engineering_fy26_v1.xlsx"),
  )
  const sheet = shapes[0]
  assert.ok(sheet)
  const proposal = proposeLineItemsFromSheet(sheet!, sca)
  assertNoLineItemId(proposal)

  assert.equal(sca.grid_semantics, "count")
  const bursts = proposal.line_items.flatMap((li) => li.bursts)
  assert.ok(bursts.length > 0, "expected spot-count bursts")
  for (const b of bursts) {
    assert.ok(b.quantity > 0)
    assert.equal(b.booking_status, "paid")
    // status letters must not appear as booking_status bonus from counts
    assert.notEqual(b.booking_status, "bonus")
  }

  console.log("SCA reconciliation", JSON.stringify(proposal.reconciliation))
})

test("JCDecaux fixture: proposal without line_item_id + reconciliation", async () => {
  const jcd = loadProfile("JCDecaux")
  const shapes = await detectWorkbookShapesFromFile(
    path.join(FIX, "jcd_strength-meals_ooh.xlsx"),
  )
  const sheet = shapes[0]
  assert.ok(sheet)
  const proposal = proposeLineItemsFromSheet(sheet!, jcd)
  assertNoLineItemId(proposal)
  assert.ok(proposal.reconciliation.panel_count >= 1)
  console.log("JCD reconciliation", JSON.stringify(proposal.reconciliation))
})

test("SCA R+F sheet scores low as line-item sheet", async () => {
  const shapes = await detectWorkbookShapesFromFile(
    path.join(FIX, "sca_boss-engineering_fy26_v2-rev.xlsx"),
  )
  const rf = shapes.find(
    (s) => /r\+f|reach/i.test(s.sheet_name) || s.sheet_name === "R+F",
  )
  assert.ok(rf, "R+F sheet present on v2")
  assert.ok(
    rf!.line_item_sheet_confidence < 0.5,
    `R+F confidence ${rf!.line_item_sheet_confidence} should be low`,
  )
})

test("sheet with no grid returns empty gridColumns rather than throwing", async () => {
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Emptyish")
  ws.getCell("A1").value = "Note"
  ws.getCell("B1").value = "Only"
  const { detectSheetShape } = await import("../detectShape")
  const shape = detectSheetShape(ws)
  assert.deepEqual(shape.grid_columns, [])
  const sca = loadProfile("SCA")
  const proposal = proposeLineItemsFromSheet(shape, sca)
  assert.equal(proposal.reconciliation.burst_count, 0)
  assertNoLineItemId(proposal)
})
