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
    bidStrategy: "",
    targeting: "Adults 25-54",
    buyingDemo: "",
    station: "",
    rawFields: {
      publisher: "Quantcast",
      format: "300x250",
      targeting: "Adults 25-54",
    },
  })
})

test("flattenPlanLineItems reads creative_targeting, buying_demo, bid_strategy, and bursts_json", () => {
  const [item] = flattenPlanLineItems({
    lineItems: {
      socialMedia: [{
        line_item_id: "social-1",
        platform: "Meta",
        creative: "Feed video",
        creative_targeting: "Adventure/Outdoor interests",
        buying_demo: "PPL 35+",
        bid_strategy: "leads",
        bursts_json: [{
          startDate: "2025-12-31T13:00:00.000Z",
          endDate: "2026-01-30T13:00:00.000Z",
          budget: "$4,200.00",
        }],
      }],
    },
  })

  assert.equal(item.targeting, "Adventure/Outdoor interests")
  assert.equal(item.buyingDemo, "PPL 35+")
  assert.equal(item.bidStrategy, "leads")
  assert.equal(item.liveDate, "2025-12-31T13:00:00.000Z")
  assert.equal(item.endDate, "2026-01-30T13:00:00.000Z")
  assert.equal(item.budget, 4200)
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
  const plan = planFor({ id: "format-1", publisher: "Meta", placement: "Mystery takeover unit" })
  const question = applyAnswers(
    plan,
    [{ questionId: "creative_type:format-1", answer: "static" }],
    library,
  ).open_questions.find((item) => item.field === "format")

  assert.equal(question?.field, "format")
  assert.equal(question?.type, "choice")
  assert.equal(question?.appliesTo, "format:format-1")
  assert.ok(question?.options?.includes("Facebook Feed - Image"))
  assert.ok(question?.options?.includes("none of these"))
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
      "creative_type:format",
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
  // Publisher choice unlocks a follow-up creative_type proposal on the next pass.
  const withPublisherFollowUp = [
    ...answers,
    { questionId: "creative_type:publisher", answer: "video" },
  ]
  const resolved = applyAnswers(plan, withPublisherFollowUp, library)
  const rerun = applyAnswers(plan, withPublisherFollowUp, library)

  assert.equal(resolved.open_questions.length, 0)
  assert.deepEqual(resolved, rerun)
  assert.ok(resolved.resolved.some((item) => item.confidence === "needs_spec"))
  assert.deepEqual(
    resolved.resolved.filter((item) => item.line_item_id === "creative").map((item) => item.variant),
    ["video", "static"],
  )
})

test("progOoh maps to Programmatic, not OOH", () => {
  const result = resolveMiPlan(
    planFor({ id: "pooh-1", publisher: "Quantcast", placement: "300x250" }, "progOoh"),
    library,
  )
  assert.equal(result.resolved[0]?.container_category, "Programmatic")
})

test("fills Social Objective from bid_strategy without asking an objective question", () => {
  const plan = planFor({
    id: "social-obj",
    publisher: "Meta",
    placement: "Feed",
    bid_strategy: "leads",
  })
  const answered = applyAnswers(
    plan,
    [{ questionId: "creative_type:social-obj", answer: "static" }],
    library,
  )

  assert.equal(answered.open_questions.some((q) => q.field === "objective"), false)
  assert.equal(answered.resolved[0]?.fields_am.Objective, "Leads")
  assert.equal(answered.derived?.some((d) =>
    d.field === "Objective" && d.value === "Leads" && d.source === "from plan: bid_strategy"
  ), true)
})

test("fills Search Bid Strategy not Objective from bid_strategy", () => {
  const plan = planFor({
    id: "search-1",
    publisher: "Google Ads",
    creative: "Responsive Search Ads (RSA)",
    bid_strategy: "target_cpa",
  }, "search")
  const result = resolveMiPlan(plan, library)
  const row = result.resolved[0]

  assert.equal(result.open_questions.some((q) => q.field === "objective"), false)
  assert.equal(row?.fields_am["Bid Strategy"], "Target CPA")
  assert.equal(row?.fields_am.Objective, undefined)
})

