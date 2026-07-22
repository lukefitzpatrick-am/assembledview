import assert from "node:assert/strict"
import test from "node:test"
import {
  checkPublishLineItemIntegrity,
  enabledPublishIntegrityChannels,
  isPublishVersionAdvance,
} from "@/lib/mediaplan/publishVersionIntegrity"

test("isPublishVersionAdvance: skipped when version_number absent", () => {
  assert.equal(isPublishVersionAdvance({}), false)
  assert.equal(isPublishVersionAdvance({ campaign_status: "Approved" }), false)
  assert.equal(isPublishVersionAdvance(null), false)
  assert.equal(isPublishVersionAdvance(undefined), false)
})

test("isPublishVersionAdvance: enforced when version_number present", () => {
  assert.equal(isPublishVersionAdvance({ version_number: 17 }), true)
  assert.equal(isPublishVersionAdvance({ version_number: 0 }), true)
})

test("enabledPublishIntegrityChannels: reads mp_* flags only", () => {
  const enabled = enabledPublishIntegrityChannels({
    mp_search: true,
    mp_television: "yes",
    mp_radio: false,
    mp_socialmedia: 0,
  })
  assert.deepEqual(enabled.sort(), ["search", "television"].sort())
})

test("checkPublishLineItemIntegrity: enabled flags + real children → allowed", async () => {
  const result = await checkPublishLineItemIntegrity({
    mbaNumber: "BOSS006",
    targetVersionNumber: 17,
    fetchVersionRow: async () => ({
      id: 1001,
      version_number: 17,
      mp_search: true,
      mp_television: false,
    }),
    countChildrenForChannels: async () => 3,
  })
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.failOpen, undefined)
    assert.equal(result.skipped, undefined)
  }
})

test("checkPublishLineItemIntegrity: enabled flags + zero children → 409", async () => {
  const result = await checkPublishLineItemIntegrity({
    mbaNumber: "BOSS006",
    targetVersionNumber: 17,
    fetchVersionRow: async () => ({
      id: 1001,
      version_number: 17,
      mp_search: true,
    }),
    countChildrenForChannels: async () => 0,
  })
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 409)
    assert.match(result.error, /zero line items/i)
  }
})

test("checkPublishLineItemIntegrity: no enabled flags → skipped allow", async () => {
  const result = await checkPublishLineItemIntegrity({
    mbaNumber: "BOSS006",
    targetVersionNumber: 17,
    fetchVersionRow: async () => ({
      id: 1001,
      version_number: 17,
      mp_search: false,
    }),
    countChildrenForChannels: async () => {
      throw new Error("should not count when no channels enabled")
    },
  })
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.skipped, true)
  }
})

test("checkPublishLineItemIntegrity: child-count throws → fail-open allow + warning", async () => {
  const warnings: Array<{ message: string; meta?: Record<string, unknown> }> = []
  const result = await checkPublishLineItemIntegrity({
    mbaNumber: "BOSS006",
    targetVersionNumber: 17,
    fetchVersionRow: async () => ({
      id: 1001,
      version_number: 17,
      mp_search: true,
    }),
    countChildrenForChannels: async () => {
      throw new Error("xano timeout")
    },
    logWarn: (message, meta) => {
      warnings.push({ message, meta })
    },
  })
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.failOpen, true)
    assert.equal(result.reason, "child_count_error")
  }
  assert.equal(warnings.length, 1)
  assert.match(warnings[0].message, /fail-open allow/i)
  assert.equal(warnings[0].meta?.mbaNumber, "BOSS006")
})

test("checkPublishLineItemIntegrity: version row fetch throws → fail-open allow", async () => {
  const warnings: string[] = []
  const result = await checkPublishLineItemIntegrity({
    mbaNumber: "BOSS006",
    targetVersionNumber: 17,
    fetchVersionRow: async () => {
      throw new Error("network down")
    },
    countChildrenForChannels: async () => 0,
    logWarn: (message) => {
      warnings.push(message)
    },
  })
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.failOpen, true)
  }
  assert.equal(warnings.length, 1)
})
