import assert from "node:assert/strict"
import test from "node:test"
import { adjustLineItemsTool } from "../adjustLineItems.js"
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
    currentLineItems: null,
    ...overrides,
  }
}

const items = [
  {
    network: "QMS",
    format: "Portrait",
    buy_type: "",
    market: "Sydney",
    is_bonus: false,
    bursts: [{ budget: "1000" }],
  },
  {
    network: "oOh!",
    format: "Landscape",
    buy_type: "",
    market: "Melbourne",
    is_bonus: false,
    bursts: [{ budget: "500" }],
  },
]

test("adjust_line_items preview without confirm does not capture", async () => {
  const c = ctx({ currentLineItems: { ooh: items } })
  const preview = await adjustLineItemsTool.execute(
    {
      channel: "ooh",
      ops: [{ type: "setField", field: "market", value: "National" }],
      confirm: false,
    },
    c,
  )
  assert.equal(preview.isError, false)
  assert.match(preview.content, /Preview/)
  assert.match(preview.content, /National/)
  assert.equal(c.capturedLineItemsLoad, null)
})

test("adjust_line_items confirm captures adjusted items", async () => {
  const c = ctx({ currentLineItems: { ooh: items } })
  const ok = await adjustLineItemsTool.execute(
    {
      channel: "ooh",
      ops: [{ type: "setField", field: "market", value: "National" }],
      confirm: true,
    },
    c,
  )
  assert.equal(ok.isError, false)
  assert.ok(c.capturedLineItemsLoad)
  assert.equal(c.capturedLineItemsLoad?.channel, "ooh")
  assert.equal(c.capturedLineItemsLoad?.items.length, 2)
  assert.ok(c.capturedLineItemsLoad?.items.every((r) => r.market === "National"))
  assert.deepEqual(
    (c.capturedLineItemsLoad?.items[0].bursts as { budget: string }[])[0],
    { budget: "1000" },
  )
})

test("adjust_line_items refuses pure money ops", async () => {
  const c = ctx({ currentLineItems: { radio: items } })
  const denied = await adjustLineItemsTool.execute(
    {
      channel: "radio",
      ops: [{ type: "setField", field: "budget", value: "9999" }],
      confirm: true,
    },
    c,
  )
  assert.equal(denied.isError, true)
  assert.match(denied.content, /grid/i)
  assert.equal(c.capturedLineItemsLoad, null)
})

test("adjust_line_items requires currentLineItems", async () => {
  const c = ctx()
  const denied = await adjustLineItemsTool.execute(
    {
      channel: "ooh",
      ops: [{ type: "setField", field: "market", value: "National" }],
      confirm: false,
    },
    c,
  )
  assert.equal(denied.isError, true)
  assert.match(denied.content, /No current line items/)
})
