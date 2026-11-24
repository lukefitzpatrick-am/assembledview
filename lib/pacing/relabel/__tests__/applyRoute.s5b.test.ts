/**
 * S5b: the apply route passes the "Save as a client alias" tick through only
 * as a strict true, and keeps its access check. Node 22+ module mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest, NextResponse } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../../test/mockModuleHarness.js"
import { pacingJsonError } from "../../pacingHttp.js"

const skip = mockModuleSkip()
let client = false
const seen: Array<Record<string, unknown>> = []

if (supportsMockModule()) {
  await mock.module!("@/lib/pacing/relabel/auth", {
    namedExports: {
      requireRelabelAccess: async () =>
        client
          ? { ok: false, response: pacingJsonError("forbidden", 403) }
          : { ok: true, session: { user: { email: "staff@am.test" } }, actorEmail: "staff@am.test" },
    },
  })
  await mock.module!("@/lib/pacing/relabel/handlers", {
    namedExports: {
      runRelabelApply: async (args: Record<string, unknown>) => {
        seen.push(args)
        return NextResponse.json({ ok: true })
      },
    },
  })
}

const body = { channel: "Social - Meta", platformEntityId: "1", lineItemId: "pgaaus015sm3", reason: "r" }

async function post(extra: Record<string, unknown>) {
  const { POST } = await import("../../../../app/api/pacing/relabels/apply/route.js")
  return POST(
    new NextRequest(new URL("/api/pacing/relabels/apply", "http://localhost"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, ...extra }),
    }),
  )
}

test("saveClientAlias is true only for a literal true", { skip }, async () => {
  seen.length = 0
  client = false
  await post({ saveClientAlias: true })
  await post({ saveClientAlias: "true" })
  await post({})
  assert.deepEqual(seen.map((a) => a.saveClientAlias), [true, false, false])
})

test("a client user gets 403 and the handler never runs", { skip }, async () => {
  seen.length = 0
  client = true
  const res = await post({ saveClientAlias: true })
  assert.equal(res.status, 403)
  assert.equal(seen.length, 0)
})
