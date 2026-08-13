/**
 * SEN / .xlsm ingest path — ExcelJS reads macro workbooks read-only.
 */
import assert from "node:assert/strict"
import { copyFileSync, readFileSync, unlinkSync } from "node:fs"
import { createHash } from "node:crypto"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { detectWorkbookShapesFromFile } from "../detectShape"
import { parsePublisherProfile } from "../publisherProfileConfig"
import { proposeLineItemsFromSheet } from "../proposeLineItems"

const FIX = path.join(process.cwd(), "tests/fixtures/ava-plans")
const SEN_XLSX = path.join(FIX, "sen_boss-engineering_fy26.xlsx")
const SEED_PATH = path.join(
  process.cwd(),
  "lib/mediaplans/ingest/seeds/publisherProfiles.json",
)

function sha256(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex")
}

function loadSenProfile() {
  const raw = JSON.parse(readFileSync(SEED_PATH, "utf8")) as unknown[]
  const row = raw.find(
    (r) =>
      (r as { publisher_name?: string }).publisher_name?.toLowerCase() === "sen",
  )
  assert.ok(row, "SEN seed missing")
  return parsePublisherProfile(row)
}

test(".xlsm path opens SEN schedule read-only without mutating source bytes", async () => {
  const before = sha256(SEN_XLSX)
  const tmpXlsm = path.join(
    os.tmpdir(),
    `sen-ingest-${process.pid}-${Date.now()}.xlsm`,
  )
  copyFileSync(SEN_XLSX, tmpXlsm)
  try {
    const shapes = await detectWorkbookShapesFromFile(tmpXlsm)
    assert.ok(shapes.length >= 1)
    const option2 = shapes.find((s) => /OPTION 2/i.test(s.sheet_name))
    assert.ok(option2)
    assert.ok(option2!.grid_columns.length >= 50)
    assert.equal(option2!.file_stated_total, 120000)

    const proposal = proposeLineItemsFromSheet(option2!, loadSenProfile())
    assert.ok(proposal.reconciliation.line_item_count >= 1)
    assert.equal(JSON.stringify(proposal).includes("line_item_id"), false)
  } finally {
    try {
      unlinkSync(tmpXlsm)
    } catch {
      // ignore
    }
  }
  assert.equal(sha256(SEN_XLSX), before, "source fixture must be unchanged")
})

test("SEN migration seed SQL is ON CONFLICT idempotent on publisher_name", () => {
  const sql = readFileSync(
    path.join(
      process.cwd(),
      "db/migrations/0033_publisher_profiles_sen.sql",
    ),
    "utf8",
  )
  assert.match(sql, /ON CONFLICT \(publisher_name\) DO UPDATE/i)
  assert.match(sql, /'SEN'/)
  assert.match(sql, /grid_semantics[\s\S]*'count'/)
  assert.doesNotMatch(sql, /CREATE POLICY|ENABLE ROW LEVEL SECURITY/i)
})
