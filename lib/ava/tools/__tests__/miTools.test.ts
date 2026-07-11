import assert from "node:assert/strict"
import test from "node:test"

import {
  getPlatformSpecsPayload,
} from "../getPlatformSpecs.js"
import {
  buildMiInterviewPayload,
  startMiInterviewTool,
} from "../startMiInterview.js"
import { generateMiWorkbookTool } from "../generateMiWorkbook.js"

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
