/**
 * Export route uses the headless generator and ignores client-supplied identity.
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()

const generateMock = mock.fn(async (_input: {
  mbaNumber: string
  period: { kind: string }
  store: boolean
  withCommentary: boolean
}) => ({
  buffer: Buffer.from("deck-bytes"),
  fileName: "Penfold-Always-on-report-2026-08.pptx",
  commentaryGenerated: false,
  commentary: null,
  periodMonth: "2026-08",
}))

if (typeof mock.module === "function") {
  await mock.module("@/lib/requireRole", {
    namedExports: {
      requireRole: async () => ({
        session: { user: { email: "admin@assembledmedia.com.au", sub: "admin-1" } },
      }),
    },
  })
  await mock.module("@/lib/auth/checkClientMbaAccess", {
    namedExports: {
      checkClientMbaAccess: async () => ({ ok: true as const }),
    },
  })
  await mock.module("@/lib/reports/campaignReport/rateLimit", {
    namedExports: {
      checkCampaignReportRateLimit: () => ({ ok: true as const }),
    },
  })
  await mock.module("@/lib/reports/campaignReport/generateCampaignReportForMba", {
    namedExports: {
      generateCampaignReportForMba: generateMock,
    },
  })
  await mock.module("@/lib/reports/persistPerformanceReportInsights", {
    namedExports: {
      persistPerformanceReportInsights: async () => ({ status: "skipped" }),
    },
  })
}

const { POST } = await import("../route")

test(
  "POST /api/campaigns/export-report ignores body clientName",
  { skip },
  async () => {
    generateMock.mock.resetCalls()
    const request = new NextRequest("http://localhost/api/campaigns/export-report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mbaNumber: "PENFOLD013",
        clientName: "Wrong client",
        campaignName: "Wrong campaign",
        versionNumber: 1,
        campaignStartISO: "2020-01-01",
        campaignEndISO: "2020-02-01",
        mpSearchEnabled: true,
        period: { kind: "this_month" },
      }),
    })

    const response = await POST(request)
    assert.equal(response.status, 200)
    assert.equal(generateMock.mock.calls.length, 1)
    const input = generateMock.mock.calls[0].arguments[0] as {
      mbaNumber: string
      period: { kind: string }
      store: boolean
      withCommentary: boolean
      clientName?: string
    }
    assert.equal(input.mbaNumber, "PENFOLD013")
    assert.equal(input.period.kind, "this_month")
    assert.equal(input.store, false)
    assert.equal(input.withCommentary, true)
    assert.equal(input.clientName, undefined)
    assert.equal(
      response.headers.get("Content-Disposition"),
      'attachment; filename="Penfold-Always-on-report-2026-08.pptx"',
    )
  },
)
