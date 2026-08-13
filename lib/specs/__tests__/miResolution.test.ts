import assert from "node:assert/strict"
import test from "node:test"

import {
  mergeMiResolution,
  parseMiResolution,
} from "../miResolution.js"

test("parseMiResolution returns null for empty or junk jsonb", () => {
  assert.equal(parseMiResolution(null), null)
  assert.equal(parseMiResolution(undefined), null)
  assert.equal(parseMiResolution({}), null)
  assert.equal(parseMiResolution({ answers: "nope" }), null)
})

test("parseMiResolution reads answers array", () => {
  const parsed = parseMiResolution({
    answers: [{ questionId: "publisher:li-1", answer: "meta" }],
    updatedAt: "2026-08-13T10:00:00.000Z",
    updatedBy: "luke",
  })
  assert.deepEqual(parsed, {
    answers: [{ questionId: "publisher:li-1", answer: "meta" }],
    updatedAt: "2026-08-13T10:00:00.000Z",
    updatedBy: "luke",
  })
})

test("mergeMiResolution appends new answers and overwrites same questionId", () => {
  const merged = mergeMiResolution(
    {
      answers: [{ questionId: "publisher:li-1", answer: "meta" }],
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
    [
      { questionId: "publisher:li-1", answer: "tiktok" },
      { questionId: "format:li-1", answer: "Feed" },
    ],
    "ava",
    "2026-08-13T12:00:00.000Z",
  )
  assert.deepEqual(merged.answers, [
    { questionId: "publisher:li-1", answer: "tiktok" },
    { questionId: "format:li-1", answer: "Feed" },
  ])
  assert.equal(merged.updatedBy, "ava")
  assert.equal(merged.updatedAt, "2026-08-13T12:00:00.000Z")
})
