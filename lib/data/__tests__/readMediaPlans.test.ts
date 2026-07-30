import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  BURSTS_FIELD_AS_BURSTS,
  CHANNEL_ENDPOINT_TO_CHANNEL,
  LINE_ITEM_COMMON_FIELDS,
  mapLineItemFromPostgres,
  normalizeLineItemForCompare,
  spreadAttrsForChannel,
} from "../planShapes"
import { LINE_CHANNELS } from "@/db/schema"

describe("readMediaPlans assembly", () => {
  it("maps every channel endpoint to a LINE_CHANNELS value", () => {
    const channels = new Set(Object.values(CHANNEL_ENDPOINT_TO_CHANNEL))
    assert.equal(channels.size, LINE_CHANNELS.length)
    for (const ch of LINE_CHANNELS) {
      assert.ok(channels.has(ch), `missing endpoint map for ${ch}`)
    }
  })

  it("uses bursts (not bursts_json) for cinema/radio/production", () => {
    assert.deepEqual([...BURSTS_FIELD_AS_BURSTS].sort(), [
      "cinema",
      "production",
      "radio",
    ])
  })

  it("spreads attrs via zod and keeps passthrough keys", () => {
    const attrs = spreadAttrsForChannel("television", {
      network: "Nine",
      station: "GTV",
      daypart: "Prime",
      placement: "30s",
      creative: "TVC",
      legacy_extra: "keep",
    })
    assert.equal(attrs.network, "Nine")
    assert.equal((attrs as { legacy_extra?: string }).legacy_extra, "keep")
  })

  it("reassembles television row with bursts_json + common fields", () => {
    const row = mapLineItemFromPostgres(
      {
        id: 99,
        createdAt: "2026-01-11T00:00:00.000Z",
        channel: "television",
        lineItemId: "BICAU001TV1",
        position: 1,
        market: "Australia",
        buyingDemo: "18+",
        buyType: "spots",
        publisher: null,
        platform: null,
        bidStrategy: null,
        fixedCostMedia: false,
        clientPaysForMedia: false,
        budgetIncludesFees: false,
        noAdserving: null,
        bursts: [{ budget: "$100", startDate: "2026-01-01" }],
        attrs: {
          network: "Nine",
          station: "Nine",
          daypart: "MAFS",
          placement: "15\"",
          creative: "15\"",
        },
      },
      {
        versionId: 70,
        versionNumber: 1,
        mbaNumber: "BICAU001",
        mpClientName: "BIC",
      }
    )

    assert.equal(row.mba_number, "BICAU001")
    assert.equal(row.mp_client_name, "BIC")
    assert.equal(row.mp_plannumber, "1")
    assert.equal(row.media_plan_version, 70)
    assert.equal(row.line_item_id, "BICAU001TV1")
    assert.equal(row.line_item, 1)
    assert.equal(row.network, "Nine")
    assert.ok(Array.isArray(row.bursts_json))
    assert.equal(row.bursts, undefined)
    for (const f of LINE_ITEM_COMMON_FIELDS) {
      assert.ok(f in row, `missing common field ${f}`)
    }
  })

  it("reassembles production with bursts key", () => {
    const row = mapLineItemFromPostgres(
      {
        id: 1,
        channel: "production",
        lineItemId: "PENFOLD015PR1",
        position: 1,
        market: "Australia",
        buyingDemo: null,
        buyType: null,
        publisher: "Vendor",
        platform: null,
        bidStrategy: null,
        fixedCostMedia: null,
        clientPaysForMedia: true,
        budgetIncludesFees: null,
        noAdserving: null,
        bursts: [{ cost: 100, amount: 1 }],
        attrs: { media_type: "Edit", description: "Cutdown" },
      },
      {
        versionId: 740,
        versionNumber: 8,
        mbaNumber: "PENFOLD015",
        mpClientName: "Penfold",
      }
    )
    assert.ok(Array.isArray(row.bursts))
    assert.equal(row.bursts_json, undefined)
    assert.equal(row.media_type, "Edit")
    assert.equal(row.client_pays_for_media, true)
  })

  it("normalizeLineItemForCompare keys on line_item_id", () => {
    const n = normalizeLineItemForCompare({
      id: 12345,
      created_at: 1,
      line_item_id: "BICAU001TV1",
      network: "Nine",
    })
    assert.equal(n.id, "BICAU001TV1")
    assert.equal(n.created_at, undefined)
    assert.equal(n.network, "Nine")
  })

  it("normalizeLineItemForCompare falls back for synthetic production ids", () => {
    // Xano production often has mp_plannumber only (no media_plan_version / lid).
    const xano = normalizeLineItemForCompare({
      id: 130,
      mba_number: "BICAU001",
      mp_plannumber: "14",
      line_item: 1,
    })
    const pg = normalizeLineItemForCompare({
      id: 99,
      mba_number: "BICAU001",
      mp_plannumber: "14",
      media_plan_version: 677,
      line_item: 1,
      line_item_id: "BICAU001-production-v677-p1",
    })
    assert.equal(xano.id, "bicau001::14::1")
    assert.equal(pg.id, xano.id)
  })
})
