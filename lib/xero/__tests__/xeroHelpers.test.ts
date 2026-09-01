import { describe, it } from "node:test"
import assert from "node:assert/strict"

import {
  exceptionReasonForMatch,
  matchMbaAgainstMasters,
  tokenizeReference,
} from "../matchMba"
import {
  inferBillingType,
  isAppInvoiceKey,
  mapXeroStatusToBillingStatus,
  parsePoNumber,
  xeroInvoiceKey,
} from "../billingStatus"
import { dollarsToCents } from "../money"
import { parseXeroDateString, parseXeroDotNetDate } from "../parseXeroDate"
import {
  normalizeContactKey,
  resolveClientFromContact,
} from "../normalizeContact"
import {
  resumeContactsWatermark,
  resumeInvoiceWatermark,
} from "../watermark"
import { mergeStageNotesForTest } from "../runSync"

describe("tokenizeReference / matchMbaAgainstMasters", () => {
  const masters = [
    { id: 1, mba_number: "HEMA001" },
    { id: 2, mba_number: "BOSS006" },
    { id: 3, mba_number: "hema001" }, // duplicate number different id — ambiguous if both match
  ]

  it("tokenises on space / , ; | -", () => {
    assert.deepEqual(tokenizeReference("HEMA001 | PO 123"), ["HEMA001", "PO", "123"])
    assert.deepEqual(tokenizeReference("a/b,c;d|e-f"), ["a", "b", "c", "d", "e", "f"])
  })

  it("matches exactly one MBA (case-insensitive)", () => {
    const r = matchMbaAgainstMasters("HEMA001 | PO 99", [
      { id: 10, mba_number: "HEMA001" },
      { id: 20, mba_number: "BOSS006" },
    ])
    assert.equal(r.matched, true)
    if (r.matched && r.kind === "mba") {
      assert.equal(r.id, 10)
      assert.equal(r.mba_number, "HEMA001")
    }
  })

  it("blank reference → blank", () => {
    const r = matchMbaAgainstMasters("  ", masters)
    assert.equal(r.matched, false)
    if (!r.matched) assert.equal(r.reason, "blank")
    assert.match(
      exceptionReasonForMatch("", r) ?? "",
      /Blank Xero Reference/,
    )
  })

  it("zero matches → no_match", () => {
    const r = matchMbaAgainstMasters("NOPE999", [
      { id: 1, mba_number: "HEMA001" },
    ])
    assert.equal(r.matched, false)
    if (!r.matched) assert.equal(r.reason, "no_match")
    assert.match(
      exceptionReasonForMatch("NOPE999", r) ?? "",
      /No MBA found/,
    )
  })

  it("two+ distinct masters → ambiguous", () => {
    const r = matchMbaAgainstMasters("HEMA001 BOSS006", [
      { id: 1, mba_number: "HEMA001" },
      { id: 2, mba_number: "BOSS006" },
    ])
    assert.equal(r.matched, false)
    if (!r.matched && r.reason === "ambiguous") {
      assert.ok(r.matches.includes("HEMA001"))
      assert.ok(r.matches.includes("BOSS006"))
    }
    assert.match(
      exceptionReasonForMatch("HEMA001 BOSS006", r) ?? "",
      /Ambiguous/,
    )
  })
})

describe("normalizeContact + alias resolution", () => {
  const clients = [
    {
      id: 1,
      mp_client_name: "Hema",
      payment_days: 30,
      payment_terms: "Net 30",
    },
    {
      id: 2,
      mp_client_name: "Candela",
      payment_days: 14,
      payment_terms: "",
    },
    {
      id: 3,
      mp_client_name: "Acme Pty Ltd",
      payment_days: 7,
      payment_terms: "Net 7",
    },
  ]
  const aliases = [
    { contact_key: "hema maps", client_id: 1 },
    {
      contact_key: "syneron candela corporation australia pty ltd",
      client_id: 2,
    },
  ]

  it("strips corporate suffixes", () => {
    assert.equal(normalizeContactKey("Acme Pty Ltd"), "acme")
    assert.equal(
      normalizeContactKey("Foo Limited Australia"),
      "foo",
    )
  })

  it("resolves via suffix-strip vs mp_client_name", () => {
    const r = resolveClientFromContact("Acme Pty Ltd", clients, aliases)
    assert.equal(r.resolved, true)
    assert.equal(r.clientsId, 3)
  })

  it("falls back to alias table", () => {
    const r = resolveClientFromContact("Hema Maps", clients, aliases)
    assert.equal(r.resolved, true)
    assert.equal(r.clientsId, 1)
    assert.equal(r.clientName, "Hema")
  })

  it("unresolved when neither path hits", () => {
    const r = resolveClientFromContact("Unknown Co", clients, aliases)
    assert.equal(r.resolved, false)
    assert.equal(r.clientsId, 0)
  })
})

