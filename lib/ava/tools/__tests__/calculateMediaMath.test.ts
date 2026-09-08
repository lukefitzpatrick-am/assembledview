import assert from "node:assert/strict"
import test from "node:test"

import { calculateMediaMathTool } from "../calculateMediaMath.js"
import type { AvaToolContext } from "../types.js"

function ctx(): AvaToolContext {
  return {
    pageContext: undefined,
    clientSlug: undefined,
    mbaNumber: undefined,
    versionNumber: undefined,
    enabledMediaTypes: undefined,
    userSub: "u1",
    userEmail: "a@b.com",
    roles: ["admin"],
    clientSlugs: [],
    mbaNumbers: [],
    capturedPatch: null,
    capturedAttachments: null,
    capturedQuestions: null,
    pendingParsedPlan: null,
    capturedLineItemsLoad: null,
    currentLineItems: null,
  }
}

test("calculate_media_math: $30k and 2m impressions → CPM 15.00, does not write the form", async () => {
  const c = ctx()
  const result = await calculateMediaMathTool.execute(
    { buyType: "cpm", budget: 30_000, deliverables: 2_000_000 },
    c,
  )
  assert.equal(result.isError, false)
  assert.match(result.content, /15/)
  assert.match(result.content, /formula/i)
  assert.equal(c.capturedPatch, null)
  assert.equal(c.capturedLineItemsLoad, null)
})

test("calculate_media_math: description says it never writes and points to adjust_line_items", () => {
  const description = calculateMediaMathTool.definition.description ?? ""
  assert.match(description, /never writes/i)
  assert.match(description, /adjust_line_items/)
})
