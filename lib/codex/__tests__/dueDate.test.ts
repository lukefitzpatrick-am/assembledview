import assert from "node:assert/strict"
import { test } from "node:test"

import {
  formatDueYmd,
  isOverdueYmd,
  sydneyTodayYmd,
  toSydneyCivilYmd,
} from "../dueDate.js"

/** 12:00 on 14 Aug 2026 in Sydney (AEST, UTC+10). */
const NOW = new Date("2026-08-14T02:00:00.000Z")

test("toSydneyCivilYmd keeps a bare civil date", () => {
  assert.equal(toSydneyCivilYmd("2026-08-14"), "2026-08-14")
})

test("toSydneyCivilYmd maps postgres midnight UTC text onto the same Sydney day", () => {
  assert.equal(toSydneyCivilYmd("2026-08-14 00:00:00+00"), "2026-08-14")
  assert.equal(toSydneyCivilYmd("2026-08-14 00:00:00.000+00"), "2026-08-14")
})

test("toSydneyCivilYmd rolls an evening UTC instant into the next Sydney civil day", () => {
  assert.equal(toSydneyCivilYmd("2026-08-14T14:30:00.000Z"), "2026-08-15")
  assert.equal(toSydneyCivilYmd("2026-01-14T13:30:00Z"), "2026-01-15")
})

test("toSydneyCivilYmd rejects null and rubbish", () => {
  assert.equal(toSydneyCivilYmd(null), null)
  assert.equal(toSydneyCivilYmd(undefined), null)
  assert.equal(toSydneyCivilYmd("rubbish"), null)
})

test("isOverdueYmd uses the Sydney civil day: yesterday open, yesterday done, today", () => {
  assert.equal(sydneyTodayYmd(NOW), "2026-08-14")
  assert.equal(isOverdueYmd("2026-08-13", "todo", NOW), true)
  assert.equal(isOverdueYmd("2026-08-13", "done", NOW), false)
  assert.equal(isOverdueYmd("2026-08-14", "todo", NOW), false)
})

test("formatDueYmd uses the en-AU civil style", () => {
  assert.equal(formatDueYmd("2026-08-14"), "14 Aug 2026")
  assert.equal(formatDueYmd(null), "—")
})
