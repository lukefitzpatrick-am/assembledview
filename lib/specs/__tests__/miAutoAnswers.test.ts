import assert from "node:assert/strict"
import test from "node:test"

import {
  buildMockupMiAutoAnswers,
  creativeTypeFromMimes,
  matchFormatAnswerFromPlatform,
  mergeMiAnswers,
  platformPlacementFamily,
} from "../miAutoAnswers"
import type { MiOpenQuestion } from "../resolve"

function formatQuestion(overrides: Partial<MiOpenQuestion> = {}): MiOpenQuestion {
  return {
    id: "format:social-1",
    appliesTo: "format:social-1",
    field: "format",
    type: "choice",
    question: "Which Meta format applies?",
    options: [
      "Feed Video",
      "Feed Static Image",
      "Stories Video",
      "Stories Static Image",
      "TikTok In-Feed Video",
      "none of these",
    ],
    rowRef: { line_item_id: "social-1", displayName: "Meta — Video & Static Ads" },
    ...overrides,
  }
}

test("creativeTypeFromMimes maps mime families", () => {
  assert.equal(creativeTypeFromMimes(["video/mp4"]), "video")
  assert.equal(creativeTypeFromMimes(["image/png"]), "static")
  assert.equal(creativeTypeFromMimes(["video/mp4", "image/jpeg"]), "both")
  assert.equal(creativeTypeFromMimes(["application/pdf"]), null)
})

test("platformPlacementFamily maps mockup tabs", () => {
  assert.equal(platformPlacementFamily("facebook-feed"), "feed")
  assert.equal(platformPlacementFamily("instagram-feed"), "feed")
  assert.equal(platformPlacementFamily("instagram-story"), "stories")
  assert.equal(platformPlacementFamily("tiktok"), "tiktok")
})

test("matchFormatAnswerFromPlatform picks Feed Video for facebook-feed + video", () => {
  const answer = matchFormatAnswerFromPlatform(
    formatQuestion(),
    "facebook-feed",
    "video",
  )
  assert.equal(answer, "Feed Video")
})

test("matchFormatAnswerFromPlatform picks Stories for instagram-story", () => {
  const answer = matchFormatAnswerFromPlatform(
    formatQuestion(),
    "instagram-story",
    "static",
  )
  assert.equal(answer, "Stories Static Image")
})

test("matchFormatAnswerFromPlatform picks TikTok option", () => {
  const answer = matchFormatAnswerFromPlatform(
    formatQuestion(),
    "tiktok",
    "video",
  )
  assert.equal(answer, "TikTok In-Feed Video")
})

test("matchFormatAnswerFromPlatform returns null when family absent", () => {
  const answer = matchFormatAnswerFromPlatform(
    formatQuestion({
      options: ["Carousel", "none of these"],
    }),
    "facebook-feed",
    "video",
  )
  assert.equal(answer, null)
})

test("buildMockupMiAutoAnswers emits creative_type and matched format", () => {
  const creative: MiOpenQuestion = {
    id: "creative_type:social-1",
    appliesTo: "creative_type:social-1",
    field: "creative_type",
    type: "choice",
    question: "Is this video, static or both?",
    options: ["video", "static", "both"],
    rowRef: { line_item_id: "social-1", displayName: "Meta — Video & Static Ads" },
  }
  const answers = buildMockupMiAutoAnswers({
    lineItemId: "social-1",
    mimeTypes: ["video/mp4"],
    platform: "instagram-feed",
    openQuestions: [creative, formatQuestion()],
  })
  assert.deepEqual(answers, [
    { questionId: "creative_type:social-1", answer: "video" },
    { questionId: "format:social-1", answer: "Feed Video" },
  ])
})

test("mergeMiAnswers later entries win", () => {
  assert.deepEqual(
    mergeMiAnswers(
      [{ questionId: "a", answer: "1" }],
      [{ questionId: "a", answer: "2" }, { questionId: "b", answer: "3" }],
    ),
    [
      { questionId: "a", answer: "2" },
      { questionId: "b", answer: "3" },
    ],
  )
})