test("leaves YouTube Objective blank even when bid_strategy is present", () => {
  const plan = planFor({
    id: "yt-1",
    publisher: "YouTube",
    creative: "Skippable In-Stream video",
    bid_strategy: "target_cpa",
    creative_targeting: "Auto-intenders",
    buying_demo: "PPL 25-54",
  }, "digitalVideo")
  const result = resolveMiPlan(plan, library)

  assert.equal(result.resolved[0]?.container_category, "YouTube")
  assert.equal(result.resolved[0]?.fields_am.Objective ?? "", "")
})

test("asks YouTube targeting prefilled from targeting + buyingDemo", () => {
  const question = questionsFor({
    id: "yt-target",
    publisher: "YouTube",
    creative: "Skippable In-Stream video",
    creative_targeting: "Adventure/Outdoor interests",
    buying_demo: "PPL 35+",
  }, "digitalVideo").find((item) => item.field === "targeting")

  assert.equal(question?.type, "text")
  assert.deepEqual(question?.selected, ["PPL 35+ - Adventure/Outdoor interests"])
  assert.match(question?.question ?? "", /targeting/i)
})

test("does not ask targeting for Social or Search", () => {
  assert.equal(
    questionsFor({
      id: "social-t",
      publisher: "Meta",
      placement: "Feed",
      creative_targeting: "Interests",
      buying_demo: "PPL 35+",
    }).some((q) => q.field === "targeting"),
    false,
  )
  assert.equal(
    questionsFor({
      id: "search-t",
      publisher: "Google Ads",
      creative: "Text ads",
      creative_targeting: "Brand Keywords",
      buying_demo: "PPL 35+",
    }, "search").some((q) => q.field === "targeting"),
    false,
  )
})

test("jayco-like Search emits format multichoice with RSA and PMax pre-ticked", () => {
  const question = questionsFor({
    id: "jaycoSE1",
    platform: "Google Ads - AM",
    creative: "Text, Image and Video Assets",
    creative_targeting: "Brand Keywords, Generic Keywords, PMAX",
    bid_strategy: "target_cpa",
  }, "search").find((item) => item.field === "format")

  assert.equal(question?.type, "multichoice")
  assert.ok(question?.selected?.includes("Responsive Search Ads (RSA)"))
  assert.ok(question?.selected?.includes("Performance Max"))
})

test("jayco-like Social emits format multichoice Feed/Stories/Carousel and creative_type both", () => {
  const result = resolveMiPlan(planFor({
    id: "jaycoSM1",
    platform: "Meta",
    creative: "BAU - Carousel, Static, Video (Feed and Stories)",
    creative_targeting: "Adventure/Outdoor interests",
    buying_demo: "PPL 35+",
    bid_strategy: "leads",
  }), library)

  const creativeType = result.open_questions.find((q) => q.field === "creative_type")
  const format = result.open_questions.find((q) => q.field === "format")

  assert.deepEqual(creativeType?.selected, ["both"])
  assert.equal(format?.type, "multichoice")
  assert.ok(format?.selected?.some((name) => /feed/i.test(name)))
  assert.ok(format?.selected?.some((name) => /stories/i.test(name)))
  assert.ok(format?.selected?.some((name) => /carousel/i.test(name)))
  assert.equal(result.open_questions.some((q) => q.field === "objective"), false)
  assert.equal(result.open_questions.some((q) => q.field === "audience"), false)
  assert.equal(result.resolved[0]?.fields_am.Objective, "Leads")
})

test("creative_type records a single-class proposal instead of skipping", () => {
  const question = questionsFor({
    id: "social-video",
    publisher: "Meta",
    creative: "Feed video only",
  }).find((item) => item.field === "creative_type")

  assert.deepEqual(question?.selected, ["video"])
  assert.deepEqual(question?.options, ["video", "static", "both"])
})

