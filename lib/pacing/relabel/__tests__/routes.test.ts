/**
 * Relabel route auth. Requires Node 22+ `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest, NextResponse } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../../test/mockModuleHarness.js"
import { pacingJsonError } from "../../pacingHttp.js"

const skip = mockModuleSkip()

type Access = "staff" | "client" | "anon"
let access: Access = "staff"

if (supportsMockModule()) {
  await mock.module!("@/lib/pacing/relabel/auth", {
    namedExports: {
      requireRelabelAccess: async () => {
        if (access === "anon") {
          return { ok: false, response: pacingJsonError("unauthorised", 401) }
        }
        if (access === "client") {
          return { ok: false, response: pacingJsonError("forbidden", 403) }
        }
        return {
          ok: true,
          session: { user: { email: "staff@assembledmedia.com.au" } },
          actorEmail: "staff@assembledmedia.com.au",
        }
      },
    },
  })
  await mock.module!("@/lib/pacing/relabel/handlers", {
    namedExports: {
      runRelabelList: async () => NextResponse.json({ relabels: [] }),
      runRelabelGet: async () => NextResponse.json({ relabel: { id: 1 } }),
      runRelabelPreview: async () => NextResponse.json({ preview: { lineItemId: "bicau002sm2" } }),
      runRelabelApply: async () => NextResponse.json({ result: { relabelId: 1 } }),
      runRelabelRevert: async () => NextResponse.json({ result: { relabelId: 1 } }),
    },
  })
}

type GetHandler = (req: NextRequest, ctx?: { params: Promise<{ id: string }> }) => Promise<Response>
type PostHandler = (req: NextRequest, ctx?: { params: Promise<{ id: string }> }) => Promise<Response>

async function loadRoutes() {
  const list = await import("../../../../app/api/pacing/relabels/route.js")
  const preview = await import("../../../../app/api/pacing/relabels/preview/route.js")
  const apply = await import("../../../../app/api/pacing/relabels/apply/route.js")
  const get = await import("../../../../app/api/pacing/relabels/[id]/route.js")
  const revert = await import("../../../../app/api/pacing/relabels/[id]/revert/route.js")
  return {
    list: list.GET as GetHandler,
    preview: preview.POST as PostHandler,
    apply: apply.POST as PostHandler,
    get: get.GET as GetHandler,
    revert: revert.POST as PostHandler,
  }
}

function request(path: string, method: "GET" | "POST" = "GET", body?: Record<string, unknown>) {
  return new NextRequest(new URL(path, "http://localhost"), {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
}

const previewBody = {
  channel: "Social - Meta",
  platformEntityId: "120256089860390550",
  lineItemId: "bicau002sm2",
  reason: "fix attribution",
}

async function statusesFor(accessMode: Access) {
  access = accessMode
  const routes = await loadRoutes()
  const idCtx = { params: Promise.resolve({ id: "1" }) }
  return {
    list: (await routes.list(request("/api/pacing/relabels"))).status,
    preview: (await routes.preview(request("/api/pacing/relabels/preview", "POST", previewBody))).status,
    apply: (await routes.apply(request("/api/pacing/relabels/apply", "POST", previewBody))).status,
    get: (await routes.get(request("/api/pacing/relabels/1"), idCtx)).status,
    revert: (await routes.revert(request("/api/pacing/relabels/1/revert", "POST"), idCtx)).status,
  }
}

test("staff get 200 on every relabel route", { skip }, async () => {
  const statuses = await statusesFor("staff")
  assert.deepEqual(statuses, { list: 200, preview: 200, apply: 200, get: 200, revert: 200 })
})

test("client get 403 on every relabel route", { skip }, async () => {
  const statuses = await statusesFor("client")
  assert.deepEqual(statuses, { list: 403, preview: 403, apply: 403, get: 403, revert: 403 })
})

test("anonymous get 401 on every relabel route", { skip }, async () => {
  const statuses = await statusesFor("anon")
  assert.deepEqual(statuses, { list: 401, preview: 401, apply: 401, get: 401, revert: 401 })
})
