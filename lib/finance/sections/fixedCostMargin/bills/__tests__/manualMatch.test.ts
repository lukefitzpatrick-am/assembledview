/**
 * MAR-4: saved manual matches of bill lines (ap_bill_line_matches). Request
 * validation, the bill line lookup the API saves, and the matcher using saved
 * matches before any automatic rule.
 */

import assert from "node:assert/strict"
import test from "node:test"

import { billLineView, buildCfPlacementMap, createBillPublisherResolver, createDirectPublisherFor } from "../assemble.js"
import { savedMatchLabel } from "../../excel.js"
import {
  billLineForMatch,
  dateToMonth,
  MANUAL_MATCH_MARKER,
  monthToDate,
  parseCreateManualMatchBody,
  parseManualMatchId,
} from "../manualMatch.js"
import {
  billCostCells,
  buildSavedMatchMap,
  matchBillLines,
  savedMatchKey,
  type BillMatchContext,
  type SavedBillLineMatch,
} from "../match.js"
import { parseBill, type RawBillRow } from "../parse.js"
import { KNOWN_MBAS, MBA_CLIENTS, PLAN_LINES, PUBLISHERS } from "./fixtures.js"

/** AA bill with no MBA anywhere (shape of the Sinch / Molicare bills), Xero line ids kept. */
const AA_NO_MBA: RawBillRow = {
  billId: 10995,
  xeroInvoiceId: "aa-nomba",
  invoiceNumber: "Krusty Engage - Brand | 108320",
  referenceRaw: "",
  contactName: "Advertising Associates",
  status: "AUTHORISED",
  currency: "AUD",
  issueDate: "2026-09-30",
  lineAmountTypes: "Exclusive",
  lineItems: [
    {
      LineItemID: "LI-A",
      Description: "National National Weekly Times\n\nSun-Sat 09/08/2026 Early General News",
      LineAmount: 3870,
    },
    { LineItemID: "LI-B", Description: "National National Nova Production\n\n09/08/2026 Talent", LineAmount: 1900 },
  ],
}

/** Two identical Queensland Country Life lines on krusty011 in Sep (one plan month of 2,134). */
const AA_TWO_SAME: RawBillRow = {
  billId: 10956,
  xeroInvoiceId: "aa-two",
  invoiceNumber: "Krusty Automotive | KRUSTY011 | 108202",
  referenceRaw: "",
  contactName: "Advertising Associates",
  status: "PAID",
  currency: "AUD",
  issueDate: "2026-09-30",
  lineAmountTypes: "Exclusive",
  lineItems: [
    { LineItemID: "LI-1", Description: "Regional Queensland Queensland Country Life\n\nThursday 17/09/2026", LineAmount: 2134 },
    { LineItemID: "LI-2", Description: "Regional Queensland Queensland Country Life\n\nThursday 24/09/2026", LineAmount: 2134 },
  ],
}

function ctx(saved: SavedBillLineMatch[] = []): BillMatchContext {
  const resolve = createBillPublisherResolver(PUBLISHERS)
  return {
    knownMbas: KNOWN_MBAS,
    mbaClients: MBA_CLIENTS,
    planLines: PLAN_LINES,
    cfPlacements: buildCfPlacementMap([]),
    resolveMediaOwner: resolve,
    directPublisherFor: createDirectPublisherFor(resolve),
    savedMatches: buildSavedMatchMap(saved),
  }
}

function saved(over: Partial<SavedBillLineMatch>): SavedBillLineMatch {
  return {
    id: 1,
    xeroInvoiceId: "aa-nomba",
    xeroLineItemId: "LI-A",
    mbaNumber: "krusty010",
    lineItemId: "krusty010np1",
    month: "2026-09",
    amountCents: 387000,
    matchedBy: "finance@example.com",
    matchedAt: "2026-10-28T09:00:00Z",
    note: "Weekly Times is News Corp on KRUSTY010",
    ...over,
  }
}

