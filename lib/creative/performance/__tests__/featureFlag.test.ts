import assert from "node:assert/strict"
import { test } from "node:test"

import { isCreativePerformanceEnabled } from "@/lib/creative/performance/featureFlag"

test("creative performance is on for every client when the switch is on", () => {
  for (const value of ["on", "1", "true", " TRUE "]) {
    assert.equal(isCreativePerformanceEnabled("golf-australia", { FEATURE_CREATIVE_PERFORMANCE: value } as unknown as NodeJS.ProcessEnv), true)
    assert.equal(isCreativePerformanceEnabled("jayco", { FEATURE_CREATIVE_PERFORMANCE: value } as unknown as NodeJS.ProcessEnv), true)
  }
})

test("the old allowlist no longer limits clients", () => {
  const env = { FEATURE_CREATIVE_PERFORMANCE: "on", FEATURE_CREATIVE_PERFORMANCE_CLIENTS: "golf-australia" } as unknown as NodeJS.ProcessEnv
  assert.equal(isCreativePerformanceEnabled("paul-hartmann-pty-ltd", env), true)
})

test("off or unset is off", () => {
  assert.equal(isCreativePerformanceEnabled("golf-australia", {} as unknown as NodeJS.ProcessEnv), false)
  assert.equal(isCreativePerformanceEnabled("golf-australia", { FEATURE_CREATIVE_PERFORMANCE: "off" } as unknown as NodeJS.ProcessEnv), false)
})