describe("billing status / invoice_key / PO / type", () => {
  it("maps Xero status exactly", () => {
    assert.equal(mapXeroStatusToBillingStatus("PAID"), "paid")
    assert.equal(mapXeroStatusToBillingStatus("AUTHORISED"), "invoiced")
    assert.equal(mapXeroStatusToBillingStatus("SUBMITTED"), "invoiced")
    assert.equal(mapXeroStatusToBillingStatus("VOIDED"), "cancelled")
    assert.equal(mapXeroStatusToBillingStatus("DELETED"), "cancelled")
    assert.equal(mapXeroStatusToBillingStatus("DRAFT"), "draft")
    assert.equal(mapXeroStatusToBillingStatus("OTHER"), "invoiced")
  })

  it("invoice_key scheme isolation", () => {
    assert.equal(xeroInvoiceKey("abc-123"), "xero:abc-123")
    assert.equal(isAppInvoiceKey("media:MBA:2025-07"), true)
    assert.equal(isAppInvoiceKey("sow:1:2025-07"), true)
    assert.equal(isAppInvoiceKey("retainer:1:2025-07"), true)
    assert.equal(isAppInvoiceKey("xero:abc"), false)
  })

  it("infers billing_type and PO", () => {
    assert.equal(inferBillingType("Monthly retainer", ""), "retainer")
    assert.equal(inferBillingType("FOO_SOW", ""), "sow")
    assert.equal(inferBillingType("HEMA001 | PO 55", ""), "media")
    assert.equal(parsePoNumber("HEMA001 | PO 55"), "PO 55")
    assert.equal(parsePoNumber("PO 99"), "PO 99")
  })
})

describe("money + /Date(ms)/ parse", () => {
  it("converts dollars to cents with banker's round", () => {
    assert.equal(dollarsToCents(10.5), 1050)
    assert.equal(dollarsToCents(2.5), 250)
    // 1.005 → 100.5 → half-to-even → 100
    assert.equal(dollarsToCents(1.005), 100)
  })

  it("parses /Date(ms)/ via substr(6,13)", () => {
    const d = parseXeroDotNetDate("/Date(1719792000000+0000)/")
    assert.ok(d)
    assert.equal(d!.getTime(), 1719792000000)
    assert.equal(parseXeroDotNetDate("short"), null)
    assert.equal(parseXeroDateString("2025-07-15T00:00:00"), "2025-07-15")
  })
})

describe("watermark resume", () => {
  it("resumes invoices from notes.next_page + watermark_used", () => {
    const r = resumeInvoiceWatermark({
      notes: JSON.stringify({ next_page: 7 }),
      watermarkUsed: "2025-06-01T12:00:00.000Z",
      newWatermark: "2025-06-02T12:00:00.000Z",
    })
    assert.equal(r.nextPage, 7)
    assert.equal(r.watermarkStr, "2025-06-01T12:00:00")
  })

  it("starts page 1 from new_watermark when complete", () => {
    const r = resumeInvoiceWatermark({
      notes: JSON.stringify({ stages: {} }),
      watermarkUsed: "2025-06-01T12:00:00.000Z",
      newWatermark: "2025-06-02T12:00:00.000Z",
    })
    assert.equal(r.nextPage, 1)
    assert.equal(r.watermarkStr, "2025-06-02T12:00:00")
  })

  it("contacts use own keys", () => {
    const r = resumeContactsWatermark({
      notes: JSON.stringify({
        contacts_next_page: 3,
        contacts_watermark: "2025-01-01T00:00:00",
      }),
      watermarkUsed: null,
      newWatermark: null,
    })
    assert.equal(r.nextPage, 3)
    assert.equal(r.watermarkStr, "2025-01-01T00:00:00")
  })
})

describe("stage isolation", () => {
  it("failed stage notes do not block later stage metadata merge", () => {
    const merged = mergeStageNotesForTest(
      JSON.stringify({ errors: ["ingest boom"] }),
      {
        contacts_new_watermark: "2026-07-30T00:00:00.000Z",
        stages: { contacts_refresh: { ok: true } },
      },
    )
    assert.deepEqual(merged.errors, ["ingest boom"])
    assert.equal(merged.contacts_new_watermark, "2026-07-30T00:00:00.000Z")
    assert.equal(
      (merged.stages as { contacts_refresh: { ok: boolean } }).contacts_refresh
        .ok,
      true,
    )
  })
})
