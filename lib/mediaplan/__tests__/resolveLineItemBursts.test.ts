import assert from "node:assert/strict"
import test from "node:test"

import { resolveLineItemBursts } from "@/lib/mediaplan/deriveBursts"

test("resolveLineItemBursts prefers bursts array over bursts_json", () => {
  const result = resolveLineItemBursts({
    bursts: [{ budget: "100", startDate: "2026-01-01", endDate: "2026-01-07" }],
    bursts_json: JSON.stringify([{ budget: "999" }]),
  })
  assert.equal(result.length, 1)
  assert.equal(result[0].budget, "100")
})

test("resolveLineItemBursts parses bursts_json string", () => {
  const result = resolveLineItemBursts({
    bursts_json: JSON.stringify([{ budget: "200", startDate: "2026-02-01", endDate: "2026-02-07" }]),
  })
  assert.equal(result.length, 1)
  assert.equal(result[0].budget, "200")
})

test("resolveLineItemBursts accepts native bursts_json array", () => {
  const result = resolveLineItemBursts({
    bursts_json: [{ budget: "300", startDate: "2026-03-01", endDate: "2026-03-07" }],
  })
  assert.equal(result.length, 1)
  assert.equal(result[0].budget, "300")
})

test("resolveLineItemBursts falls back to bursts string", () => {
  const result = resolveLineItemBursts({
    bursts: JSON.stringify([{ budget: "400", startDate: "2026-04-01", endDate: "2026-04-07" }]),
  })
  assert.equal(result.length, 1)
  assert.equal(result[0].budget, "400")
})
