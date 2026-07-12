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

test("start_mi_interview returns compact remaining questions", () => {
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
  assert.equal(payload.questions[0]?.field, "creative_type")
  assert.equal(payload.questions[0]?.line_item_id, "social-1")
  assert.equal(payload.questions[0]?.displayName, "Meta — Facebook")
  assert.ok(Array.isArray(payload.derived))
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

test("sequential MI answers yield distinct current question cards", () => {
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

  const first = buildMiInterviewQuestionCards(plan, [])
  assert.ok(first?.length === 1)
  const q1 = first![0]
  assert.equal(q1.index, 1)

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

test("start_mi_interview tool description forbids inventing questions", () => {
  const description = startMiInterviewTool.definition.description ?? ""
  assert.match(description, /verbatim/i)
  assert.match(description, /never invent/i)
  assert.match(description, /from plan: bid_strategy/)
  assert.match(description, /question card/i)
  assert.match(description, /do not re-list options/i)
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
