import assert from "node:assert/strict"
import test from "node:test"

import { withInjectedComboboxValue } from "@/lib/mediaplan/comboboxCurrentValue"

test("withInjectedComboboxValue: empty options + saved value injects current", () => {
  const result = withInjectedComboboxValue([], "Meta Ads")
  assert.deepEqual(result, [{ value: "Meta Ads", label: "Meta Ads" }])
})

test("withInjectedComboboxValue: already-present value is not duplicated", () => {
  const options = [{ value: "Meta Ads", label: "Meta Ads" }]
  const result = withInjectedComboboxValue(options, "Meta Ads")
  assert.equal(result.length, 1)
  assert.equal(result[0].value, "Meta Ads")
})

test("withInjectedComboboxValue: blank current leaves options unchanged", () => {
  const options = [{ value: "a", label: "A" }]
  assert.deepEqual(withInjectedComboboxValue(options, ""), options)
  assert.deepEqual(withInjectedComboboxValue(options, "   "), options)
  assert.deepEqual(withInjectedComboboxValue(options, null), options)
})

test("withInjectedComboboxValue: injects ahead of loaded list when missing", () => {
  const options = [
    { value: "TikTok", label: "TikTok" },
    { value: "Snapchat", label: "Snapchat" },
  ]
  const result = withInjectedComboboxValue(options, "Legacy Platform")
  assert.equal(result[0].value, "Legacy Platform")
  assert.equal(result.length, 3)
})