test("validation: create body, id, month, note length, line must belong to the MBA", () => {
  const ok = parseCreateManualMatchBody({
    xeroInvoiceId: " aa-nomba ",
    xeroLineItemId: "LI-A",
    mbaNumber: "KRUSTY010",
    lineItemId: "KRUSTY010NP1",
    month: "2026-09",
    note: "  ",
  })
  assert.deepEqual(ok, {
    ok: true,
    value: {
      xeroInvoiceId: "aa-nomba",
      xeroLineItemId: "LI-A",
      mbaNumber: "krusty010",
      lineItemId: "krusty010np1",
      month: "2026-09",
      note: null,
    },
  })
  assert.equal(parseCreateManualMatchBody(null).ok, false)
  assert.equal(parseCreateManualMatchBody({ xeroInvoiceId: "a", mbaNumber: "x", lineItemId: "x1", month: "2026-09" }).ok, false)
  const wrongMba = parseCreateManualMatchBody({
    xeroInvoiceId: "a", xeroLineItemId: "b", mbaNumber: "krusty010", lineItemId: "krusty011np1", month: "2026-09",
  })
  assert.equal(wrongMba.ok, false)
  for (const month of ["2026-13", "2026-9", "Sep 26", ""]) {
    assert.equal(
      parseCreateManualMatchBody({ xeroInvoiceId: "a", xeroLineItemId: "b", mbaNumber: "m001", lineItemId: "m001x1", month }).ok,
      false,
      month
    )
  }
  assert.equal(
    parseCreateManualMatchBody({
      xeroInvoiceId: "a", xeroLineItemId: "b", mbaNumber: "m001", lineItemId: "m001x1", month: "2026-09", note: "x".repeat(501),
    }).ok,
    false
  )
  assert.equal(parseManualMatchId("12"), 12)
  for (const bad of [null, "", "0", "-1", "1.5", "abc"]) assert.equal(parseManualMatchId(bad), null, String(bad))
  assert.equal(MANUAL_MATCH_MARKER, "0107_ap_bill_line_matches")
})

test("bill line lookup: by Xero LineItemID, ex GST the same way the matcher computes it", () => {
  const inclusive = {
    lineAmountTypes: "Inclusive",
    lineItems: [
      { LineItemID: "H", Description: "header", LineAmount: null },
      { LineItemID: "PL-1", Description: "SkippablePL267346", LineAmount: 6179.17, TaxAmount: 561.74 },
    ],
  }
  assert.deepEqual(billLineForMatch(inclusive, "pl-1"), { lineIndex: 1, exGstCents: 561743 })
  assert.equal(billLineForMatch(inclusive, "H"), null)
  assert.equal(billLineForMatch(inclusive, "missing"), null)
  const parsed = parseBill({ ...AA_NO_MBA, lineAmountTypes: "Inclusive", lineItems: inclusive.lineItems }, "advertising_associates")
  assert.equal(parsed[0]!.exGstCents, 561743)
  assert.equal(parsed[0]!.xeroLineItemId, "PL-1")
  assert.equal(monthToDate("2026-09"), "2026-09-01")
  assert.equal(dateToMonth("2026-09-01"), "2026-09")
  assert.equal(dateToMonth(new Date(2026, 8, 1)), "2026-09")
})

