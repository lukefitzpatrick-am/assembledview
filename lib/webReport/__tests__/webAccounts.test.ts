import assert from "node:assert/strict"
import { test } from "node:test"

import { parseBuilderRequest } from "@/lib/webReport/builder/request"

test("builder request parses accounts and link actions", () => {
  assert.deepEqual(parseBuilderRequest({ action: "accounts" }), { ok: true, action: "accounts" })
  assert.deepEqual(parseBuilderRequest({ action: "link", platform: "ga4", ref: "372647707", label: "HartmannDirect" }), {
    ok: true,
    action: "link",
    body: { platform: "ga4", ref: "372647707", label: "HartmannDirect" },
  })
  assert.deepEqual(parseBuilderRequest({ action: "link", platform: "gsc", ref: null }), {
    ok: true,
    action: "link",
    body: { platform: "gsc", ref: null, label: null },
  })
  assert.equal(parseBuilderRequest({ action: "link", platform: "meta_ads", ref: "1" }).ok, false)
})
