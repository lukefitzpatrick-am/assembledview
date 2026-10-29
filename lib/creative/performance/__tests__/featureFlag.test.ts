import assert from "node:assert/strict"
import { test } from "node:test"

import { isCreativePerformanceEnabled } from "@/lib/creative/performance/featureFlag"

test("creative performance is on for every client when the switch is on", async () => {
  for (const value of ["on", "1", "true", " TRUE "]) {
    assert.equal(await isCreativePerformanceEnabled("golf-australia", { FEATURE_CREATIVE_PERFORMANCE: value } as unknown as NodeJS.ProcessEnv), true)
    assert.equal(await isCreativePerformanceEnabled("jayco", { FEATURE_CREATIVE_PERFORMANCE: value } as unknown as NodeJS.ProcessEnv), true)
  }
})

test("the old allowlist no longer limits clients", async () => {
  const env = { FEATURE_CREATIVE_PERFORMANCE: "on", FEATURE_CREATIVE_PERFORMANCE_CLIENTS: "golf-australia" } as unknown as NodeJS.ProcessEnv
  assert.equal(await isCreativePerformanceEnabled("paul-hartmann-pty-ltd", env), true)
})

test("off or unset is off", async () => {
  assert.equal(await isCreativePerformanceEnabled("golf-australia", {} as unknown as NodeJS.ProcessEnv), false)
  assert.equal(await isCreativePerformanceEnabled("golf-australia", { FEATURE_CREATIVE_PERFORMANCE: "off" } as unknown as NodeJS.ProcessEnv), false)
})
