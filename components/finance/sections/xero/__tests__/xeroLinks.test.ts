import assert from "node:assert/strict"
import { test } from "node:test"
import { invoicingHrefForClientMonth, mbaHref } from "../xeroLinks"

test("invoicing deep-link carries client + month scope", () => {
  const href = invoicingHrefForClientMonth(42, "2026-08")
  assert.ok(href.startsWith("/finance/invoicing?"))
  const q = new URL(href, "http://local").searchParams
  assert.equal(q.get("clients"), "42")
  assert.equal(q.get("from"), "2026-08")
  assert.equal(q.get("to"), "2026-08")
  assert.ok(q.get("fy"))
})

test("mba deep-link encodes mba number", () => {
  assert.equal(mbaHref("hartm008"), "/mediaplans/mba/hartm008")
})
