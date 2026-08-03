/**
 * MB-11 — Map/Set membership on billing line ids must be canonical
 * (bare ↔ `billing-{media}::bare`), same as billingOverrideLineIdsMatch.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { BillingMonth } from "@/lib/billing/types"
import {
  buildCanonicalBillingLineIdSet,
  canonicalBillingLineIdSetHas,
  collectScheduleLinesById,
  toBillingOverrideLineItemId,
} from "@/lib/finance/manualBillingOverridesUi.js"

const DECORATED = "billing-search::LIVE1"
const BARE = "LIVE1"

describe("MB-11 canonical billing line id Set/Map", () => {
  it("living set built from decorated ids matches bare override ids (and vice versa)", () => {
    const livingFromDecorated = buildCanonicalBillingLineIdSet([DECORATED])
    assert.equal(canonicalBillingLineIdSetHas(livingFromDecorated, BARE), true)
    assert.equal(livingFromDecorated.has(BARE), true, "set stores bare canonical keys")

    const livingFromBare = buildCanonicalBillingLineIdSet([BARE])
    assert.equal(canonicalBillingLineIdSetHas(livingFromBare, DECORATED), true)

    // Bug shape: raw Set of decorated ids + .has(bare) → false drop.
    const rawDecorated = new Set([DECORATED])
    assert.equal(rawDecorated.has(BARE), false, "documents the MB-2 blind spot")
  })

  it("collectScheduleLinesById keys on canonical id so bare lookup finds decorated schedule rows", () => {
    const months: BillingMonth[] = [
      {
        monthYear: "August 2026",
        mediaTotal: "$1,000.00",
        feeTotal: "$0.00",
        adservingTechFees: "$0.00",
        production: "$0.00",
        totalAmount: "$1,000.00",
        mediaCosts: { search: "$1,000.00" } as BillingMonth["mediaCosts"],
        lineItems: {
          search: [
            {
              id: DECORATED,
              header1: "Search",
              header2: "Brand",
              monthlyAmounts: { "August 2026": 1000 },
              totalAmount: 1000,
            },
          ],
        },
      },
    ]

    const map = collectScheduleLinesById(months)
    assert.equal(map.has(BARE), true)
    assert.equal(map.has(DECORATED), false, "map must not key on decorated form")
    assert.equal(map.get(BARE)?.line.id, DECORATED)
    assert.equal(toBillingOverrideLineItemId(DECORATED), BARE)
  })
})
