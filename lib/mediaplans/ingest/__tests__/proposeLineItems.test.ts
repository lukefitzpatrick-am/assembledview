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

test("QMS fixture: one line per Paid data row (supersedes grouped 3-of-41 model)", async () => {
  const qms = loadProfile("QMS")
  assert.equal(qms.line_granularity, "per_row")
  const shapes = await detectWorkbookShapesFromFile(
    path.join(FIX, "qms_strength-meals_esb-ooh.xlsx"),
  )
  const paid = shapes.find((s) => /paid/i.test(s.sheet_name))
  assert.ok(paid, "QMS Paid sheet")
  assert.ok(paid!.grid_columns.length >= 3, "grid detected")
  // Former grouped proposal collapsed 41 site-numbered buy rows into ~3
  // format+state lines. Totals / "NO INSTALL CHARGE" notes are unparsed.
  assert.equal(paid!.data_rows.length, 41)

  const proposal = proposeLineItemsFromSheet(paid!, qms)
  assertNoLineItemId(proposal)

  assert.equal(proposal.reconciliation.line_item_count, 41)
  assert.equal(proposal.reconciliation.line_item_count, paid!.data_rows.length)
  assert.equal(proposal.reconciliation.panel_count, 41)
  assert.equal(proposal.reconciliation.accept_ok, true)

  for (const li of proposal.line_items) {
    assert.equal(li.panels.length, 1, "per_row: each line IS its source row")
    assert.equal(li.panels[0]!.source_publisher, "QMS")
    assert.ok(li.panels[0]!.source_row_ref.includes("!r"))
    assert.ok(
      li.grouping.format ||
        li.grouping.state ||
        li.grouping.site_number ||
        li.panels[0]!.descriptors.site_number,
      `row descriptors missing identity: ${JSON.stringify(li.grouping)}`,
    )
  }

  console.log(
    "QMS Paid reconciliation",
    JSON.stringify(proposal.reconciliation),
  )
})

test("SCA fixture: one line per station row; week-columns become that line's bursts", async () => {
  const sca = loadProfile("SCA")
  assert.equal(sca.line_granularity, "per_row")
  const shapes = await detectWorkbookShapesFromFile(
    path.join(FIX, "sca_boss-engineering_fy26_v1.xlsx"),
  )
  const sheet = shapes[0]
  assert.ok(sheet)
  const proposal = proposeLineItemsFromSheet(sheet!, sca)
  assertNoLineItemId(proposal)

  assert.equal(sca.grid_semantics, "count")
  assert.equal(
    proposal.reconciliation.line_item_count,
    sheet!.data_rows.length,
    "SCA per_row: station rows must not collapse by grouping_keys",
  )
  const withBursts = proposal.line_items.filter((li) => li.bursts.length > 0)
  assert.ok(withBursts.length > 0, "week-column bursts attach to station rows")
  for (const li of proposal.line_items) {
    assert.equal(li.panels.length, 1)
    for (const b of li.bursts) {
      assert.ok(b.quantity > 0)
      assert.equal(b.booking_status, "paid")
    }
  }
  assert.equal(proposal.reconciliation.accept_ok, true)

  console.log("SCA reconciliation", JSON.stringify(proposal.reconciliation))
})

test("JCDecaux fixture: one line per buy row with flight occupancy (106; 118 was data_rows including MEDIA VALUE/SUMMARY leftovers)", async () => {
  const jcd = loadProfile("JCDecaux")
  assert.equal(jcd.line_granularity, "per_row")
  const shapes = await detectWorkbookShapesFromFile(
    path.join(FIX, "jcd_strength-meals_ooh.xlsx"),
  )
  const sheet = shapes[0]
  assert.ok(sheet)
  // 118 was detectShape's old count (buy rows + MEDIA VALUE / DISCOUNT /
  // CAMPAIGN SUMMARY). Non-buy rows are never lines.
  assert.equal(sheet!.data_rows.length, 106)

  const proposal = proposeLineItemsFromSheet(sheet!, jcd)
  assertNoLineItemId(proposal)
  assert.equal(proposal.reconciliation.line_item_count, 106)
  assert.equal(proposal.reconciliation.panel_count, 106)
  assert.equal(proposal.reconciliation.accept_ok, true)
  assert.ok(
    Math.abs((proposal.reconciliation.file_stated_total ?? 0) - 311707.88) < 1,
  )
  for (const li of proposal.line_items) {
    assert.equal(li.panels.length, 1)
  }
  console.log("JCD reconciliation", JSON.stringify(proposal.reconciliation))
})

test("SEN fixture: spot-count bursts; stated total present; no line_item_id", async () => {
  const sen = loadProfile("SEN")
  assert.equal(sen.grid_semantics, "count")
  const shapes = await detectWorkbookShapesFromFile(
    path.join(FIX, "sen_boss-engineering_fy26.xlsx"),
  )
  const sheet = shapes.find((s) => /OPTION 2/i.test(s.sheet_name))
  assert.ok(sheet, "OPTION 2 sheet")
  assert.ok(sheet!.grid_columns.length >= 50, "weekly flight grid")
  assert.equal(sheet!.file_stated_total, 120000)

  const proposal = proposeLineItemsFromSheet(sheet!, sen)
  assertNoLineItemId(proposal)
  assert.equal(proposal.publisher_name, "SEN")
  assert.equal(proposal.media_type, "radio")
  assert.ok(proposal.reconciliation.line_item_count >= 1)
  assert.ok(proposal.reconciliation.burst_count >= 1)
  assert.equal(proposal.reconciliation.file_stated_total, 120000)
  for (const li of proposal.line_items) {
    for (const b of li.bursts) {
      assert.equal(b.booking_status, "paid")
      assert.ok(b.quantity > 0)
    }
  }
  console.log("SEN reconciliation", JSON.stringify(proposal.reconciliation))
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

test("grouped config arm still collapses by grouping_keys (not used by any seed)", async () => {
  const qms = loadProfile("QMS")
  const grouped: PublisherProfileConfig = {
    ...qms,
    line_granularity: "grouped",
  }
  const shapes = await detectWorkbookShapesFromFile(
    path.join(FIX, "qms_strength-meals_esb-ooh.xlsx"),
  )
  const paid = shapes.find((s) => /paid/i.test(s.sheet_name))
  assert.ok(paid)
  const proposal = proposeLineItemsFromSheet(paid!, grouped)
  assert.ok(
    proposal.reconciliation.line_item_count < paid!.data_rows.length,
    `grouped arm should collapse 41 rows; got ${proposal.reconciliation.line_item_count} lines`,
  )
  assert.ok(
    proposal.reconciliation.panel_count > proposal.reconciliation.line_item_count,
  )
})
