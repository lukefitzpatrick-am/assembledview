/**
 * Money mapping + reconciliation gate (MR-6) and grid date resolution (MR-7).
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import { detectWorkbookShapesFromFile } from "../detectShape"
import {
  evaluateReconciliationGate,
  isMoneyTarget,
  MONEY_TARGETS,
  RECONCILIATION_BLOCK_PCT,
} from "../moneyTargets"
import {
  parsePublisherProfile,
  type PublisherProfileConfig,
} from "../publisherProfileConfig"
import { proposeLineItemsFromSheet } from "../proposeLineItems"

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

test("reconciliation gate blocks when delta > 0.5%", () => {
  const ok = evaluateReconciliationGate({
    total_media_amount: 100,
    file_stated_total: 100.4,
  })
  assert.equal(ok.ok, true)

  const bad = evaluateReconciliationGate({
    total_media_amount: 100,
    file_stated_total: 100 / (1 - RECONCILIATION_BLOCK_PCT * 2),
  })
  assert.equal(bad.ok, false)
  assert.ok(bad.reason)
})

test("QMS Paid: weekly_rate × PAID weeks reconciles to scrape within 0.5%", async () => {
  const qms = loadProfile("QMS")
  assert.equal(qms.money_rules.media_amount_basis, "weekly_rate")
  const shapes = await detectWorkbookShapesFromFile(
    path.join(FIX, "qms_strength-meals_esb-ooh.xlsx"),
  )
  const sheet = shapes.find((s) => /paid/i.test(s.sheet_name))
  assert.ok(sheet)
  const proposal = proposeLineItemsFromSheet(sheet!, qms)
  const r = proposal.reconciliation
  assert.equal(r.file_stated_source, "scrape")
  assert.ok(r.file_stated_total != null && r.file_stated_total > 0)
  assert.ok(r.total_media_amount > 0)
  assert.equal(r.accept_ok, true)
  assert.ok(
    (r.delta_pct ?? 1) <= RECONCILIATION_BLOCK_PCT,
    `delta_pct ${r.delta_pct}`,
  )
  console.log("QMS Paid reconciliation", JSON.stringify(r))
})

test("SCA: Client Total line_total; column-sum fallback with a visible warning", async () => {
  const sca = loadProfile("SCA")
  assert.equal(sca.money_rules.media_amount_basis, "line_total")
  const shapes = await detectWorkbookShapesFromFile(
    path.join(FIX, "sca_boss-engineering_fy26_v1.xlsx"),
  )
  const sheet = shapes[0]
  assert.ok(sheet)
  assert.ok(
    sheet!.descriptor_columns.some((d) => /client total/i.test(d.header)),
    "Client Total must be a trailing descriptor",
  )
  const proposal = proposeLineItemsFromSheet(sheet!, sca)
  const r = proposal.reconciliation
  assert.ok(Math.abs((r.file_stated_total ?? 0) - 60097) < 1)
  assert.ok(Math.abs(r.total_media_amount - 60097) < 1)
  assert.equal(r.file_stated_source, "column_sum_fallback")
  assert.ok(
    r.warnings.some((w) => /not silent/i.test(w)),
    `SCA must warn on column-sum fallback, got ${r.warnings.join(" | ")}`,
  )
  assert.equal(r.accept_ok, true)
  assert.ok((r.delta_pct ?? 1) <= RECONCILIATION_BLOCK_PCT)
  console.log("SCA reconciliation", JSON.stringify(r))
})

test("JCD: stated cell 131250.01 is the gate; MEDIA VALUE is rate-card info", async () => {
  const jcd = loadProfile("JCDecaux")
  assert.equal(jcd.money_rules.media_amount_basis, "line_total")
  const shapes = await detectWorkbookShapesFromFile(
    path.join(FIX, "jcd_strength-meals_ooh.xlsx"),
  )
  const sheet = shapes[0]
  assert.ok(sheet)
  assert.ok(
    sheet!.descriptor_columns.some((d) =>
      /media value \(inc\. sta\)/i.test(d.header),
    ),
    "MEDIA VALUE (inc. STA) must be a trailing descriptor",
  )
  // Scrape must not lock onto the ~315394 section subtotal
  assert.ok(
    sheet!.file_stated_total == null ||
      Math.abs(sheet!.file_stated_total - 315394.38) > 1,
    `scrape should not return section subtotal, got ${sheet!.file_stated_total}`,
  )

  const proposal = proposeLineItemsFromSheet(sheet!, jcd)
  const r = proposal.reconciliation
  assert.equal(r.file_stated_source, "stated_cell")
  assert.ok(r.file_stated_total != null)
  assert.ok(
    Math.abs(r.file_stated_total! - 131250.01) < 0.005,
    `expected stated cell 131250.01, got ${r.file_stated_total}`,
  )
  assert.ok(
    Math.abs(r.total_media_amount - 131250.01) < 0.005,
    `line media ${r.total_media_amount}`,
  )
  assert.ok(Math.abs(r.delta ?? 1) < 0.005, `delta ${r.delta}`)
  assert.equal(r.accept_ok, true)
  assert.ok((r.delta_pct ?? 1) <= RECONCILIATION_BLOCK_PCT)
  assert.ok(
    r.rate_card_total != null && Math.abs(r.rate_card_total - 403820.48) < 0.02,
    `rate-card ${r.rate_card_total}`,
  )
  assert.ok(
    r.rate_card_discount_pct != null &&
      Math.abs(r.rate_card_discount_pct - 0.675) < 0.002,
    `discount ${r.rate_card_discount_pct}`,
  )
  const sections = r.section_reconciliations ?? []
  assert.equal(sections.length, 3)
  assert.deepEqual(
    sections.map((s) => s.row),
    [111, 138, 150],
  )
  for (const s of sections) {
    assert.equal(s.ok, true, `section r${s.row} delta ${s.delta}`)
    assert.ok(
      Math.abs(s.computed - s.file) <= 0.02,
      `section r${s.row} computed ${s.computed} vs file ${s.file}`,
    )
  }
  assert.equal(
    r.warnings.some((w) => /fell back to summing/i.test(w)),
    false,
    "JCD found the stated cell — no column-sum fallback",
  )
  // Lunar/4×weeks diverges on some lines — warnings only, never block
  assert.ok(r.warnings.some((w) => /cross-check only/i.test(w)))
  console.log(
    "JCD reconciliation",
    JSON.stringify({
      total: r.total_media_amount,
      stated: r.file_stated_total,
      source: r.file_stated_source,
      delta: r.delta,
      rate_card_total: r.rate_card_total,
      discount: r.rate_card_discount_pct,
      sections: sections.map((s) => ({
        row: s.row,
        file: s.file,
        computed: s.computed,
      })),
      warnings: r.warnings.length,
    }),
  )
})

test("MR-7: week number with year anchor resolves as true ISO week", async () => {
  const { resolveGridColumnForTest } = await import("../detectShape")
  // Header row 2 = week numbers; year anchor on row 1 (no date row on header)
  const matrix: string[][] = []
  matrix[1] = []
  matrix[1][1] = "Anchor"
  matrix[1][2] = "2025-06-15"
  matrix[2] = []
  matrix[2][1] = "Site"
  matrix[2][2] = "35"
  matrix[2][3] = "36"
  const col = resolveGridColumnForTest(matrix, 2, 2)
  assert.equal(col.start_date, "2025-08-25")
  assert.equal(col.end_date, "2025-08-31")
  assert.ok(col.confidence >= 0.7)
})

test("MR-7: week stub without anchor is unresolved with low confidence", async () => {
  const { resolveGridColumnForTest } = await import("../detectShape")
  const matrix: string[][] = []
  matrix[1] = []
  matrix[1][1] = "Site"
  matrix[1][2] = "33"
  const col = resolveGridColumnForTest(matrix, 1, 2)
  assert.equal(col.start_date, null)
  assert.ok(col.confidence < 0.5)
})

test("MR-7: month+day without year anchor stays unresolved (no silent 2026)", async () => {
  const { resolveGridColumnForTest } = await import("../detectShape")
  const matrix: string[][] = []
  matrix[1] = []
  matrix[1][1] = "Aug"
  matrix[2] = []
  matrix[2][1] = "24"
  const col = resolveGridColumnForTest(matrix, 1, 1)
  assert.equal(col.start_date, null)
  assert.ok(col.confidence < 0.5)
})
test("JCD fixture: explicit DMY grid dates win (campaign week labels unused)", async () => {
  const shapes = await detectWorkbookShapesFromFile(
    path.join(FIX, "jcd_strength-meals_ooh.xlsx"),
  )
  const sheet = shapes[0]!
  const first = sheet.grid_columns[0]
  assert.ok(first)
  assert.equal(first!.start_date, "2026-08-24")
  assert.equal(first!.end_date, "2026-08-30")
  assert.ok(first!.confidence >= 0.9)
})

test("SF-6 media_rate:bought is a MONEY_TARGET and is not a stated line total", () => {
  assert.ok(
    (MONEY_TARGETS as readonly string[]).includes("media_rate:bought"),
  )
  assert.equal(isMoneyTarget("media_rate:bought"), true)
  assert.notEqual("media_rate:bought", "media_amount:stated")
  assert.equal(isMoneyTarget("media_amount:stated"), true)
})

test("JCD line_total: MEDIA BOUGHT RATE is the line investment once (not rate × weeks)", async () => {
  const jcd = loadProfile("JCDecaux")
  const column_map = { ...jcd.column_map }
  delete column_map["MEDIA VALUE (inc. STA)"]
  delete column_map["Lunar (4 week) Market Rate"]
  column_map["MEDIA BOUGHT RATE"] = "media_rate:bought"
  const stripped = parsePublisherProfile({
    ...jcd,
    column_map,
    notes: jcd.notes,
  })
  const shapes = await detectWorkbookShapesFromFile(
    path.join(FIX, "jcd_strength-meals_ooh.xlsx"),
  )
  const proposal = proposeLineItemsFromSheet(shapes[0]!, stripped)
  assert.ok(
    Math.abs(proposal.reconciliation.total_media_amount - 131250.01) < 0.005,
    `bought line total must feed media, got ${proposal.reconciliation.total_media_amount}`,
  )
})
