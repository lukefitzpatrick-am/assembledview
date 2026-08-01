/**
 * CP-8 — client-pays detail is the complement of CP-3 payables media.
 *
 * Fixture client-pays appears on the client-pays page and NOT in the payables
 * headline; status filter respected.
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
  CLIENT_PAYS_FEE_OMIT_NOTE,
  CLIENT_PAYS_LINE_DETAIL_NOTE,
  CLIENT_PAYS_PAGE_CAPTION,
  nestClientPaysRows,
  partitionClientPaysMedia,
  type ClientPaysMediaCell,
  type FlatClientPaysRow,
} from "../clientPaysCompose.js"

const FIXTURE: ClientPaysMediaCell[] = [
  {
    lineItemId: "agency-se1",
    amountCents: 100_000_00,
    campaignStatus: "booked",
    clientPaysForMedia: false,
  },
  {
    lineItemId: "cp-pd1",
    amountCents: 5_000_00,
    campaignStatus: "approved",
    clientPaysForMedia: true,
  },
  {
    lineItemId: "cp-pd2",
    amountCents: 2_500_00,
    campaignStatus: "completed",
    clientPaysForMedia: true,
  },
  {
    lineItemId: "orphan-legacy",
    amountCents: 8_000_00,
    campaignStatus: "completed",
    clientPaysForMedia: null,
  },
  {
    lineItemId: "__service__media_total",
    amountCents: 20_000_00,
    campaignStatus: "booked",
    clientPaysForMedia: false,
  },
  // Draft client-pays — excluded from both headlines; status coverage only
  {
    lineItemId: "draft-cp1",
    amountCents: 9_000_00,
    campaignStatus: "draft",
    clientPaysForMedia: true,
  },
  {
    lineItemId: "planned-cp1",
    amountCents: 1_000_00,
    campaignStatus: "planned",
    clientPaysForMedia: true,
  },
  {
    lineItemId: "cancelled-agency",
    amountCents: 3_000_00,
    campaignStatus: "cancelled",
    clientPaysForMedia: false,
  },
]

test("client-pays fixture appears on detail page and NOT in payables headline", () => {
  const r = partitionClientPaysMedia(FIXTURE)

  assert.equal(r.clientPaysDetailCents, 5_000_00 + 2_500_00)
  assert.equal(r.lineCount, 2)

  // Payables = agency + orphan + service (never client-pays)
  assert.equal(r.payablesHeadlineCents, 100_000_00 + 8_000_00 + 20_000_00)

  // Complements are disjoint
  assert.equal(
    r.payablesHeadlineCents + r.clientPaysDetailCents,
    100_000_00 + 8_000_00 + 20_000_00 + 5_000_00 + 2_500_00
  )
  assert.ok(!Number.isNaN(r.clientPaysDetailCents))
  assert.notEqual(r.clientPaysDetailCents, 0)
  assert.ok(r.payablesHeadlineCents > r.clientPaysDetailCents)
})

test("status filter excludes draft/planned/cancelled client-pays from detail totals", () => {
  const r = partitionClientPaysMedia(FIXTURE)
  assert.equal(r.clientPaysExcludedByStatusCents, 9_000_00 + 1_000_00)
  // Draft $9k must not enter the client-pays detail total
  assert.ok(r.clientPaysDetailCents < 9_000_00)
  assert.equal(r.clientPaysDetailCents + r.clientPaysExcludedByStatusCents, 5_000_00 + 2_500_00 + 10_000_00)
})

test("service rollups never enter client-pays detail even if misflagged", () => {
  const r = partitionClientPaysMedia([
    {
      lineItemId: "__service__media_total",
      amountCents: 50_000_00,
      campaignStatus: "booked",
      clientPaysForMedia: true, // impossible in SQL (no join), still must not land here
    },
  ])
  assert.equal(r.clientPaysDetailCents, 0)
  assert.equal(r.payablesHeadlineCents, 0)
  assert.equal(r.lineCount, 0)
})

test("nestClientPaysRows groups client → MBA → line with monthly amounts", () => {
  const flat: FlatClientPaysRow[] = [
    {
      clientId: 1,
      clientName: "Acme",
      mbaNumber: "MBA-1",
      campaignName: "Spring",
      campaignStatus: "booked",
      lineItemId: "cp-pd1",
      publisher: "DV360",
      channel: "prog_display",
      month: "2025-07",
      mediaCents: 3_000_00,
    },
    {
      clientId: 1,
      clientName: "Acme",
      mbaNumber: "MBA-1",
      campaignName: "Spring",
      campaignStatus: "booked",
      lineItemId: "cp-pd1",
      publisher: "DV360",
      channel: "prog_display",
      month: "2025-08",
      mediaCents: 2_000_00,
    },
    {
      clientId: 2,
      clientName: "Beta",
      mbaNumber: "MBA-2",
      campaignName: "Always on",
      campaignStatus: "approved",
      lineItemId: "cp-se1",
      publisher: "Google Ads",
      channel: "search",
      month: "2025-07",
      mediaCents: 1_500_00,
    },
  ]
  const nested = nestClientPaysRows(flat)
  assert.equal(nested.length, 2)
  assert.equal(nested[0]!.clientName, "Acme")
  assert.equal(nested[0]!.totalCents, 5_000_00)
  assert.equal(nested[0]!.mbas[0]!.lines[0]!.byMonth["2025-07"], 3_000_00)
  assert.equal(nested[0]!.mbas[0]!.lines[0]!.byMonth["2025-08"], 2_000_00)
  assert.equal(nested[1]!.clientName, "Beta")
})

test("caption and coverage notes disclose fee omit + C-29 line-detail limit", () => {
  assert.match(CLIENT_PAYS_PAGE_CAPTION, /excluded from Assembled payables/i)
  assert.match(CLIENT_PAYS_PAGE_CAPTION, /Agency fee/i)
  assert.match(CLIENT_PAYS_LINE_DETAIL_NOTE, /__service__/i)
  assert.match(CLIENT_PAYS_FEE_OMIT_NOTE, /omitted/i)
  assert.match(CLIENT_PAYS_FEE_OMIT_NOTE, /C-27/)
})
