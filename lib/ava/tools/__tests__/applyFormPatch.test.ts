import assert from "node:assert/strict"
import test from "node:test"
import { applyFormPatchTool } from "../applyFormPatch.js"
import type { AvaToolContext } from "../types.js"
import type { PageField } from "@/lib/ava/types"

function ctx(fields: PageField[]): AvaToolContext {
  return {
    pageContext: { fields },
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

test("apply_form_patch rejects out-of-options select value", async () => {
  const c = ctx([
    {
      fieldId: "status",
      editable: true,
      type: "select",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Live", value: "live" },
      ],
    },
  ])

  const result = await applyFormPatchTool.execute(
    { updates: [{ fieldId: "status", value: "archived" }] },
    c,
  )

  assert.equal(result.isError, true)
  assert.match(result.content, /not a valid option/i)
  assert.equal(c.capturedPatch, null)
})

test("apply_form_patch rejects non-numeric number value", async () => {
  const c = ctx([
    {
      fieldId: "budget",
      editable: true,
      type: "number",
      semanticType: "budget",
    },
  ])

  const result = await applyFormPatchTool.execute(
    { updates: [{ fieldId: "budget", value: "not-a-number" }] },
    c,
  )

  assert.equal(result.isError, true)
  assert.equal(c.capturedPatch, null)
})

test("apply_form_patch accepts valid option and number values", async () => {
  const c = ctx([
    {
      fieldId: "status",
      editable: true,
      options: ["draft", "live"],
    },
    {
      fieldId: "budget",
      editable: true,
      semanticType: "budget",
    },
  ])

  const result = await applyFormPatchTool.execute(
    {
      updates: [
        { fieldId: "status", value: "Live" },
        { fieldId: "budget", value: "15000" },
      ],
    },
    c,
  )

  assert.equal(result.isError, false)
  assert.ok(c.capturedPatch)
  assert.equal(c.capturedPatch?.updates.length, 2)
  assert.equal(c.capturedPatch?.updates[0].value, "Live")
  assert.equal(c.capturedPatch?.updates[1].value, "15000")
})
