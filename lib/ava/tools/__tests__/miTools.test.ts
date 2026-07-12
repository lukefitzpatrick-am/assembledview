import assert from "node:assert/strict"
import test from "node:test"

import {
  coerceChatFileAttachments,
  isChatFileAttachment,
  toChatFileAttachment,
} from "../../chatFileAttachment.js"
import {
  getPlatformSpecsPayload,
} from "../getPlatformSpecs.js"
import {
  buildMiInterviewPayload,
  buildMiInterviewQuestionCards,
  startMiInterviewTool,
} from "../startMiInterview.js"
import { generateMiWorkbookTool } from "../generateMiWorkbook.js"
import {
  MI_SCOPE_VERSION_QUESTION_ID,
  resolveMiVersionScope,
} from "../helpers.js"
import type { AvaToolContext } from "../types.js"

function baseContext(overrides: Partial<AvaToolContext> = {}): AvaToolContext {
  return {
    pageContext: undefined,
    clientSlug: undefined,
    mbaNumber: "MBA123",
    versionNumber: undefined,
    enabledMediaTypes: undefined,
    userSub: "user-1",
    userEmail: "user@example.com",
    roles: [],
    clientSlugs: [],
    mbaNumbers: [],
    capturedPatch: null,
    capturedAttachments: null,
    capturedQuestions: null,
    ...overrides,
  }
}

test("get_platform_specs returns compact Meta format rows", () => {
  const payload = getPlatformSpecsPayload({ publisher: "Meta" })

  assert.equal(payload.publisher, "meta")
  assert.ok(payload.count > 0)
  assert.ok(payload.rows.length <= 20)
  assert.equal(typeof payload.rows[0]?.format_name, "string")
  assert.ok("last_refreshed" in (payload.rows[0] ?? {}))
  assert.ok("source" in (payload.rows[0] ?? {}))
})

test("start_mi_interview returns only the current question plus counts", () => {
  const payload = buildMiInterviewPayload({
    lineItems: {
      socialMedia: [
        {
          line_item_id: "social-1",
          publisher: "Meta",
          placement: "Facebook",
        },
      ],
    },
  })

  assert.equal(payload.resolvedCount, 0)
  assert.equal(payload.openCount, 1)
  assert.equal(payload.currentQuestion?.field, "creative_type")
  assert.equal(payload.currentQuestion?.line_item_id, "social-1")
  assert.equal(payload.currentQuestion?.displayName, "Meta — Facebook")
  assert.equal(payload.questionIndex, 1)
  assert.equal(payload.questionTotal, 1)
  assert.equal(payload.derivedCount, 0)
  assert.equal(payload.derived, undefined)
  assert.equal("questions" in payload, false)
  assert.equal(
    buildMiInterviewPayload(
      {
        lineItems: {
          socialMedia: [
            {
              line_item_id: "social-1",
              publisher: "Meta",
              placement: "Facebook",
            },
          ],
        },
      },
      [{ questionId: "creative_type:social-1", answer: "static" }],
    ).openCount,
    0,
  )
})

