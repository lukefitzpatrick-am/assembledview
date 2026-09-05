/**
 * POST /api/mediaplans/versions/[id]/documents — Blob put + Postgres jsonb.
 * Requires Node 22+ module mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest, NextResponse } from "next/server"

import * as schema from "../../../../../../../db/schema"
import { mockModuleSkip, supportsMockModule } from "../../../../../../../lib/test/mockModuleHarness.js"

const skip = mockModuleSkip()

const requireRoleMock = mock.fn(
  async (_req: unknown, _roles: string[]) =>
    ({
      session: { user: { email: "luke@assembledmedia.com.au" } },
      roles: ["admin"] as const,
      clientSlug: null,
      grantedByAllowlist: false,
    }) as
      | {
          session: { user: { email: string } }
          roles: readonly ["admin"]
          clientSlug: null
          grantedByAllowlist: boolean
        }
      | { response: NextResponse },
)

const putMock = mock.fn(
  async (pathname: string, _body: unknown, options: Record<string, unknown>) => {
    return {
      url: `https://abc.blob.vercel-storage.com/${pathname}`,
      pathname,
    }
  },
)

type VersionRow = {
  id: number
  versionNumber: number
  mbaNumber: string
}

let selectRows: VersionRow[] = []
const updateSets: Array<Record<string, unknown>> = []

const fakeDb = {
  select: () => ({
    from: () => ({
      innerJoin: () => ({
        where: () => ({
          limit: async () => selectRows,
        }),
      }),
    }),
  }),
  update: () => ({
    set: (payload: Record<string, unknown>) => {
      updateSets.push(payload)
      return {
        where: async () => undefined,
      }
    },
  }),
}

if (supportsMockModule()) {
  await mock.module!("@/lib/requireRole", {
    namedExports: {
      requireRole: requireRoleMock,
    },
  })
  await mock.module!("@vercel/blob", {
    namedExports: {
      put: putMock,
    },
  })
  await mock.module!("@/db", {
    namedExports: {
      getDb: () => fakeDb,
      schema,
    },
  })
}

function postRequest(id: string, form: FormData) {
  return new NextRequest(`http://localhost/api/mediaplans/versions/${id}/documents`, {
    method: "POST",
    body: form,
  })
}

function reset() {
  selectRows = []
  updateSets.length = 0
  putMock.mock.resetCalls()
  requireRoleMock.mock.resetCalls()
  requireRoleMock.mock.mockImplementation(async () => ({
    session: { user: { email: "luke@assembledmedia.com.au" } },
    roles: ["admin"] as const,
    clientSlug: null,
    grantedByAllowlist: false,
  }))
  putMock.mock.mockImplementation(async (pathname: string) => ({
    url: `https://abc.blob.vercel-storage.com/${pathname}`,
    pathname,
  }))
}

test("POST documents — missing version is 404", { skip }, async () => {
  reset()
  selectRows = []
  const form = new FormData()
  form.append(
    "mba_pdf",
    new File([Buffer.from("%PDF")], "Glendale_MBA_v6.pdf", { type: "application/pdf" }),
  )

  const { POST } = await import("../route.js")
  const res = await POST(postRequest("999", form), {
    params: Promise.resolve({ id: "999" }),
  })
  assert.equal(res.status, 404)
  assert.equal(putMock.mock.calls.length, 0)
  assert.equal(updateSets.length, 0)
})

test("POST documents — put() private blob + jsonb only for provided kinds", { skip }, async () => {
  reset()
  selectRows = [{ id: 42, versionNumber: 6, mbaNumber: "glenda008" }]
  const form = new FormData()
  form.append(
    "mba_pdf",
    new File([Buffer.from("%PDF-mba")], "Glendale_MBA_v6.pdf", { type: "application/pdf" }),
  )
  form.append(
    "media_plan",
    new File([Buffer.from("xlsx")], "Glendale_MediaPlan_v6.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  )
  form.append("mp_client_name", "Glendale")

  const { POST } = await import("../route.js")
  const res = await POST(postRequest("42", form), {
    params: Promise.resolve({ id: "42" }),
  })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.ok, true)
  assert.ok(body.files.mba_pdf)
  assert.ok(body.files.media_plan)
  assert.equal(body.files.aa_media_plan, undefined)
  assert.equal(body.files.mba_pdf.source, "vercel-blob")
  assert.equal(
    body.files.mba_pdf.pathname,
    "plans/glenda008/v6/mba_pdf/Glendale_MBA_v6.pdf",
  )
  assert.equal(
    body.files.media_plan.pathname,
    "plans/glenda008/v6/media_plan/Glendale_MediaPlan_v6.xlsx",
  )
  assert.equal(putMock.mock.calls.length, 2)
  const putOpts = putMock.mock.calls[0]!.arguments[2] as Record<string, unknown>
  assert.equal(putOpts.access, "private")
  assert.equal(putOpts.addRandomSuffix, true)
  assert.equal(updateSets.length, 1)
  const set = updateSets[0]!
  assert.ok(set.mbaPdfFile)
  assert.ok(set.mediaPlanFile)
  assert.equal(set.aaMediaPlanFile, undefined)
  assert.equal(set.publishedAt, undefined)
  assert.equal(set.publishedBy, undefined)
  assert.deepEqual(requireRoleMock.mock.calls[0]!.arguments[1], ["admin"])
})
