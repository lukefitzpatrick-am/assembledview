import assert from "node:assert/strict"
import test from "node:test"

import {
  buildSearchMiAutoAnswers,
  matchSearchFormatOption,
} from "../searchMiAutoAnswers"
import type { MiOpenQuestion } from "../resolve"

function searchFormatQuestion(
  overrides: Partial<MiOpenQuestion> = {},
): MiOpenQuestion {
  return {
    id: "format:search-1",
    appliesTo: "format:search-1",
    field: "format",
    type: "choice",
    question: "Which Google Ads format applies to this row?",
    options: [
      "Responsive Search Ads (RSA)",
      "Performance Max",
      "Responsive Display Ads",
      "none of these",
    ],
    rowRef: { line_item_id: "search-1", displayName: "Google — Brand Exact" },
    ...overrides,
  }
}

test("matchSearchFormatOption picks RSA option", () => {
  assert.equal(
    matchSearchFormatOption(searchFormatQuestion(), "rsa"),
    "Responsive Search Ads (RSA)",
  )
})

test("matchSearchFormatOption picks Performance Max option", () => {
  assert.equal(
    matchSearchFormatOption(searchFormatQuestion(), "pmax"),
    "Performance Max",
  )
})

test("matchSearchFormatOption returns null when option absent", () => {
  assert.equal(
    matchSearchFormatOption(
      searchFormatQuestion({ options: ["Responsive Display Ads", "none of these"] }),
      "rsa",
    ),
    null,
  )
})

test("buildSearchMiAutoAnswers picks RSA and Performance Max options", () => {
  const rsa = buildSearchMiAutoAnswers({
    lineItemId: "search-1",
    format: "rsa",
    openQuestions: [searchFormatQuestion()],
  })
  const pmax = buildSearchMiAutoAnswers({
    lineItemId: "search-1",
    format: "pmax",
    openQuestions: [searchFormatQuestion()],
  })
  assert.deepEqual(rsa, [
    { questionId: "format:search-1", answer: "Responsive Search Ads (RSA)" },
  ])
  assert.deepEqual(pmax, [
    { questionId: "format:search-1", answer: "Performance Max" },
  ])
})

test("buildSearchMiAutoAnswers emits nothing when format option is absent", () => {
  const answers = buildSearchMiAutoAnswers({
    lineItemId: "search-1",
    format: "rsa",
    openQuestions: [
      searchFormatQuestion({
        options: ["Responsive Display Ads", "none of these"],
      }),
    ],
  })
  assert.deepEqual(answers, [])
})

test("buildSearchMiAutoAnswers never invents a questionId", () => {
  const openQuestions = [searchFormatQuestion({ id: "format:search-1" })]
  const knownIds = new Set(openQuestions.map((question) => question.id))
  const answers = buildSearchMiAutoAnswers({
    lineItemId: "search-1",
    format: "pmax",
    openQuestions,
  })
  assert.ok(answers.length > 0)
  for (const answer of answers) {
    assert.ok(knownIds.has(answer.questionId), `unexpected questionId ${answer.questionId}`)
  }
})

test("buildSearchMiAutoAnswers ignores other line items and fields", () => {
  const answers = buildSearchMiAutoAnswers({
    lineItemId: "search-1",
    format: "pmax",
    openQuestions: [
      searchFormatQuestion({
        id: "format:other",
        rowRef: { line_item_id: "other", displayName: "Other" },
      }),
      searchFormatQuestion({
        id: "publisher:search-1",
        field: "publisher",
        options: ["google-ads"],
      }),
    ],
  })
  assert.deepEqual(answers, [])
})
