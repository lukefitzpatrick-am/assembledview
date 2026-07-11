import assert from "node:assert/strict"
import test from "node:test"
import { loadMiLibrary } from "../library.js"
import {
  applyAnswers,
  flattenPlanLineItems,
  resolveMiPlan,
  type MiPlanInput,
} from "../resolve.js"

const library = loadMiLibrary()

function planFor(item: Record<string, unknown>, channelKey = "socialMedia"): MiPlanInput {
  return { lineItems: { [channelKey]: [item] } }
}

function questionsFor(
  item: Record<string, unknown>,
  channelKey?: string,
) {
  return resolveMiPlan(planFor(item, channelKey), library).open_questions
}

test("flattenPlanLineItems maps AV item fields and burst dates", () => {
  const [item] = flattenPlanLineItems({
    lineItems: {
      digitalDisplay: [{
        lineItemId: "display-1",
        platform: "Quantcast",
        creative: "300x250",
        creativeTargeting: "Adults 25-54",
        bursts: [{ startDate: "2026-09-01" }],
      }],
    },
  })

  assert.deepEqual(item, {
    line_item_id: "display-1",
    displayName: "Quantcast — 300x250",
    channelKey: "digitalDisplay",
    publisher: "Quantcast",
    format: "300x250",
    placement: "",
    market: "",
    liveDate: "2026-09-01",
    endDate: "",
    buyType: "",
    targeting: "Adults 25-54",
    station: "",
    rawFields: {
      publisher: "Quantcast",
      format: "300x250",
      targeting: "Adults 25-54",
    },
  })
})

test("asks for social creative type and expands both after answer", () => {
  const plan = planFor({ id: "social-1", publisher: "Meta", placement: "Feed" })
  const result = resolveMiPlan(plan, library)
  const question = result.open_questions.find((item) => item.field === "creative_type")

  assert.deepEqual(question?.options, ["video", "static", "both"])
  assert.equal(question?.appliesTo, "creative_type:social-1")

  const answered = applyAnswers(plan, [{ questionId: question!.id, answer: "both" }], library)
  assert.equal(answered.open_questions.length, 0)
  assert.deepEqual(answered.resolved.map((item) => item.variant), ["video", "static"])
})

test("asks for a matching publisher's format when no format resolves", () => {
  const [question] = questionsFor(
    { id: "format-1", publisher: "Meta", placement: "Mystery video takeover" },
  )

  assert.equal(question.field, "format")
  assert.equal(question.type, "choice")
  assert.equal(question.appliesTo, "format:format-1")
  assert.ok(question.options?.includes("Facebook Feed - Image"))
  assert.ok(question.options?.includes("none of these"))
})

test("asks for a publisher choice when aliases cannot resolve it", () => {
  const [question] = questionsFor(
    { id: "publisher-1", publisher: "Metha", placement: "Feed video" },
  )

  assert.equal(question.field, "publisher")
  assert.equal(question.type, "choice")
  assert.equal(question.appliesTo, "publisher:publisher-1")
  assert.ok(question.options?.includes("meta"))
  assert.ok(question.options?.includes("not in library"))
})

test("keeps non-display direct digital formats out of display fallback", () => {
  const plan = planFor(
    { id: "custom-1", publisher: "Quantcast", placement: "Sponsored podcast" },
    "digitalAudio",
  )
  const [question] = resolveMiPlan(plan, library).open_questions

  assert.equal(question.field, "custom_specs")
  assert.equal(question.type, "text")
  assert.match(question.question, /Custom format/)

  const answered = applyAnswers(
    plan,
    [{ questionId: question.id, answer: "per booking" }],
    library,
  )
  assert.equal(answered.open_questions.length, 0)
  assert.equal(answered.resolved[0].confidence, "needs_spec")
  assert.equal(answered.resolved[0].format_name, "NEEDS_SPEC")
})

test("asks to confirm mixed format variants", () => {
  const questions = questionsFor(
    { id: "mixed-1", publisher: "Quantcast", placement: "300x250, 728x90" },
    "digitalDisplay",
  )
  const question = questions.find((item) => item.field === "variants")

  assert.equal(question?.type, "choice")
  assert.equal(question?.appliesTo, "variants:mixed-1")
  assert.ok(question?.options?.includes("300x250, 728x90"))
})

test("flags non-IAB dimensions without blocking a resolved spec", () => {
  const result = resolveMiPlan(
    planFor({ id: "custom-size", publisher: "Quantcast", placement: "301x251" }, "digitalDisplay"),
    library,
  )

  assert.equal(result.open_questions[0].field, "dimensions")
  assert.deepEqual(result.open_questions[0].options, ["plan typo", "genuine custom size"])
  assert.equal(result.resolved.length, 1)
  assert.equal(result.resolved[0].confidence, "fallback")
})

test("asks whether placeholder rows should be included", () => {
  const [question] = questionsFor({
    id: "placeholder-1",
    publisher: "test",
    placement: "test",
    creativeTargeting: "test",
  })

  assert.equal(question.field, "placeholder")
  assert.deepEqual(question.options, ["include", "skip"])
  assert.equal(question.appliesTo, "placeholder:placeholder-1")
})

test("golden: questions use template and field order then answers re-resolve idempotently", () => {
  const plan: MiPlanInput = {
    lineItems: {
      digitalDisplay: [
        { id: "dimensions", publisher: "Quantcast", placement: "301x251" },
        { id: "mixed", publisher: "Quantcast", placement: "300x250, 728x90" },
        { id: "custom", publisher: "Quantcast", placement: "Sponsored podcast" },
      ],
      socialMedia: [
        { id: "creative", publisher: "Meta", placement: "Feed" },
        { id: "format", publisher: "Meta", placement: "Unknown video placement" },
        { id: "publisher", publisher: "Metha", placement: "Feed video" },
        { id: "placeholder", publisher: "test", placement: "test", creativeTargeting: "test" },
      ],
    },
  }
  const initial = resolveMiPlan(plan, library)

  assert.deepEqual(
    initial.open_questions.map((question) => question.appliesTo),
    [
      "creative_type:creative",
      "format:format",
      "publisher:publisher",
      "placeholder:placeholder",
      "dimensions:dimensions",
      "variants:mixed",
      "custom_specs:custom",
    ],
  )

  const answers = initial.open_questions.map((question) => ({
    questionId: question.id,
    answer: question.field === "creative_type"
      ? "both"
      : question.field === "format"
        ? "Facebook Feed - Image"
        : question.field === "publisher"
          ? "meta"
          : question.field === "placeholder"
            ? "skip"
            : question.field === "custom_specs"
              ? "per booking"
              : question.options![0],
  }))
  const resolved = applyAnswers(plan, answers, library)
  const rerun = applyAnswers(plan, answers, library)

  assert.equal(resolved.open_questions.length, 0)
  assert.deepEqual(resolved, rerun)
  assert.ok(resolved.resolved.some((item) => item.confidence === "needs_spec"))
  assert.deepEqual(
    resolved.resolved.filter((item) => item.line_item_id === "creative").map((item) => item.variant),
    ["video", "static"],
  )
})
