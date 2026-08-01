import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  coerceNumericStringsToNumbers,
  toApiRow,
} from "../toApiRow"
import { mapPlanMasterFromPostgres } from "../readMediaPlans"
import { matchesMediaPlanSearch } from "@/lib/mediaplans/matchesMediaPlanSearch"

describe("coerceNumericStringsToNumbers — identifier text fields", () => {
  it("keeps mba_number byte-identical including leading zeros", () => {
    const row = coerceNumericStringsToNumbers({
      mba_number: "001001",
      campaign_budget_cents: "150000",
    })
    assert.equal(row.mba_number, "001001")
    assert.equal(typeof row.mba_number, "string")
    assert.equal(row.campaign_budget_cents, 150000)
  })

  it("keeps other identifier-like text fields as strings", () => {
    const row = coerceNumericStringsToNumbers({
      po_number: "00042",
      abn: "51824753556",
      postcode: "2000",
      invoice_number: "00123",
      client_contact: "0400111222",
      mbaidentifier: "001",
      line_item_id: "1001",
    })
    assert.equal(row.po_number, "00042")
    assert.equal(row.abn, "51824753556")
    assert.equal(row.postcode, "2000")
    assert.equal(row.invoice_number, "00123")
    assert.equal(row.client_contact, "0400111222")
    assert.equal(row.mbaidentifier, "001")
    assert.equal(row.line_item_id, "1001")
    for (const key of [
      "po_number",
      "abn",
      "postcode",
      "invoice_number",
      "client_contact",
      "mbaidentifier",
      "line_item_id",
    ]) {
      assert.equal(typeof row[key], "string", `${key} must stay string`)
    }
  })

  it("still coerces genuinely-numeric drizzle numeric strings", () => {
    const row = coerceNumericStringsToNumbers({
      version_number: "3",
      campaign_budget_cents: "99.5",
      fixed_fee: "12.34",
    })
    assert.equal(row.version_number, 3)
    assert.equal(row.campaign_budget_cents, 99.5)
    assert.equal(row.fixed_fee, 12.34)
  })

  it("unions caller keepAsText with identifier defaults", () => {
    const row = coerceNumericStringsToNumbers(
      { mba_number: "001001", custom_id: "007" },
      { keepAsText: new Set(["custom_id"]) }
    )
    assert.equal(row.mba_number, "001001")
    assert.equal(row.custom_id, "007")
  })
})

describe("postgres list path — mba_number identity", () => {
  it("mapPlanMasterFromPostgres preserves leading-zero mba_number as string", () => {
    const mapped = mapPlanMasterFromPostgres(
      {
        id: 1,
        mbaNumber: "001001",
        mpClientName: "Mitchelton Winery",
        campaignName: "Mitchelton Brand",
        campaignStatus: "booked",
        campaignStartDate: "2026-01-01",
        campaignEndDate: "2026-12-31",
        campaignBudgetCents: "500000",
        publishedVersionId: null,
        clientId: 9,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      null,
      1
    )
    assert.equal(mapped.mba_number, "001001")
    assert.equal(typeof mapped.mba_number, "string")
    assert.equal(mapped.mp_campaignbudget, 5000)
  })

  it("search matches leading-zero mba and never throws on numeric mba", () => {
    const listRow = mapPlanMasterFromPostgres(
      {
        id: 1,
        mbaNumber: "001001",
        mpClientName: "Mitchelton Winery",
        campaignName: "Brand",
        campaignStatus: "booked",
        campaignStartDate: "2026-01-01",
        campaignEndDate: "2026-12-31",
        campaignBudgetCents: "100",
        publishedVersionId: null,
        clientId: null,
        createdAt: null,
      },
      null,
      1
    )
    assert.doesNotThrow(() =>
      matchesMediaPlanSearch(
        {
          mp_client_name: String(listRow.mp_client_name ?? ""),
          campaign_name: String(listRow.campaign_name ?? ""),
          mba_number: listRow.mba_number as string,
          brand: null,
        },
        "001001"
      )
    )
    assert.equal(
      matchesMediaPlanSearch(
        {
          mp_client_name: String(listRow.mp_client_name ?? ""),
          campaign_name: String(listRow.campaign_name ?? ""),
          mba_number: listRow.mba_number as string,
          brand: null,
        },
        "001001"
      ),
      true
    )
    // Belt: even if a corrupted numeric mba slipped through, matcher must not throw.
    assert.doesNotThrow(() =>
      matchesMediaPlanSearch(
        { mba_number: 1001 as unknown as string, mp_client_name: "Mitchelton" },
        "mitchelton"
      )
    )
    assert.equal(
      matchesMediaPlanSearch(
        { mba_number: 1001 as unknown as string, mp_client_name: "Mitchelton" },
        "1001"
      ),
      true
    )
  })
})

describe("toApiRow", () => {
  it("snake_cases camelCase keys", () => {
    assert.deepEqual(toApiRow({ mbaNumber: "001001", campaignBudgetCents: 1 }), {
      mba_number: "001001",
      campaign_budget_cents: 1,
    })
  })
})
