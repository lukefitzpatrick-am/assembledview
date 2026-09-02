import assert from "node:assert/strict"
import test from "node:test"
import type { DraftMatchGrouped, DraftMatchRow } from "../draftMatch.js"
import { INVOICING_CLIENT_GRID_CLASS } from "../invoicingRowPresentation.js"
import {
  DRAFT_MATCH_OUTCOME_UI_ORDER,
  IN_XERO_CLIENT_GRID_CLASS,
  groupDraftMatchRowsByClient,
  inXeroPrimaryAction,
  inXeroPrimaryLabel,
  isDraftMatchOutcomeCollapsedByDefault,
  visibleDraftMatchOutcomes,
} from "../inXeroPresentation.js"

function row(partial: Partial<DraftMatchRow> & Pick<DraftMatchRow, "id" | "outcome">): DraftMatchRow {
  return {
    clients_id: 1,
    client_name: "BIC",
    billing_month: "2026-07",
    approved_amount_cents: 291666,
    xero_amount_cents: 291666,
    delta_cents: 0,
    approved: [],
    drafts: [],
    stamps: [],
    ...partial,
  }
}

test("Differs → Accept Xero figure; Missing → no primary; Extra → Assign", () => {
  assert.equal(inXeroPrimaryAction("Differs"), "accept")
  assert.equal(inXeroPrimaryLabel("accept"), "Accept Xero figure")
  assert.equal(inXeroPrimaryAction("Missing"), null)
  assert.equal(inXeroPrimaryAction("Extra"), "assign")
  assert.equal(inXeroPrimaryLabel("assign"), "Assign")
  assert.equal(inXeroPrimaryAction("Agrees"), null)
})

test("In Xero groups by outcome with Agrees collapsed last", () => {
  assert.deepEqual(DRAFT_MATCH_OUTCOME_UI_ORDER, ["Differs", "Missing", "Extra", "Agrees"])
  assert.equal(isDraftMatchOutcomeCollapsedByDefault("Agrees"), true)
  assert.equal(isDraftMatchOutcomeCollapsedByDefault("Differs"), false)
  assert.equal(isDraftMatchOutcomeCollapsedByDefault("Missing"), false)
  assert.equal(isDraftMatchOutcomeCollapsedByDefault("Extra"), false)

  const grouped: DraftMatchGrouped = {
    Differs: [row({ id: "d", outcome: "Differs" })],
    Missing: [row({ id: "m", outcome: "Missing" })],
    Extra: [row({ id: "e", outcome: "Extra" })],
    Agrees: [row({ id: "a", outcome: "Agrees" })],
  }
  assert.deepEqual(visibleDraftMatchOutcomes(grouped), [
    "Differs",
    "Missing",
    "Extra",
    "Agrees",
  ])
})

test("empty outcomes are omitted; Agrees stays last when present", () => {
  const grouped: DraftMatchGrouped = {
    Differs: [],
    Missing: [row({ id: "m", outcome: "Missing" })],
    Extra: [],
    Agrees: [row({ id: "a", outcome: "Agrees" })],
  }
  assert.deepEqual(visibleDraftMatchOutcomes(grouped), ["Missing", "Agrees"])
})

test("In Xero reuses the CB-8b two-column client grid", () => {
  assert.equal(IN_XERO_CLIENT_GRID_CLASS, INVOICING_CLIENT_GRID_CLASS)
  assert.match(IN_XERO_CLIENT_GRID_CLASS, /\bgrid-cols-1\b/)
  assert.match(IN_XERO_CLIENT_GRID_CLASS, /min-\[700px\]:grid-cols-2/)
})

test("cards group rows by client, preserving first-seen order", () => {
  const rows = [
    row({ id: "1", outcome: "Differs", clients_id: 9, client_name: "BIC" }),
    row({ id: "2", outcome: "Differs", clients_id: 2, client_name: "Hart" }),
    row({ id: "3", outcome: "Differs", clients_id: 9, client_name: "BIC" }),
  ]
  const cards = groupDraftMatchRowsByClient(rows)
  assert.deepEqual(
    cards.map((c) => c.clientName),
    ["BIC", "Hart"]
  )
  assert.deepEqual(
    cards[0]!.rows.map((r) => r.id),
    ["1", "3"]
  )
  assert.equal(cards[0]!.clientKey, "9")
})
