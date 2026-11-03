/**
 * B20 commit 1 (B23fix review finding 3): `fixed_cost_report_net` says that
 * turning it off also turns the package rule off (`expert_package_quantity`
 * requires it), so saved package quantities become targets again.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { featureDefinition } from "@/lib/features/registry"

test("fixed_cost_report_net text names the package rule it switches off", () => {
  const text = featureDefinition("fixed_cost_report_net")!.description
  assert.match(text, /Turning it off also turns the package rule off/)
  assert.match(text, /saved package quantities become targets again/)
  assert.deepEqual(featureDefinition("expert_package_quantity")!.requires, ["fixed_cost_report_net"])
})
