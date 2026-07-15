import assert from "node:assert/strict"
import test from "node:test"
import { mapperResultToFormItems } from "../toFormLineItems.js"
import type { MapperResult } from "../types.js"

test("mapperResultToFormItems: radio copies bursts and fields", () => {
  const mapped: MapperResult = {
    plan_meta: { client: "Acme" },
    line_items: [
      {
        channel: "radio",
        confidence: 0.9,
        fields: {
          network: "SCA",
          station: "2DAY",
          market: "Sydney",
          buy_type: "CPP",
        },
        bursts: [
          {
            startDate: "2026-03-02",
            endDate: "2026-03-08",
            budget: "360",
          },
        ],
      },
    ],
    needs_review: [],
    warnings: [],
  }
  const items = mapperResultToFormItems(mapped, "radio")
  assert.equal(items.length, 1)
  assert.equal(items[0].network, "SCA")
  assert.equal(items[0].station, "2DAY")
  assert.ok(Array.isArray(items[0].bursts))
  assert.equal((items[0].bursts as any[])[0].budget, "360")
  assert.ok(Array.isArray(items[0].bursts_json))
})

test("mapperResultToFormItems: ooh uses bursts_json-ready bursts", () => {
  const mapped: MapperResult = {
    plan_meta: {},
    line_items: [
      {
        channel: "ooh",
        confidence: 0.85,
        fields: { network: "QMS", market: "Melbourne", format: "Portrait" },
        bursts: [
          { startDate: "2026-04-01", endDate: "2026-04-28", budget: "12000" },
        ],
      },
    ],
    needs_review: [],
    warnings: [],
  }
  const items = mapperResultToFormItems(mapped, "ooh")
  assert.equal(items[0].network, "QMS")
  assert.equal(items[0].format, "Portrait")
  assert.ok(Array.isArray(items[0].bursts_json))
})
