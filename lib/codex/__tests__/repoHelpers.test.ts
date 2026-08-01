import assert from "node:assert/strict"
import test from "node:test"

import { isCodexV2Enabled } from "../flag.js"
import {
  clampPerPage,
  parseStatusFilter,
  resolveListAssigneeEmail,
} from "../queryHelpers.js"

test("CODEX_V2 flag is off unless exactly on", () => {
  const prev = process.env.CODEX_V2
  delete process.env.CODEX_V2
  assert.equal(isCodexV2Enabled(), false)
  process.env.CODEX_V2 = "true"
  assert.equal(isCodexV2Enabled(), false)
  process.env.CODEX_V2 = "on"
  assert.equal(isCodexV2Enabled(), true)
  process.env.CODEX_V2 = "ON"
  assert.equal(isCodexV2Enabled(), true)
  if (prev === undefined) delete process.env.CODEX_V2
  else process.env.CODEX_V2 = prev
})

test("parseStatusFilter accepts single + CSV", () => {
  assert.deepEqual(parseStatusFilter(null), undefined)
  assert.deepEqual(parseStatusFilter("todo"), ["todo"])
  assert.deepEqual(parseStatusFilter("todo,done"), ["todo", "done"])
  assert.deepEqual(parseStatusFilter("  todo , waiting "), ["todo", "waiting"])
})

test("clampPerPage caps at 100", () => {
  assert.equal(clampPerPage(undefined), 50)
  assert.equal(clampPerPage(0), 50)
  assert.equal(clampPerPage(25), 25)
  assert.equal(clampPerPage(500), 100)
})

test("mine=1 ignores client-supplied assignee_email", () => {
  assert.equal(
    resolveListAssigneeEmail({
      mine: true,
      sessionEmail: "Admin@Example.com",
      queryAssigneeEmail: "other@evil.com",
    }),
    "admin@example.com"
  )
  assert.equal(
    resolveListAssigneeEmail({
      mine: false,
      sessionEmail: "admin@example.com",
      queryAssigneeEmail: "Other@Evil.com",
    }),
    "other@evil.com"
  )
})
