import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { formatMoney } from "@/lib/format/money"
import { fromCents } from "@/lib/money"

import {
  NO_CLIENT_LINK_LABEL,
  assembleOverdueDigest,
  buildOverdueDigestEmailHtml,
  buildOverdueDigestSubject,
  isOverdueDigestEnabled,
  runOverdueDigest,
  type OverdueDigestSource,
} from "../overdueDigest"

const TODAY = "2026-10-08"
const XERO_URL = "https://app.example/finance/xero"
const MONDAY = new Date("2026-10-12T01:30:00.000Z")
const SATURDAY = new Date("2026-10-10T02:00:00.000Z")

function source(partial: Partial<OverdueDigestSource> & Pick<OverdueDigestSource, "dueDate" | "amountDueCents">): OverdueDigestSource {
  return {
    invoiceNumber: partial.invoiceNumber ?? "INV-1",
    dueDate: partial.dueDate,
    amountDueCents: partial.amountDueCents,
    mbaNumber: partial.mbaNumber ?? "ACME001",
    contactName: partial.contactName ?? "Acme Pty Ltd",
    clientId: partial.clientId === undefined ? 7 : partial.clientId,
    clientName: partial.clientName === undefined ? "Acme" : partial.clientName,
  }
}

describe("overdue digest grouping", () => {
  it("groups by client and keeps unresolved contacts under No client link", () => {
    const digest = assembleOverdueDigest(
      [
        source({ invoiceNumber: "INV-B", dueDate: "2026-10-01", amountDueCents: 2000, clientId: 8, clientName: "Beta", mbaNumber: "BETA001" }),
        source({ invoiceNumber: "INV-A2", dueDate: "2026-09-01", amountDueCents: 3000, clientId: 7, clientName: "Acme", mbaNumber: "ACME002" }),
        source({ invoiceNumber: "INV-A1", dueDate: "2026-10-01", amountDueCents: 1000, clientId: 7, clientName: "Acme", mbaNumber: "ACME001" }),
        source({
          invoiceNumber: "INV-X",
          dueDate: "2026-09-20",
          amountDueCents: 4000,
          clientId: null,
          clientName: null,
          contactName: "Mystery Pty Ltd",
          mbaNumber: null,
        }),
      ],
      { todayYmd: TODAY, xeroUrl: XERO_URL },
    )

    assert.ok(digest)
    assert.deepEqual(
      digest.groups.map((group) => group.label),
      ["Acme", "Beta", NO_CLIENT_LINK_LABEL],
    )
    assert.deepEqual(
      digest.groups[0]?.invoices.map((invoice) => invoice.invoiceNumber),
      ["INV-A2", "INV-A1"],
    )
    assert.equal(digest.groups[0]?.invoices[0]?.mbaNumber, "ACME002")
    assert.equal(digest.groups[2]?.unlinked, true)
    assert.equal(digest.groups[2]?.invoices[0]?.contactName, "Mystery Pty Ltd")
    assert.equal(digest.invoiceCount, 4)
    assert.equal(digest.totalDueCents, 10000)

    const html = buildOverdueDigestEmailHtml(digest)
    assert.match(html, /No client link/)
    assert.match(html, /Mystery Pty Ltd/)
    assert.match(html, /https:\/\/app\.example\/finance\/xero/)
    assert.match(html, /Amounts include GST/)
    assert.equal(buildOverdueDigestSubject(digest), `Overdue invoices: 4 totalling ${formatMoney(fromCents(10000))}`)
  })
})

describe("overdue digest ageing", () => {
  it("puts day 14, 30 and 60 in the closed buckets and day 61 in 60+", () => {
    const digest = assembleOverdueDigest(
      [
        source({ invoiceNumber: "D1", dueDate: "2026-10-07", amountDueCents: 1 }),
        source({ invoiceNumber: "D14", dueDate: "2026-09-24", amountDueCents: 14 }),
        source({ invoiceNumber: "D15", dueDate: "2026-09-23", amountDueCents: 15 }),
        source({ invoiceNumber: "D30", dueDate: "2026-09-08", amountDueCents: 30 }),
        source({ invoiceNumber: "D31", dueDate: "2026-09-07", amountDueCents: 31 }),
        source({ invoiceNumber: "D60", dueDate: "2026-08-09", amountDueCents: 60 }),
        source({ invoiceNumber: "D61", dueDate: "2026-08-08", amountDueCents: 61 }),
        source({ invoiceNumber: "DUE-TODAY", dueDate: TODAY, amountDueCents: 999 }),
      ],
      { todayYmd: TODAY, xeroUrl: XERO_URL },
    )

    assert.ok(digest)
    assert.equal(digest.invoiceCount, 7)
    assert.equal(digest.ageing.d1_14, 15)
    assert.equal(digest.ageing.d15_30, 45)
    assert.equal(digest.ageing.d31_60, 91)
    assert.equal(digest.ageing.d60_plus, 61)
    assert.equal(digest.totalDueCents, 15 + 45 + 91 + 61)
  })
})

