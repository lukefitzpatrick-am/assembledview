import assert from "node:assert/strict"
import test from "node:test"

import {
  INVALID_NAME_CELL,
  NEEDS_INPUT_CELL,
  emptyRequiredFreeKeysOnly,
} from "../exportTraffickingWorkbook.js"
import { getTemplate } from "../templates.js"
import type { NamingTemplate } from "../types.js"

function mustGet(platform: string, level: string): NamingTemplate {
  const t = getTemplate(platform, level)
  assert.ok(t, `missing template ${platform}/${level}`)
  return t
}

test("NEEDS_INPUT_CELL formats buyer prompt", () => {
  assert.equal(NEEDS_INPUT_CELL(["match_context"]), "← add match_context in AV")
  assert.equal(NEEDS_INPUT_CELL(["token"]), "← add token in AV")
  assert.equal(
    NEEDS_INPUT_CELL(["match_context", "keyword_theme"]),
    "← add match_context, keyword_theme in AV",
  )
})

test("emptyRequiredFreeKeysOnly: Search campaign empty match_context is needs-input", () => {
  const template = mustGet("search", "campaign")
  const keys = emptyRequiredFreeKeysOnly(template, {
    client: "jayco",
    campaign: "jayco001",
    match_context: "",
  })
  assert.deepEqual(keys, ["match_context"])
})

test("emptyRequiredFreeKeysOnly: DV360/YouTube ad empty token is needs-input", () => {
  for (const platform of ["dv360", "youtube"] as const) {
    const template = mustGet(platform, "ad")
    const keys = emptyRequiredFreeKeysOnly(template, {
      io_name: "jayco-jayco001-video",
      token: "",
    })
    assert.deepEqual(keys, ["token"], platform)
  }
})

test("emptyRequiredFreeKeysOnly: genuine validation failure is not needs-input", () => {
  const search = mustGet("search", "campaign")
  assert.equal(
    emptyRequiredFreeKeysOnly(search, {
      client: "jayco",
      campaign: "jayco001",
      match_context: "bad-dash",
    }),
    null,
  )

  const cm360 = mustGet("cm360", "campaign")
  assert.equal(
    emptyRequiredFreeKeysOnly(cm360, {
      brand: "jayco",
      campaign: "jayco001",
      mba: "mba1",
      month_start: "notamonth",
    }),
    null,
  )

  // Missing required plan field is hard failure, not needs-input
  assert.equal(
    emptyRequiredFreeKeysOnly(cm360, {
      brand: "",
      campaign: "jayco001",
      mba: "mba1",
      month_start: "jan26",
    }),
    null,
  )
})

test("INVALID_NAME_CELL remains the hard-failure marker", () => {
  assert.equal(INVALID_NAME_CELL, "INVALID: fix in AV")
})