test("golden: resolved RSA row populates Search SPECS from the library", () => {
  const plan = planFor({
    id: "rsa-1",
    publisher: "Google Ads",
    creative: "Responsive Search Ads (RSA)",
    bid_strategy: "target_cpa",
  }, "search")
  const row = resolveMiPlan(plan, library).resolved[0]

  assert.equal(row?.confidence, "high")
  assert.equal(row?.format_name, "Responsive Search Ads (RSA)")
  assert.equal(row?.fields_specs["Headline Limits"], "Min 1, max 15. 30 characters each.")
  assert.equal(row?.fields_specs["Description Limits"], "Min 1, max 4. 90 characters each.")
  assert.match(row?.fields_specs["Display Path Limits"] ?? "", /15 characters/)
  assert.equal(
    row?.fields_specs["Best Practice Notes"],
    "Pin Headline 1 if including legal disclaimers; Use all 15 headline slots for max ad strength; Use all 4 description slots",
  )
  assert.match(row?.fields_specs.Source ?? "", /support\.google\.com\/google-ads/)
  assert.equal(row?.fields_specs["Best Practice Notes"]?.includes("NEEDS_SPEC"), false)
  assert.equal(row?.fields_am.Source, undefined)
  assert.equal(row?.fields_am["File Type"], undefined)
  assert.match(row?.fields_am["Line Item"] ?? row?.displayName ?? "", /Responsive Search Ads \(RSA\)/)
})

test("golden: resolved Meta Facebook Feed Video populates Social SPECS", () => {
  const plan = planFor({
    id: "meta-video",
    publisher: "Meta",
    placement: "Facebook Feed - Video",
  })
  const answered = applyAnswers(
    plan,
    [{ questionId: "creative_type:meta-video", answer: "video" }],
    library,
  )
  const row = answered.resolved[0]

  assert.equal(answered.open_questions.length, 0)
  assert.equal(row?.format_name, "Facebook Feed - Video")
  assert.equal(row?.fields_specs["File Type"], "MP4 or MOV")
  assert.match(row?.fields_specs["Ratio / Dimensions"] ?? "", /1:1/)
  assert.equal(row?.fields_specs["Max File Size"], "4GB")
  assert.match(row?.fields_specs.Duration ?? "", /5-15 seconds/)
  assert.match(row?.fields_specs["Character Limits"] ?? "", /primary_text: 125 characters/)
  assert.equal(row?.fields_specs["Best Practice Notes"]?.includes("NEEDS_SPEC") ?? false, false)
  assert.equal(row?.fields_am.Source, undefined)
})

test("unmatched format answer re-opens the format question", () => {
  const plan = planFor({
    id: "format-reask",
    publisher: "Meta",
    placement: "Mystery takeover unit",
  })
  const result = applyAnswers(
    plan,
    [
      { questionId: "creative_type:format-reask", answer: "static" },
      { questionId: "format:format-reask", answer: "all" },
    ],
    library,
  )
  const formatQuestion = result.open_questions.find((item) => item.field === "format")

  assert.ok(formatQuestion, "format question must re-open for unmatched answers")
  assert.equal(formatQuestion?.appliesTo, "format:format-reask")
  assert.equal(result.resolved.some((row) =>
    row.line_item_id === "format-reask" && row.confidence === "needs_spec" && !formatQuestion
  ), false)
})

test("unrecognised creative_type free text re-opens the question", () => {
  const plan = planFor({
    id: "creative-reask",
    publisher: "Meta",
    placement: "Feed",
  })
  const result = applyAnswers(
    plan,
    [{ questionId: "creative_type:creative-reask", answer: "all" }],
    library,
  )
  const creative = result.open_questions.find((item) => item.field === "creative_type")

  assert.ok(creative)
  assert.equal(creative?.appliesTo, "creative_type:creative-reask")
  assert.equal(result.resolved.length, 0)
})

test("Search multi-format rows append format name to Line Item", () => {
  const plan = planFor({
    id: "search-multi",
    platform: "Google Ads - AM",
    creative: "Text, Image and Video Assets",
    creative_targeting: "Brand Keywords, Generic Keywords, PMAX",
    bid_strategy: "target_cpa",
  }, "search")
  const answered = applyAnswers(
    plan,
    [{
      questionId: "format:search-multi",
      answer: "Responsive Search Ads (RSA), Performance Max",
    }],
    library,
  )

  const labels = answered.resolved.map((row) => row.fields_am["Line Item"] ?? row.displayName)
  assert.ok(labels.some((label) => /Performance Max/.test(label)))
  assert.ok(labels.some((label) => /Responsive Search Ads \(RSA\)/.test(label)))
})
