/**
 * POST /api/admin/ingest/remap — knownHeaders required; invented header is 200 ok:false.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../../test/mockModuleHarness.js"
import {
  clearPublisherProfileSeedOverlayForTests,
  getPublisherProfileSeedOverlay,
} from "../persistColumnRemap"

const skip = mockModuleSkip()

type AdminGateResult =
  | {
      session: { user: { email: string } }
      roles: string[]
      clientSlug: null
      grantedByAllowlist: boolean
    }
  | { response: Response }

const requireAdminMock = mock.fn(async (_req: unknown): Promise<AdminGateResult> => ({
  session: { user: { email: "luke@assembledmedia.com.au" } },
  roles: ["admin"] as string[],
  clientSlug: null,
  grantedByAllowlist: false,
}))

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

test("POST remap without knownHeaders is 400", { skip }, async () => {
  clearPublisherProfileSeedOverlayForTests()
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
  clearPublisherProfileSeedOverlayForTests()
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