test("matcher: a saved match decides a bill line with no MBA; client, month and cost follow it", () => {
  const parsed = parseBill(AA_NO_MBA, "advertising_associates")
  const before = matchBillLines(parsed, ctx())
  assert.equal(before[0]!.state, "unmatched")
  assert.match(before[0]!.reason, /No MBA/)

  const after = matchBillLines(parsed, ctx([saved({})]))
  const l = after[0]!
  assert.equal(l.state, "matched")
  assert.equal(l.method, "manual")
  assert.equal(l.mbaSource, "manual")
  assert.equal(l.mbaNumber, "krusty010")
  assert.equal(l.lineItemId, "krusty010np1")
  assert.equal(l.clientId, 53)
  assert.equal(l.publisher, "News Corp")
  assert.equal(l.billedMonth, "2026-09")
  assert.equal(l.deliveredMonth, "2026-09")
  assert.equal(l.netCents, 387000 - Math.round(387000 * 0.08))
  assert.equal(l.savedMatch?.stale, false)
  assert.match(l.reason, /Saved match by finance@example.com/)
  // The talent line has no saved match: still production, untouched.
  assert.equal(after[1]!.state, "production")
  assert.equal(after[1]!.savedMatch, null)

  const cells = billCostCells(after)
  assert.deepEqual(
    cells.map((c) => [c.lineItemId, c.month, c.basis, c.methods]),
    [
      ["krusty010np1", "2026-09", "billed", ["manual"]],
      ["krusty010np1", "2026-09", "delivered", ["manual"]],
    ]
  )
  const view = billLineView(l)
  assert.equal(view.xeroLineItemId, "LI-A")
  assert.equal(view.savedMatch?.id, 1)
  assert.match(savedMatchLabel(view), /^krusty010np1 2026-09; by finance@example.com; 2026-10-28; Weekly Times/)
})

test("matcher: saved matches go first and take their line-month before the amount tie-break", () => {
  const parsed = parseBill(AA_TWO_SAME, "advertising_associates")
  const auto = matchBillLines(parsed, ctx())
  assert.equal(auto[0]!.state, "matched")
  assert.equal(auto[0]!.lineItemId, "krusty011np2")
  assert.equal(auto[1]!.state, "ambiguous")

  const withSaved = matchBillLines(
    parsed,
    ctx([saved({ id: 7, xeroInvoiceId: "aa-two", xeroLineItemId: "li-2", mbaNumber: "krusty011", lineItemId: "krusty011np2", amountCents: 213400 })])
  )
  // Line 2 keeps its saved line; line 1 can no longer take that line-month by amount.
  assert.equal(withSaved[1]!.state, "matched")
  assert.equal(withSaved[1]!.method, "manual")
  assert.equal(withSaved[1]!.lineItemId, "krusty011np2")
  assert.equal(withSaved[0]!.state, "ambiguous")
  assert.equal(savedMatchKey("aa-two", "LI-2"), savedMatchKey("aa-two", "li-2"))
})

test("matcher: a stale saved match is not applied; a saved line that is not live stays unmatched", () => {
  const parsed = parseBill(AA_NO_MBA, "advertising_associates")
  const stale = matchBillLines(parsed, ctx([saved({ amountCents: 380000 })]))[0]!
  assert.equal(stale.state, "unmatched")
  assert.equal(stale.savedMatch?.stale, true)
  assert.match(stale.reason, /^Saved match not applied: the bill line was 3800\.00 when matched and is now 3870\.00/)
  assert.match(savedMatchLabel(billLineView(stale)), /NOT APPLIED: bill line amount changed/)

  const missing = matchBillLines(parsed, ctx([saved({ lineItemId: "krusty010np9" })]))[0]!
  assert.equal(missing.state, "unmatched")
  assert.equal(missing.savedMatch?.lineMissing, true)
  assert.equal(missing.lineItemId, "krusty010np9")
  assert.match(missing.reason, /not on an approved, booked or completed published plan of krusty010/)
  assert.equal(billCostCells([missing]).length, 0)

  // A line with no Xero LineItemID can never take a saved match.
  const noId = parseBill(
    { ...AA_NO_MBA, lineItems: [{ Description: "National National Weekly Times", LineAmount: 3870 }] },
    "advertising_associates"
  )
  assert.equal(matchBillLines(noId, ctx([saved({ xeroLineItemId: "" })]))[0]!.savedMatch, null)
  // First row wins when two rows name the same bill line.
  const map = buildSavedMatchMap([saved({ id: 1 }), saved({ id: 2, lineItemId: "krusty010np2" })])
  assert.equal(map.size, 1)
  assert.equal(map.get(savedMatchKey("aa-nomba", "LI-A"))!.id, 1)
})
