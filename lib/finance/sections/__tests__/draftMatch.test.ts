import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { MbaMaster, ScopeOfWorkRef } from "@/lib/xero/matchMba"
import {
  compareDraftsToApproved,
  groupDraftMatchRows,
  type DraftMatchApproved,
  type DraftMatchXero,
} from "../draftMatch"

const masters: MbaMaster[] = [{ id: 18, mba_number: "PENFOLD018" }]
const scopes: ScopeOfWorkRef[] = [{ id: 101, scope_id: "legal_sow001" }]

function approved(
  partial: Partial<DraftMatchApproved> & Pick<DraftMatchApproved, "invoice_key">
): DraftMatchApproved {
  return {
    clients_id: 1,
    client_name: "Penfolds",
    mba_number: "PENFOLD018",
    billing_month: "2026-08",
    approved_amount_cents: 10_000,
    ...partial,
  }
}

function draft(
  partial: Partial<DraftMatchXero> & Pick<DraftMatchXero, "xero_invoice_id">
): DraftMatchXero {
  return {
    invoice_number: "INV-1",
    reference_raw: "Penfolds - Grange (PENFOLD018)",
    clients_id: 1,
    client_name: "Penfolds",
    billing_month: "2026-08",
    sub_total_cents: 10_000,
    status: "DRAFT",
    ...partial,
  }
}

function run(input: { approved?: DraftMatchApproved[]; drafts?: DraftMatchXero[] }) {
  return compareDraftsToApproved({
    approved: input.approved ?? [],
    drafts: input.drafts ?? [],
    masters,
    scopes,
  })
}

describe("draft match — four outcomes", () => {
  it("Agrees when a matched pair is within $0.01", () => {
    const { rows } = run({
      approved: [approved({ invoice_key: "media:PENFOLD018:2026-08" })],
      drafts: [draft({ xero_invoice_id: "guid-agree" })],
    })
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.outcome, "Agrees")
    assert.equal(rows[0]?.delta_cents, 0)
    assert.equal(rows[0]?.stamps[0]?.matched_by, "auto")
    assert.equal(rows[0]?.stamps[0]?.xero_invoice_id, "guid-agree")
  })

  it("Differs when a matched pair disagrees on amount", () => {
    const { rows } = run({
      approved: [
        approved({
          invoice_key: "media:PENFOLD018:2026-08",
          approved_amount_cents: 10_000,
        }),
      ],
      drafts: [draft({ xero_invoice_id: "guid-diff", sub_total_cents: 9_500 })],
    })
    assert.equal(rows[0]?.outcome, "Differs")
    assert.equal(rows[0]?.approved_amount_cents, 10_000)
    assert.equal(rows[0]?.xero_amount_cents, 9_500)
    assert.equal(rows[0]?.delta_cents, -500)
  })

  it("Missing when approved here has no Xero draft", () => {
    const { rows } = run({
      approved: [approved({ invoice_key: "media:PENFOLD018:2026-08" })],
      drafts: [],
    })
    assert.equal(rows[0]?.outcome, "Missing")
    assert.equal(rows[0]?.xero_amount_cents, 0)
    assert.equal(rows[0]?.stamps.length, 0)
  })

  it("Extra when a Xero draft has nothing approved here", () => {
    const { rows } = run({
      approved: [],
      drafts: [draft({ xero_invoice_id: "guid-extra" })],
    })
    assert.equal(rows[0]?.outcome, "Extra")
    assert.equal(rows[0]?.approved_amount_cents, 0)
    assert.equal(rows[0]?.stamps.length, 0)
  })
})

describe("draft match — matching order", () => {
  it("a bracketed MBA reference matches the approved MBA grain", () => {
    const { rows } = run({
      approved: [
        approved({
          invoice_key: "media:PENFOLD018:2026-08",
          mba_number: "PENFOLD018",
          approved_amount_cents: 10_000,
        }),
        approved({
          invoice_key: "retainer:1:2026-08",
          mba_number: null,
          approved_amount_cents: 10_000,
        }),
      ],
      drafts: [
        draft({
          xero_invoice_id: "guid-mba",
          reference_raw: "Penfolds - Grange Hero Burst 1 FY2027 (PENFOLD018) | 1011793",
          sub_total_cents: 10_000,
        }),
      ],
    })
    const agrees = rows.filter((r) => r.outcome === "Agrees")
    assert.equal(agrees.length, 1)
    assert.equal(agrees[0]?.approved[0]?.invoice_key, "media:PENFOLD018:2026-08")
    assert.equal(agrees[0]?.stamps[0]?.invoice_key, "media:PENFOLD018:2026-08")
    const leftover = rows.filter((r) => r.outcome === "Missing")
    assert.equal(leftover.length, 1)
    assert.equal(leftover[0]?.approved[0]?.invoice_key, "retainer:1:2026-08")
  })

  it("a retainer with no MBA falls to client + month", () => {
    const { rows } = run({
      approved: [
        approved({
          invoice_key: "retainer:1:2026-08",
          mba_number: null,
          approved_amount_cents: 25_000,
        }),
      ],
      drafts: [
        draft({
          xero_invoice_id: "guid-retainer",
          reference_raw: "Penfolds retainer August",
          sub_total_cents: 25_000,
        }),
      ],
    })
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.outcome, "Agrees")
    assert.equal(rows[0]?.approved[0]?.invoice_key, "retainer:1:2026-08")
  })

  it("two Xero drafts for one client-month is Differs with both listed, not first-wins", () => {
    const { rows } = run({
      approved: [
        approved({
          invoice_key: "retainer:1:2026-08",
          mba_number: null,
          approved_amount_cents: 10_000,
        }),
      ],
      drafts: [
        draft({
          xero_invoice_id: "guid-a",
          invoice_number: "INV-A",
          reference_raw: "Penfolds retainer",
          sub_total_cents: 10_000,
        }),
        draft({
          xero_invoice_id: "guid-b",
          invoice_number: "INV-B",
          reference_raw: "Penfolds retainer copy",
          sub_total_cents: 10_000,
        }),
      ],
    })
    const differs = rows.filter((r) => r.outcome === "Differs")
    assert.equal(differs.length, 1)
    assert.equal(differs[0]?.drafts.length, 2)
    const ids = differs[0]?.drafts.map((d) => d.xero_invoice_id).toSorted()
    assert.deepEqual(ids, ["guid-a", "guid-b"])
    assert.equal(differs[0]?.stamps.length, 0)
  })
})

