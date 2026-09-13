/**
 * POST /api/admin/ingest/remap — knownHeaders required; invented header is 200 ok:false.
 * Hub fieldDefault set/clear uses persistFieldDefault (no knownHeaders, no stageId).
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../../test/mockModuleHarness.js"
import {
  clearPublisherProfileSeedOverlayForTests,
  getPublisherProfileSeedAuditForTests,
  getPublisherProfileSeedOverlay,
} from "../persistColumnRemap"

const skip = mockModuleSkip()

type AdminGateResult =
  | {
      session: { user: { email?: string } }
      roles: string[]
      clientSlug: null
      grantedByAllowlist: boolean
    }
  | { response: Response }

const ADMIN_OK: Extract<AdminGateResult, { session: unknown }> = {
  session: { user: { email: "luke@assembledmedia.com.au" } },
  roles: ["admin"] as string[],
  clientSlug: null,
  grantedByAllowlist: false,
}

const requireAdminMock = mock.fn(async (_req: unknown): Promise<AdminGateResult> => ADMIN_OK)

if (supportsMockModule()) {
  await mock.module!("@/lib/requireRole", {
    namedExports: {
      requireAdmin: requireAdminMock,
    },
  })
}

async function loadRoute() {
  return import("../../../../app/api/admin/ingest/remap/route.js")
}

function post(body: unknown) {
  return new NextRequest("http://localhost/api/admin/ingest/remap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

test.beforeEach(() => {
  clearPublisherProfileSeedOverlayForTests()
  requireAdminMock.mock.resetCalls()
  requireAdminMock.mock.mockImplementation(async () => ADMIN_OK)
})

test("POST remap without knownHeaders is 400", { skip }, async () => {
  const { POST } = await loadRoute()
  const res = await POST(
    post({
      publisherName: "JCDecaux",
      header: "Production Charge",
      mappedTo: null,
    }),
  )
  assert.equal(res.status, 400)
  const json = (await res.json()) as { error?: string }
  assert.match(json.error ?? "", /knownHeaders required/)
  assert.equal(getPublisherProfileSeedOverlay().size, 0)
})

test("POST remap with a header not on the sheet is 200 ok:false and writes nothing", { skip }, async () => {
  const { POST } = await loadRoute()
  const res = await POST(
    post({
      publisherName: "JCDecaux",
      header: "Large Format",
      mappedTo: "format",
      knownHeaders: ["Production Charge", "Panel #"],
    }),
  )
  assert.equal(res.status, 200)
  const json = (await res.json()) as { ok?: boolean; reason?: string }
  assert.equal(json.ok, false)
  assert.match(json.reason ?? "", /not a column in this schedule/)
  assert.equal(getPublisherProfileSeedOverlay().size, 0)
})

test("POST fieldDefault sets then clears a constant with hub_remap audit rows", { skip }, async () => {
  const { POST } = await loadRoute()
  const setRes = await POST(
    post({
      publisherName: "JCDecaux",
      fieldDefault: { field: "format", value: "large_format" },
    }),
  )
  assert.equal(setRes.status, 200)
  const setJson = (await setRes.json()) as {
    ok?: boolean
    profile?: { field_defaults?: Record<string, string> }
  }
  assert.equal(setJson.ok, true)
  assert.equal(setJson.profile?.field_defaults?.format, "large_format")
  assert.equal(
    getPublisherProfileSeedOverlay().get("jcdecaux")?.field_defaults.format,
    "large_format",
  )
  const afterSet = getPublisherProfileSeedAuditForTests()
  assert.equal(afterSet.length, 1)
  assert.equal(afterSet[0]?.field, "field_defaults")
  assert.equal(afterSet[0]?.header, "format")
  assert.equal(afterSet[0]?.next_value, "large_format")
  assert.equal(afterSet[0]?.changed_by, "luke@assembledmedia.com.au")
  assert.equal(afterSet[0]?.source, "hub_remap")

  const clearRes = await POST(
    post({
      publisherName: "JCDecaux",
      fieldDefault: { field: "format", value: null },
    }),
  )
  assert.equal(clearRes.status, 200)
  const clearJson = (await clearRes.json()) as {
    ok?: boolean
    profile?: { field_defaults?: Record<string, string> }
  }
  assert.equal(clearJson.ok, true)
  assert.equal(clearJson.profile?.field_defaults?.format, undefined)
  assert.equal(
    getPublisherProfileSeedOverlay().get("jcdecaux")?.field_defaults.format,
    undefined,
  )
  const afterClear = getPublisherProfileSeedAuditForTests()
  assert.equal(afterClear.length, 2)
  assert.equal(afterClear[1]?.field, "field_defaults")
  assert.equal(afterClear[1]?.header, "format")
  assert.equal(afterClear[1]?.action, "remove")
  assert.equal(afterClear[1]?.previous_value, "large_format")
  assert.equal(afterClear[1]?.next_value, null)
  assert.equal(afterClear[1]?.changed_by, "luke@assembledmedia.com.au")
  assert.equal(afterClear[1]?.source, "hub_remap")
})

test("POST fieldDefault without session identity is 400", { skip }, async () => {
  requireAdminMock.mock.mockImplementation(async () => ({
    session: { user: {} },
    roles: ["admin"] as string[],
    clientSlug: null,
    grantedByAllowlist: false,
  }))
  const { POST } = await loadRoute()
  const res = await POST(
    post({
      publisherName: "JCDecaux",
      fieldDefault: { field: "format", value: "large_format" },
    }),
  )
  assert.equal(res.status, 400)
  const json = (await res.json()) as { error?: string }
  assert.match(json.error ?? "", /session identity required/)
  assert.equal(getPublisherProfileSeedOverlay().size, 0)
  assert.equal(getPublisherProfileSeedAuditForTests().length, 0)
})
