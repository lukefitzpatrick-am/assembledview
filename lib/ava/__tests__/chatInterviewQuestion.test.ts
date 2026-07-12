import assert from "node:assert/strict"
import test from "node:test"

import {
  coerceChatInterviewQuestions,
  formatQuestionAnswerMessage,
  formatQuestionAnswerText,
  isChatInterviewQuestion,
  parseMiAnswerMessage,
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