test("mid-interview hides derived details and never surfaces bid_strategy as a question", () => {
  const plan = {
    lineItems: {
      socialMedia: [
        {
          line_item_id: "social-1",
          publisher: "Meta",
          placement: "Facebook",
          bid_strategy: "leads",
        },
        {
          line_item_id: "social-2",
          publisher: "Meta",
          placement: "Instagram",
          bid_strategy: "leads",
        },
      ],
    },
  }

  // Resolve row 1 so derived fills exist while row 2 still needs a question.
  const payload = buildMiInterviewPayload(plan, [
    { questionId: "creative_type:social-1", answer: "static" },
  ])
  assert.ok(payload.openCount >= 1)
  assert.ok(payload.derivedCount >= 1, "resolver applied bid_strategy fills on resolved rows")
  assert.equal(payload.derived, undefined, "full derived withheld while questions remain")
  assert.ok(payload.currentQuestion)
  assert.notEqual(payload.currentQuestion?.field, "objective")
  assert.doesNotMatch(
    payload.currentQuestion?.question ?? "",
    /Awareness|Consideration|Conversions\s*\/\s*Leads|campaign objective/i,
  )

  const cards = buildMiInterviewQuestionCards(plan, [
    { questionId: "creative_type:social-1", answer: "static" },
  ])
  assert.equal(cards?.length, 1)
  assert.equal(cards![0].id, payload.currentQuestion!.id)
  assert.equal(cards![0].index, payload.questionIndex)
  assert.equal(cards![0].total, payload.questionTotal)
})
test("completed interview exposes derived for confirm readback only", () => {
  const plan = {
    lineItems: {
      socialMedia: [
        {
          line_item_id: "social-1",
          publisher: "Meta",
          placement: "Facebook",
          bid_strategy: "leads",
        },
      ],
    },
  }
  const open = buildMiInterviewPayload(plan, [])
  assert.ok(open.currentQuestion)
  const done = buildMiInterviewPayload(plan, [
    { questionId: open.currentQuestion!.id, answer: "static" },
  ])
  assert.equal(done.openCount, 0)
  assert.equal(done.currentQuestion, null)
  assert.equal(done.questionIndex, undefined)
  assert.ok(Array.isArray(done.derived))
  assert.ok(done.derived!.some((d) =>
    d.field === "Objective" && d.value === "Leads" && d.source === "from plan: bid_strategy",
  ))
  assert.equal(buildMiInterviewQuestionCards(plan, [
    { questionId: open.currentQuestion!.id, answer: "static" },
  ]), undefined)
})

test("sequential MI answers yield distinct current question cards (one per turn)", () => {
  const plan = {
    lineItems: {
      socialMedia: [
        { line_item_id: "social-a", publisher: "Meta", placement: "Facebook" },
        {
          line_item_id: "social-b",
          publisher: "Meta",
          placement: "Unknown video placement",
        },
      ],
    },
  }

  const firstPayload = buildMiInterviewPayload(plan, [])
  assert.ok(firstPayload.currentQuestion)
  assert.equal(firstPayload.questionIndex, 1)
  assert.ok((firstPayload.questionTotal ?? 0) >= 2)

  const first = buildMiInterviewQuestionCards(plan, [])
  assert.ok(first?.length === 1)
  const q1 = first![0]
  assert.equal(q1.index, 1)
  assert.equal(q1.id, firstPayload.currentQuestion!.id)

  const secondPayload = buildMiInterviewPayload(plan, [
    { questionId: q1.id, answer: "static" },
  ])
  assert.ok(secondPayload.currentQuestion)
  assert.notEqual(secondPayload.currentQuestion!.id, q1.id)
  assert.equal(secondPayload.questionIndex, 2)
  assert.equal(secondPayload.questionTotal, firstPayload.questionTotal)

  const second = buildMiInterviewQuestionCards(plan, [
    { questionId: q1.id, answer: "static" },
  ])
  assert.ok(second?.length === 1)
  const q2 = second![0]

  assert.notEqual(q2.id, q1.id, "next card must be a different question id")
  assert.equal(q2.index, 2)
  assert.equal(q2.total, q1.total)
  assert.ok(q2.total >= 2)
})

test("unmatched prior answers do not advance card index or swap question identity", () => {
  const plan = {
    lineItems: {
      socialMedia: [
        { line_item_id: "social-1", publisher: "Meta", placement: "Facebook" },
      ],
    },
  }
  const baseline = buildMiInterviewQuestionCards(plan, [])![0]
  const stale = buildMiInterviewQuestionCards(plan, [
    { questionId: "format:not-a-real-id", answer: "static" },
  ])![0]

  assert.equal(stale.id, baseline.id)
  assert.equal(stale.index, 1)
  assert.equal(stale.total, baseline.total)
})

