import assert from "node:assert/strict"
import test from "node:test"
import { siteUrlForClient } from "../siteUrlForClient"

test("siteUrlForClient: mixed case → lowercased cli- path", () => {
  assert.equal(siteUrlForClient("PENFOLD"), "/sites/cli-penfold")
  assert.equal(siteUrlForClient("penfold"), "/sites/cli-penfold")
  assert.equal(siteUrlForClient("PenFold"), "/sites/cli-penfold")
})

test("siteUrlForClient: group rows with same identifier share one URL", () => {
  const a = siteUrlForClient("PENFOLD")
  const b = siteUrlForClient("penfold")
  const c = siteUrlForClient("  PENFOLD  ")
  assert.equal(a, "/sites/cli-penfold")
  assert.equal(b, a)
  assert.equal(c, a)
})

test("siteUrlForClient: empty / whitespace / nullish → null", () => {
  assert.equal(siteUrlForClient(""), null)
  assert.equal(siteUrlForClient("   "), null)
  assert.equal(siteUrlForClient(null), null)
  assert.equal(siteUrlForClient(undefined), null)
})

test("siteUrlForClient: other identifiers stay distinct", () => {
  assert.equal(siteUrlForClient("golf"), "/sites/cli-golf")
  assert.equal(siteUrlForClient("PGAAUS"), "/sites/cli-pgaaus")
  assert.equal(siteUrlForClient("buxton"), "/sites/cli-buxton")
  assert.notEqual(siteUrlForClient("golf"), siteUrlForClient("PGAAUS"))
})
