import assert from "node:assert/strict"
import test from "node:test"

import { resolveMiHttpVersionScope } from "../miHttpVersionScope.js"

test("refuses silent MBA-wide when versionNumber is missing", () => {
  const result = resolveMiHttpVersionScope({})
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.error, "version_required")
  assert.match(result.message, /versionNumber/i)
  assert.match(result.message, /MBA-wide/i)
})

test("refuses null/NaN versionNumber as silent MBA-wide", () => {
  assert.equal(resolveMiHttpVersionScope({ versionNumber: null }).ok, false)
  assert.equal(resolveMiHttpVersionScope({ versionNumber: Number.NaN }).ok, false)
  assert.equal(resolveMiHttpVersionScope({ versionNumber: 0 }).ok, false)
})

test("accepts a positive versionNumber", () => {
  const result = resolveMiHttpVersionScope({ versionNumber: 7 })
  assert.deepEqual(result, { ok: true, versionNumber: 7, mbaWide: false })
})

test("accepts explicit mbaWide only", () => {
  const result = resolveMiHttpVersionScope({ mbaWide: true })
  assert.deepEqual(result, { ok: true, versionNumber: undefined, mbaWide: true })
})

test("versionNumber wins over mbaWide when both are sent", () => {
  const result = resolveMiHttpVersionScope({ versionNumber: 3, mbaWide: true })
  assert.deepEqual(result, { ok: true, versionNumber: 3, mbaWide: false })
})
