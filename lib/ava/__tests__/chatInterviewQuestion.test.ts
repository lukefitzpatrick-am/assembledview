import assert from "node:assert/strict"
import test from "node:test"

import {
  coerceChatInterviewQuestions,
  displayMiAnswerText,
  formatQuestionAnswerMessage,
  formatQuestionAnswerText,
  isChatInterviewQuestion,
  isSkipAnswer,
  lockChatQuestionAnswer,
  parseMiAnswerMessage,
  SKIP_ANSWER,
  toChatInterviewQuestion,
} from "../chatInterviewQuestion.js"

test("toChatInterviewQuestion maps dimensions to text and keeps defaults", () => {
  const question = toChatInterviewQuestion({
    id: "format:search-1",
    text: "Which Google formats apply?",
    type: "multichoice",
    options: ["Responsive Search Ads (RSA)", "Performance Max", "none of these"],
    selected: ["Responsive Search Ads (RSA)", "Performance Max"],
    index: 1,
    total: 3,
  })

  assert.equal(question.kind, "question")
  assert.equal(question.type, "multichoice")
  assert.deepEqual(question.selected, [
    "Responsive Search Ads (RSA)",
    "Performance Max",
  ])
  assert.equal(question.index, 1)
  assert.equal(question.total, 3)
  assert.ok(isChatInterviewQuestion(question))

  const asText = toChatInterviewQuestion({
    id: "dims:1",
    text: "Enter dimensions",
    type: "dimensions",
    index: 2,
    total: 3,
  })
  assert.equal(asText.type, "text")
})

test("coerceChatInterviewQuestions filters invalid entries", () => {
  const question = toChatInterviewQuestion({
    id: "q1",
    text: "Pick one",
    type: "choice",
    options: ["A", "B"],
    selected: ["A"],
    index: 1,
    total: 2,
  })
  assert.deepEqual(coerceChatInterviewQuestions([question, { kind: "nope" }, null]), [
    question,
  ])
  assert.equal(coerceChatInterviewQuestions([]), undefined)
})

test("formatQuestionAnswerText joins multichoice for the agent loop", () => {
  assert.equal(
    formatQuestionAnswerText(
      "multichoice",
      ["Responsive Search Ads (RSA)", "Performance Max"],
      "",
    ),
    "Responsive Search Ads (RSA), Performance Max",
  )
  assert.equal(formatQuestionAnswerText("choice", ["Static"], ""), "Static")
  assert.equal(formatQuestionAnswerText("text", [], "  custom note  "), "custom note")
})

test("formatQuestionAnswerMessage round-trips questionId for the next start_mi_interview call", () => {
  const message = formatQuestionAnswerMessage(
    "format:search-1",
    "multichoice",
    ["Responsive Search Ads (RSA)", "Performance Max"],
    "",
  )
  assert.equal(
    message,
    "[mi:format:search-1] Responsive Search Ads (RSA), Performance Max",
  )
  assert.deepEqual(parseMiAnswerMessage(message), {
    questionId: "format:search-1",
    answer: "Responsive Search Ads (RSA), Performance Max",
  })
  assert.equal(parseMiAnswerMessage("plain answer without tag"), undefined)
})

test("lockChatQuestionAnswer confirms one card and leaves siblings live", () => {
  const a = toChatInterviewQuestion({
    id: "ingest:map:A",
    text: "Map column A",
    type: "choice",
    options: ["format (AVA suggestion)", "Leave unmapped"],
    index: 1,
    total: 2,
  })
  const b = toChatInterviewQuestion({
    id: "ingest:map:B",
    text: "Map column B",
    type: "choice",
    options: ["size (AVA suggestion)", "Leave unmapped"],
    index: 2,
    total: 2,
  })
  const next = lockChatQuestionAnswer([a, b], "ingest:map:A", "[mi:ingest:map:A] format")
  assert.equal(next[0]?.confirmedAnswer, "[mi:ingest:map:A] format")
  assert.equal(next[1]?.confirmedAnswer, undefined)
  assert.equal(next[1]?.id, "ingest:map:B")
  assert.deepEqual(next[1]?.options, b.options)
})

test("Other free text is the answer, not the literal Other", () => {
  assert.equal(formatQuestionAnswerText("choice", ["Other"], "  300x250  "), "300x250")
  assert.equal(
    formatQuestionAnswerMessage("format:1", "choice", ["Other"], "300x250"),
    "[mi:format:1] 300x250",
  )
  assert.deepEqual(parseMiAnswerMessage("[mi:format:1] 300x250"), {
    questionId: "format:1",
    answer: "300x250",
  })
})

test("skip token round-trips and displays as Skipped", () => {
  assert.equal(isSkipAnswer(SKIP_ANSWER), true)
  assert.equal(isSkipAnswer(` ${SKIP_ANSWER} `), true)
  assert.equal(isSkipAnswer(`[mi:format:1] ${SKIP_ANSWER}`), true)
  assert.equal(isSkipAnswer("skip"), false)
  const message = formatQuestionAnswerMessage("ingest:map:A", "choice", [SKIP_ANSWER], "")
  assert.equal(message, `[mi:ingest:map:A] ${SKIP_ANSWER}`)
  assert.deepEqual(parseMiAnswerMessage(message), {
    questionId: "ingest:map:A",
    answer: SKIP_ANSWER,
  })
  assert.equal(displayMiAnswerText(message), "Skipped")
  assert.equal(displayMiAnswerText(SKIP_ANSWER), "Skipped")
})