describe("draft match — ignored statuses", () => {
  it("VOIDED and DELETED drafts are ignored entirely", () => {
    const { rows } = run({
      approved: [approved({ invoice_key: "media:PENFOLD018:2026-08" })],
      drafts: [
        draft({ xero_invoice_id: "voided", status: "VOIDED" }),
        draft({ xero_invoice_id: "deleted", status: "DELETED" }),
      ],
    })
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.outcome, "Missing")
    assert.equal(rows[0]?.drafts.length, 0)
  })

  it("AUTHORISED invoices are not treated as drafts", () => {
    const { rows } = run({
      approved: [],
      drafts: [draft({ xero_invoice_id: "auth", status: "AUTHORISED" })],
    })
    assert.equal(rows.length, 0)
  })
})

describe("draft match — report grouping", () => {
  it("orders exceptions first: Differs, Missing, Extra, then Agrees", () => {
    const { rows } = run({
      approved: [
        approved({
          invoice_key: "media:PENFOLD018:2026-08",
          billing_month: "2026-08",
          approved_amount_cents: 10_000,
        }),
        approved({
          invoice_key: "media:PENFOLD018:2026-07",
          billing_month: "2026-07",
          approved_amount_cents: 5_000,
        }),
      ],
      drafts: [
        draft({
          xero_invoice_id: "guid-diff",
          billing_month: "2026-08",
          sub_total_cents: 9_000,
        }),
        draft({
          xero_invoice_id: "guid-extra",
          clients_id: 2,
          client_name: "Other",
          billing_month: "2026-09",
          reference_raw: "Outside the system",
          sub_total_cents: 1_000,
        }),
        draft({
          xero_invoice_id: "guid-agree",
          billing_month: "2026-06",
          reference_raw: "Penfolds (PENFOLD018)",
          sub_total_cents: 8_000,
        }),
      ],
    })
    // Add an Agrees pair in June
    const withAgree = run({
      approved: [
        ...[
          approved({
            invoice_key: "media:PENFOLD018:2026-08",
            billing_month: "2026-08",
            approved_amount_cents: 10_000,
          }),
          approved({
            invoice_key: "media:PENFOLD018:2026-07",
            billing_month: "2026-07",
            approved_amount_cents: 5_000,
          }),
          approved({
            invoice_key: "media:PENFOLD018:2026-06",
            billing_month: "2026-06",
            approved_amount_cents: 8_000,
          }),
        ],
      ],
      drafts: [
        draft({
          xero_invoice_id: "guid-diff",
          billing_month: "2026-08",
          sub_total_cents: 9_000,
        }),
        draft({
          xero_invoice_id: "guid-extra",
          clients_id: 2,
          client_name: "Other",
          billing_month: "2026-09",
          reference_raw: "Outside the system",
          sub_total_cents: 1_000,
        }),
        draft({
          xero_invoice_id: "guid-agree",
          billing_month: "2026-06",
          reference_raw: "Penfolds (PENFOLD018)",
          sub_total_cents: 8_000,
        }),
      ],
    })
    const grouped = groupDraftMatchRows(withAgree.rows)
    assert.deepEqual(
      Object.keys(grouped),
      ["Differs", "Missing", "Extra", "Agrees"]
    )
    assert.ok(grouped.Differs.length >= 1)
    assert.ok(grouped.Missing.length >= 1)
    assert.ok(grouped.Extra.length >= 1)
    assert.ok(grouped.Agrees.length >= 1)
    void rows
  })
})

describe("draft match — accept does not change the snapshot", () => {
  it("manual stamp payload never includes approved snapshot fields", () => {
    const { rows } = run({
      approved: [
        approved({
          invoice_key: "media:PENFOLD018:2026-08",
          approved_amount_cents: 10_000,
        }),
      ],
      drafts: [draft({ xero_invoice_id: "guid-diff", sub_total_cents: 9_000 })],
    })
    const stamp = rows[0]?.stamps[0]
    assert.ok(stamp)
    assert.equal("approved_amount_cents" in stamp, false)
    assert.equal("approved_lines_hash" in stamp, false)
    assert.equal("approved_at" in stamp, false)
  })
})