describe("overdue digest send gates", () => {
  it("sends nothing when no invoice is overdue", async () => {
    let sent = 0
    let recorded = 0
    const result = await runOverdueDigest({
      enabled: true,
      now: MONDAY,
      recipients: ["ops@example.com"],
      alreadySent: async () => false,
      loadInvoices: async () => [],
      sendHtmlEmail: async () => {
        sent += 1
      },
      recordSend: async () => {
        recorded += 1
      },
    })
    assert.deepEqual(result, { skipped: "nothing_overdue" })
    assert.equal(sent, 0)
    assert.equal(recorded, 0)
  })

  it("skips when the flag is not exactly true", async () => {
    const env = (flag?: string): NodeJS.ProcessEnv =>
      ({ NODE_ENV: "test", OVERDUE_DIGEST_ENABLED: flag }) as NodeJS.ProcessEnv
    assert.equal(isOverdueDigestEnabled(env("true")), true)
    assert.equal(isOverdueDigestEnabled(env(undefined)), false)
    assert.equal(isOverdueDigestEnabled(env("on")), false)

    let loaded = 0
    let sent = 0
    const result = await runOverdueDigest({
      enabled: false,
      now: MONDAY,
      alreadySent: async () => false,
      loadInvoices: async () => {
        loaded += 1
        return []
      },
      sendHtmlEmail: async () => {
        sent += 1
      },
      recordSend: async () => {},
    })
    assert.deepEqual(result, { skipped: "disabled" })
    assert.equal(loaded, 0)
    assert.equal(sent, 0)
  })

  it("skips when today's Sydney date was already sent", async () => {
    let loaded = 0
    let sent = 0
    const result = await runOverdueDigest({
      enabled: true,
      now: MONDAY,
      alreadySent: async (asOfDate) => {
        assert.equal(asOfDate, "2026-10-12")
        return true
      },
      loadInvoices: async () => {
        loaded += 1
        return [source({ dueDate: "2026-10-01", amountDueCents: 100 })]
      },
      sendHtmlEmail: async () => {
        sent += 1
      },
      recordSend: async () => {},
    })
    assert.deepEqual(result, { skipped: "already_sent" })
    assert.equal(loaded, 0)
    assert.equal(sent, 0)
  })

  it("skips Saturday in Sydney before any send", async () => {
    let sent = 0
    const result = await runOverdueDigest({
      enabled: true,
      now: SATURDAY,
      alreadySent: async () => false,
      loadInvoices: async () => [source({ dueDate: "2026-10-01", amountDueCents: 100 })],
      sendHtmlEmail: async () => {
        sent += 1
      },
      recordSend: async () => {},
    })
    assert.deepEqual(result, { skipped: "weekend" })
    assert.equal(sent, 0)
  })

  it("logs an insert failure after a successful send and does not throw", async () => {
    let sent = 0
    const result = await runOverdueDigest({
      enabled: true,
      now: MONDAY,
      recipients: ["ops@example.com"],
      xeroUrl: XERO_URL,
      alreadySent: async () => false,
      loadInvoices: async () => [source({ dueDate: "2026-10-01", amountDueCents: 2500, invoiceNumber: "INV-9" })],
      sendHtmlEmail: async (params) => {
        sent += 1
        assert.equal(params.to[0], "ops@example.com")
        assert.match(params.subject, /^Overdue invoices: 1 totalling /)
        assert.match(params.html, /INV-9/)
      },
      recordSend: async () => {
        throw new Error("insert failed")
      },
    })
    assert.equal(sent, 1)
    assert.equal("status" in result && result.status === "sent" && result.logged === false, true)
  })
})
