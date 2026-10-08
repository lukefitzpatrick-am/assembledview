import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { MANUAL_LINK_LEARNED_FROM } from "@/lib/xero/contactLinks"
import { assembleUnlinkedContacts } from "@/lib/xero/unlinkedContacts"
import type { AliasRow, ClientRow, ContactLinkRow } from "@/lib/xero/normalizeContact"

const clients: ClientRow[] = [
  { id: 1, mp_client_name: "Acme" },
  { id: 2, mp_client_name: "Other Co" },
  { id: 8, mp_client_name: "Penfolds" },
]

const aliases: AliasRow[] = [{ contact_key: "foo bar", client_id: 2 }]

describe("assembleUnlinkedContacts", () => {
  it("excludes contacts that already have a stored link", () => {
    const links: ContactLinkRow[] = [{ xeroContactKey: "linked-id", clientId: 1 }]
    const result = assembleUnlinkedContacts({
      orphanInvoiceCount: 0,
      links,
      clients,
      aliases,
      mbaHints: [],
      invoices: [
        {
          xeroContactId: "linked-id",
          contactName: "Linked Pty Ltd",
          totalDollars: 100,
          amountDueDollars: 40,
          issueDate: "2025-08-01",
          mbaNumber: null,
        },
        {
          xeroContactId: "open-id",
          contactName: "Foo Bar",
          totalDollars: 10.5,
          amountDueDollars: 10.5,
          issueDate: "2025-09-01",
          mbaNumber: null,
        },
      ],
    })

    assert.deepEqual(
      result.contacts.map((row) => row.xeroContactId),
      ["open-id"],
    )
    assert.equal(result.coverage.linked, 1)
    assert.equal(result.coverage.total, 2)
    assert.equal(result.coverage.hiddenInvoiceCount, 1)
    assert.equal(result.contacts[0]?.suggestion?.via, "alias")
    assert.equal(result.contacts[0]?.suggestion?.clientId, 2)
    assert.equal(result.contacts[0]?.totalCents, 1050)
    assert.equal(result.contacts[0]?.amountDueCents, 1050)
  })

  it("suggests a unique normalised name as fuzzy and an MBA only when the name does not match", () => {
    const result = assembleUnlinkedContacts({
      orphanInvoiceCount: 2,
      links: [],
      clients,
      aliases,
      mbaHints: [
        {
          mbaNumber: "PENFOLD018",
          clientId: 8,
          clientName: "Penfolds",
          mbaIdentifier: "PENFOLD",
        },
      ],
      invoices: [
        {
          xeroContactId: "name-id",
          contactName: "Acme Pty Ltd",
          totalDollars: 20,
          amountDueDollars: 0,
          issueDate: "2025-07-15",
          mbaNumber: "PENFOLD018",
        },
        {
          xeroContactId: "mba-id",
          contactName: "Unknown Winery",
          totalDollars: 30,
          amountDueDollars: 30,
          issueDate: "2026-01-02",
          mbaNumber: "PENFOLD018",
        },
      ],
    })

    const byId = new Map(result.contacts.map((row) => [row.xeroContactId, row]))
    assert.equal(byId.get("name-id")?.suggestion?.via, "fuzzy")
    assert.equal(byId.get("name-id")?.suggestion?.clientId, 1)
    assert.equal(byId.get("mba-id")?.suggestion?.via, "mba")
    assert.equal(byId.get("mba-id")?.suggestion?.clientId, 8)
    assert.equal(result.coverage.hiddenInvoiceCount, 4)
    assert.equal(result.coverage.linked, 0)
  })
})

describe("MANUAL_LINK_LEARNED_FROM", () => {
  it("is the manual_link source", () => {
    assert.equal(MANUAL_LINK_LEARNED_FROM, "manual_link")
  })
})
