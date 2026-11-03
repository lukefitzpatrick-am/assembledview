/**
 * B19 Q4: POST /api/plans/save runs the publisher guard on publish, behind
 * the publisher_guard switch. Blocked lines return 422 before
 * savePlanVersion; media lines with no publisher come back as
 * publisherWarnings on a 200. publisherGuardForSave itself is in
 * lib/mediaplan/__tests__/publisherGuard.server.test.ts.
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../../../../lib/test/mockModuleHarness.js"
import { schema as realSchema } from "../../../../../db"
import { publisherGuardGateResult } from "../../../../../lib/mediaplan/publisherGuard"
import type { PublisherIdentityRow } from "../../../../../lib/publisher/publisherUniqueness"

const skip = mockModuleSkip()

const MASTER_ID = 100
const MBA = "krusty002"
const TIP_ID = 50

const PUBLISHERS: PublisherIdentityRow[] = [
  { id: 11, publisher_name: "Nine", publisherid: "nine" },
  { id: 30, publisher_name: "Meta", publisherid: "meta" },
]

let guardEnabled = false
let guardCalls = 0

const requireRoleMock = mock.fn(async () => ({
  session: { user: { email: "luke@assembledmedia.com.au" } },
  roles: ["admin"] as const,
  clientSlug: null,
  grantedByAllowlist: false,
}))
const checkClientMbaAccessMock = mock.fn(async () => ({ ok: true as const, isClient: false }))
const resolvePublishedVersionIdMock = mock.fn(async () => TIP_ID)
const countVersionLinesMock = mock.fn(async () => 1)
const getWorkingDraftMock = mock.fn(async () => null)
const deleteWorkingDraftMock = mock.fn(async () => undefined)
const savePlanVersionMock = mock.fn(async (input: { lineItems: unknown[] }) => ({
  versionId: 110,
  versionNumber: 2,
  lineCount: input.lineItems.length,
  scheduleRowCount: 1,
  published: true,
  legacySchedules: { billingSchedule: [], deliverySchedule: [] },
}))
const completeStagedIngestAfterSaveMock = mock.fn(async () => ({ ingestStageRetained: false }))

const getDbMock = mock.fn(() => ({
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => [{ id: MASTER_ID, mbaNumber: MBA }],
      }),
    }),
  }),
}))

// The route's guard module, with the real rules over a test switch and list.
const publisherGuardForSaveMock = mock.fn(
  async (mode: "draft" | "new_version" | "publish", lineItems: Parameters<typeof publisherGuardGateResult>[0]["lineItems"]) => {
    guardCalls += 1
    return publisherGuardGateResult({ mode, enabled: guardEnabled, lineItems, publishers: PUBLISHERS })
  },
)

if (supportsMockModule()) {
  await mock.module!("@/lib/requireRole", { namedExports: { requireRole: requireRoleMock } })
  await mock.module!("@/lib/auth/checkClientMbaAccess", {
    namedExports: { checkClientMbaAccess: checkClientMbaAccessMock },
  })
  await mock.module!("@/lib/mediaplan/drafts/serverStore", {
    namedExports: {
      resolvePublishedVersionId: resolvePublishedVersionIdMock,
      countVersionLines: countVersionLinesMock,
      getWorkingDraft: getWorkingDraftMock,
      deleteWorkingDraft: deleteWorkingDraftMock,
    },
  })
  await mock.module!("@/lib/data/savePlan", {
    namedExports: {
      savePlanVersion: savePlanVersionMock,
      SavePlanError: class SavePlanError extends Error {
        code: string
        constructor(code: string, message: string) {
          super(message)
          this.code = code
        }
      },
    },
  })
  await mock.module!("@/lib/mediaplans/ingest/completeStagedIngestAfterSave", {
    namedExports: { completeStagedIngestAfterSave: completeStagedIngestAfterSaveMock },
  })
  await mock.module!("@/db", { namedExports: { getDb: getDbMock, schema: realSchema } })
  await mock.module!("@/lib/mediaplan/publisherGuard.server", {
    namedExports: { publisherGuardForSave: publisherGuardForSaveMock },
  })
}

async function loadRoute() {
  const mod = await import("../route.js")
  if (!mod.POST) throw new Error("save route missing POST")
  return mod.POST as (req: NextRequest) => Promise<Response>
}

function digiLine(lineItemId: string, publisher: string | null) {
  return {
    lineItemId,
    channel: "digi_display",
    mediaType: "digi_display",
    buyType: "cpm",
    publisher,
    rate: 15,
    enteredAmount: 3000,
    bursts: [
      { budget: "3000", buyAmount: "15", calculatedValue: 200, startDate: "2026-01-01", endDate: "2026-01-31" },
    ],
  }
}

function saveBody(lineItems: unknown[], mode = "publish") {
  return {
    masterId: MASTER_ID,
    mbaNumber: MBA,
    versionNumber: 2,
    mode,
    lineItems,
    feeLoading: { feedigitaldisplay: 10 },
    baseVersionId: TIP_ID,
    tipVersionIdAtLoad: TIP_ID,
  }
}

function postReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/plans/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

function reset(enabled: boolean) {
  guardEnabled = enabled
  guardCalls = 0
  savePlanVersionMock.mock.resetCalls()
}

test("switch on: a typed name not in Publishers is 422 and nothing saves", { skip }, async () => {
  reset(true)
  const POST = await loadRoute()
  const res = await POST(postReq(saveBody([digiLine("KRUSTY002DD001", "Nine Digital")])))
  assert.equal(res.status, 422)
  const json = (await res.json()) as { code?: string; lineItemIds?: string[]; publisherIssues?: Array<{ kind: string }> }
  assert.equal(json.code, "PUBLISHER_NOT_IN_PUBLISHERS")
  assert.deepEqual(json.lineItemIds, ["KRUSTY002DD001"])
  assert.equal(json.publisherIssues?.[0]?.kind, "unknown")
  assert.equal(savePlanVersionMock.mock.calls.length, 0)
})

test("switch on: a production line with no publisher is 422", { skip }, async () => {
  reset(true)
  const POST = await loadRoute()
  const res = await POST(
    postReq(
      saveBody([
        {
          lineItemId: "KRUSTY002PR001",
          channel: "production",
          mediaType: "production",
          publisher: "",
          rate: 0,
          enteredAmount: 500,
          bursts: [{ budget: "500", startDate: "2026-01-01", endDate: "2026-01-31" }],
        },
      ]),
    ),
  )
  assert.equal(res.status, 422)
  const json = (await res.json()) as { publisherIssues?: Array<{ kind: string }> }
  assert.equal(json.publisherIssues?.[0]?.kind, "production_blank")
  assert.equal(savePlanVersionMock.mock.calls.length, 0)
})

test("switch on: a media line with no publisher saves with a warning", { skip }, async () => {
  reset(true)
  const POST = await loadRoute()
  const res = await POST(postReq(saveBody([digiLine("KRUSTY002DD001", null)])))
  assert.equal(res.status, 200)
  const json = (await res.json()) as { publisherWarnings?: Array<{ lineItemId: string; kind: string }> }
  assert.deepEqual(json.publisherWarnings?.map((w) => [w.lineItemId, w.kind]), [["KRUSTY002DD001", "media_blank"]])
  assert.equal(savePlanVersionMock.mock.calls.length, 1)
})

test("switch on: a known publisher passes with no warnings", { skip }, async () => {
  reset(true)
  const POST = await loadRoute()
  const res = await POST(postReq(saveBody([digiLine("KRUSTY002DD001", " nine ")])))
  assert.equal(res.status, 200)
  const json = (await res.json()) as { publisherWarnings?: unknown }
  assert.equal(json.publisherWarnings, undefined)
  assert.equal(savePlanVersionMock.mock.calls.length, 1)
})

test("switch off: an unknown name saves exactly as before", { skip }, async () => {
  reset(false)
  const POST = await loadRoute()
  const res = await POST(postReq(saveBody([digiLine("KRUSTY002DD001", "Nine Digital")])))
  assert.equal(res.status, 200)
  const json = (await res.json()) as { publisherWarnings?: unknown; code?: string }
  assert.equal(json.code, undefined)
  assert.equal(json.publisherWarnings, undefined)
  assert.equal(savePlanVersionMock.mock.calls.length, 1)
  assert.equal(guardCalls, 1)
})

test("switch on, draft mode: not checked", { skip }, async () => {
  reset(true)
  const POST = await loadRoute()
  const res = await POST(postReq(saveBody([digiLine("KRUSTY002DD001", "Nine Digital")], "draft")))
  assert.equal(res.status, 200)
  assert.equal(savePlanVersionMock.mock.calls.length, 1)
})
