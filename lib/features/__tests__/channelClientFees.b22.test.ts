/**
 * B22 switch channel_client_fees (decision B22 Q5): planning, admin, default
 * off, sent to the browser (the client form and the editors read it there).
 */
import assert from "node:assert/strict"
import test from "node:test"

import { clientFeatureOn, setClientFeatureSnapshot } from "@/lib/features/client"
import { CLIENT_FEATURE_KEYS, featureDefinition, resolveFeature } from "@/lib/features/registry"

test("switch: planning, admin, default off, browser visible, no env var", () => {
  const d = featureDefinition("channel_client_fees")
  assert.ok(d)
  assert.equal(d!.defaultOn, false)
  assert.equal(d!.area, "planning")
  assert.equal(d!.toggleRole, "admin")
  assert.equal(d!.clientVisible, true)
  assert.equal(d!.source, "switch")
  assert.equal(d!.envName, undefined)
  assert.equal(d!.requires, undefined)
  assert.ok(CLIENT_FEATURE_KEYS.includes("channel_client_fees"))
  assert.deepEqual(resolveFeature(d!, null, {}), { enabled: false, source: "default" })
})

test("the description says what off does", () => {
  const d = featureDefinition("channel_client_fees")!
  assert.match(d.description, /Off: the form hides the 12 fields and the editor ignores them/)
  assert.match(d.description, /Influencers keeps the Content Creator rate/)
  assert.doesNotMatch(d.description, /—/)
})

test("browser read: off with no snapshot, follows the snapshot", () => {
  try {
    setClientFeatureSnapshot(null)
    assert.equal(clientFeatureOn("channel_client_fees"), false)
    setClientFeatureSnapshot({ channel_client_fees: true })
    assert.equal(clientFeatureOn("channel_client_fees"), true)
    setClientFeatureSnapshot({ channel_client_fees: false })
    assert.equal(clientFeatureOn("channel_client_fees"), false)
  } finally {
    setClientFeatureSnapshot(null)
  }
})