test("start_mi_interview tool description enforces tool-driven question contract", () => {
  const description = startMiInterviewTool.definition.description ?? ""
  assert.match(description, /ONE current/i)
  assert.match(description, /never author|never invent/i)
  assert.match(description, /not a question/i)
  assert.match(description, /bid_strategy/)
  assert.match(description, /funnel/i)
  assert.match(description, /question card/i)
  assert.match(description, /do not re-list options/i)
  assert.match(description, /derivedCount|already applied/i)
})

test("MI tool schemas accept answer arrays", () => {
  for (const tool of [startMiInterviewTool, generateMiWorkbookTool]) {
    const schema = tool.definition.input_schema as {
      properties?: Record<string, { type?: string; items?: { type?: string; properties?: object } }>
    }
    const answers = schema.properties?.answers
    assert.equal(answers?.type, "array")
    assert.equal(answers?.items?.type, "object")
    assert.ok(answers?.items?.properties)
  }
})

test("chat file attachment shape is generic and coerceable", () => {
  const attachment = toChatFileAttachment({
    fileName: "Client_Campaign_MI.xlsx",
    url: "/api/mi/exports/download?path=exports%2Fmi%2FMBA123%2Ffile.xlsx",
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sizeBytes: 2048,
  })

  assert.equal(attachment.kind, "file")
  assert.equal(attachment.fileName, "Client_Campaign_MI.xlsx")
  assert.match(attachment.url, /\/api\/mi\/exports\/download\?path=/)
  assert.equal(attachment.sizeBytes, 2048)
  assert.equal(attachment.expiresInMinutes, undefined)
  assert.ok(isChatFileAttachment(attachment))

  const coerced = coerceChatFileAttachments([attachment, { kind: "nope" }, null])
  assert.deepEqual(coerced, [attachment])
  assert.equal(coerceChatFileAttachments([]), undefined)
  assert.equal(coerceChatFileAttachments(undefined), undefined)
})

test("missing versionNumber warns and asks which version (MBA-wide offered)", async () => {
  const result = await startMiInterviewTool.execute({}, baseContext({
    versionNumber: undefined,
    enabledMediaTypes: undefined,
    mbaNumber: "MBA123",
  }))

  assert.equal(result.isError, false)
  const payload = JSON.parse(result.content)
  assert.equal(payload.blocked, true)
  assert.match(payload.warning, /no media-plan version/i)
  assert.match(payload.message, /MBA-wide/i)
  assert.ok(payload.options?.includes("MBA-wide"))
  assert.equal(result.questions?.[0]?.id, MI_SCOPE_VERSION_QUESTION_ID)
  assert.match(result.questions?.[0]?.text ?? "", /MBA-wide/)
})

test("resolveMiVersionScope uses context versionNumber without blocking", () => {
  const scoped = resolveMiVersionScope(
    baseContext({ versionNumber: 7 }),
    {},
  )
  assert.equal(scoped.ok, true)
  if (scoped.ok) {
    assert.equal(scoped.versionNumber, 7)
    assert.equal(scoped.mbaWide, false)
  }
})

test("resolveMiVersionScope accepts explicit MBA-wide and numeric answers", () => {
  const mbaWide = resolveMiVersionScope(
    baseContext({ versionNumber: undefined }),
    { mbaWide: true },
  )
  assert.equal(mbaWide.ok, true)
  if (mbaWide.ok) {
    assert.equal(mbaWide.mbaWide, true)
    assert.equal(mbaWide.versionNumber, undefined)
  }

  const fromAnswer = resolveMiVersionScope(
    baseContext({ versionNumber: undefined }),
    {},
    [{ questionId: MI_SCOPE_VERSION_QUESTION_ID, answer: "7" }],
  )
  assert.equal(fromAnswer.ok, true)
  if (fromAnswer.ok) {
    assert.equal(fromAnswer.versionNumber, 7)
    assert.equal(fromAnswer.mbaWide, false)
  }
})
