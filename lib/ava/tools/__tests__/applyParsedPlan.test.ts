import assert from "node:assert/strict"
import test from "node:test"
import { applyParsedPlanTool } from "../applyParsedPlan.js"
import type { AvaToolContext } from "../types.js"

function ctx(overrides: Partial<AvaToolContext> = {}): AvaToolContext {
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
    ...overrides,
  }
}

test("apply_parsed_plan refuses without confirm", async () => {
  const c = ctx({
    pendingParsedPlan: {
      channel: "radio",
      mapped: {
        plan_meta: {},
        line_items: [
          {
            channel: "radio",
            fields: { network: "SCA" },
            bursts: [{ startDate: "2026-01-01", endDate: "2026-01-07", budget: "100" }],
            confidence: 0.9,
          },
        ],
        needs_review: [],
        warnings: [],
      },
    },
  })
  const denied = await applyParsedPlanTool.execute({ confirm: false }, c)
  assert.equal(denied.isError, true)
  assert.equal(c.capturedLineItemsLoad, null)
})

test("apply_parsed_plan captures line items on confirm", async () => {
  const c = ctx({
    pendingParsedPlan: {
      channel: "radio",
      mapped: {
        plan_meta: {},
        line_items: [
          {
            channel: "radio",
            fields: { network: "SCA", station: "2DAY" },
            bursts: [{ startDate: "2026-01-01", endDate: "2026-01-07", budget: "100" }],
            confidence: 0.9,
          },
        ],
        needs_review: [],
        warnings: [],
      },
    },
  })
  const ok = await applyParsedPlanTool.execute({ confirm: true }, c)
  assert.equal(ok.isError, false)
  assert.ok(c.capturedLineItemsLoad)
  assert.equal(c.capturedLineItemsLoad?.channel, "radio")
  assert.equal(c.capturedLineItemsLoad?.items.length, 1)
})
