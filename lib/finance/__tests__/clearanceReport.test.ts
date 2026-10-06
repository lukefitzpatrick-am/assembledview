import assert from "node:assert/strict"
import test from "node:test"

import { buildClearanceReport, clearanceSubject, lineThatMoved, type ClearanceSourceRow } from "../clearanceReport.js"
import { runClearanceReports, type RunClearanceDeps } from "../runClearanceReports.js"

function row(partial: Partial<ClearanceSourceRow> = {}): ClearanceSourceRow {
  return {
    invoiceKey: "media:BIC001:2026-07",
    billingMonth: "2026-07",
    clientName: "BIC",
    mbaNumber: "BIC001",
    campaignName: "Winter",
    expectedCents: 10_000,
    xeroInvoiceId: "inv-1",
    xeroStatus: "DRAFT",
    draftCents: 10_050,
    invoiceNumber: "INV-1",
    appLines: [{ description: "Media", cents: 10_000 }],
    draftLines: [{ description: "Media", cents: 10_050 }],
    ...partial,
  }
}

function harness(overrides: Partial<RunClearanceDeps> = {}): RunClearanceDeps & {
  calls: { email: number; record: number; audit: number }
} {
  const calls = { email: 0, record: 0, audit: 0 }
  return {
    accountsEmail: "accounts@example.com",
    financeEmail: "finance@example.com",
    calls,
    loadMonths: async () => [{ month: "2026-07", rows: [row()] }],
    lastHash: async () => null,
    sendEmail: async () => {
      calls.email += 1
    },
    recordSend: async () => {
      calls.record += 1
    },
    ...overrides,
  }
}

test("a draft within $1 is cleared and a $2 gap differs on the line that moved", () => {
  const report = buildClearanceReport("2026-07", [
    row(),
    row({
      invoiceKey: "media:BIC002:2026-07",
      mbaNumber: "BIC002",
      xeroInvoiceId: "inv-2",
      expectedCents: 10_000,
      draftCents: 10_200,
      appLines: [
        { description: "Media", cents: 8_000 },
        { description: "Fee", cents: 2_000 },
      ],
      draftLines: [
        { description: "Media", cents: 8_200 },
        { description: "Fee", cents: 2_000 },
      ],
    }),
    row({
      invoiceKey: "sow:SC1:2026-07",
      mbaNumber: "SC1",
      xeroInvoiceId: null,
      xeroStatus: null,
      draftCents: null,
      expectedCents: 4_000,
    }),
  ])
  assert.equal(report.counts.cleared, 1)
  assert.equal(report.counts.differs, 1)
  assert.equal(report.counts.missing, 1)
  const differs = report.differs[0]
  assert.equal(differs?.expectedCents, 10_000)
  assert.equal(differs?.draftCents, 10_200)
  assert.equal(differs?.deltaCents, 200)
  assert.equal(differs?.line?.description, "Media")
  assert.equal(differs?.line?.deltaCents, 200)
  assert.equal(
    clearanceSubject(report),
    "July 2026 drafts · 1 cleared · 1 differ · 1 not yet drafted",
  )
})

test("lines that share a description report the largest move", () => {
  const moved = lineThatMoved(
    [
      { description: "Media", cents: 8_000 },
      { description: "Fee", cents: 2_000 },
    ],
    [
      { description: "Media", cents: 8_200 },
      { description: "Fee", cents: 1_900 },
    ],
  )
  assert.equal(moved?.description, "Media")
  assert.equal(moved?.expectedCents, 8_000)
  assert.equal(moved?.draftCents, 8_200)
})

test("unchanged set does not resend", async () => {
  const first = harness()
  const sent = await runClearanceReports({ force: false, deps: first })
  assert.equal(sent.months[0]?.sent, true)
  const hash = sent.months[0]?.hash
  const second = harness({
    lastHash: async () => hash ?? null,
  })
  const again = await runClearanceReports({ force: false, deps: second })
  assert.equal(again.months[0]?.reason, "unchanged")
  assert.equal(second.calls.email, 0)
  assert.equal(second.calls.record, 0)
})

test("changed set resends", async () => {
  let subject = ""
  let filename = ""
  const deps = harness({
    lastHash: async () => "old-hash",
    loadMonths: async () => [
      {
        month: "2026-07",
        rows: [row({ draftCents: 12_000, draftLines: [{ description: "Media", cents: 12_000 }] })],
      },
    ],
    sendEmail: async (message) => {
      deps.calls.email += 1
      subject = message.subject
      filename = message.attachments[0]?.filename ?? ""
    },
  })
  const result = await runClearanceReports({ force: false, deps })
  assert.equal(result.months[0]?.sent, true)
  assert.equal(deps.calls.email, 1)
  assert.equal(deps.calls.record, 1)
  assert.equal(subject, "July 2026 drafts · 0 cleared · 1 differ · 0 not yet drafted")
  assert.equal(filename, "2026-07-cleared.csv")
})

test("Clear for issue sends even when the hash matches", async () => {
  const preview = buildClearanceReport("2026-07", [row()])
  let audited = 0
  const deps = harness({
    lastHash: async () => preview.hash,
    audit: async () => {
      audited += 1
    },
  })
  const result = await runClearanceReports({ force: true, months: ["2026-07"], deps })
  assert.equal(result.months[0]?.sent, true)
  assert.equal(deps.calls.email, 1)
  assert.equal(deps.calls.record, 1)
  assert.equal(audited, 1)
})
