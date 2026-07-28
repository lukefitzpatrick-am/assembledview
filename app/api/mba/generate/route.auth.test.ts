import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

const requireRole = vi.fn()
vi.mock("@/lib/requireRole", () => ({
  requireRole: (...args: unknown[]) => requireRole(...args),
}))

vi.mock("@/lib/generateMBA", () => ({
  generateMBA: vi.fn(async () => new Blob([new Uint8Array([1, 2, 3])])),
}))

vi.mock("@/lib/api/xano", () => ({
  getXanoBaseUrl: () => "https://xano.test",
  parseXanoListPayload: (data: unknown) =>
    Array.isArray(data) ? data : Array.isArray((data as any)?.items) ? (data as any).items : [],
  xanoAuthHeaderRecord: () => ({}),
}))

vi.mock("@/lib/finance/xanoReferenceCache", () => ({
  getCachedClients: vi.fn(async () => []),
}))

vi.mock("@/lib/finance/feeSnapshots", () => ({
  readFeeSnapshot: vi.fn(async () => null),
}))

const axiosGet = vi.fn()
vi.mock("axios", () => ({
  default: {
    get: (...args: unknown[]) => axiosGet(...args),
    isAxiosError: () => false,
  },
}))

describe("POST /api/mba/generate auth", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    delete process.env.PLANC_DOCS_FROM_PERSISTED
    requireRole.mockResolvedValue({
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
  })

  it("returns 401 when unauthenticated", async () => {
    const { POST } = await import("./route")
    const req = new NextRequest("http://localhost/api/mba/generate", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" })
  })
})

describe("POST /api/mba/generate PLANC_DOCS_FROM_PERSISTED", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    process.env.PLANC_DOCS_FROM_PERSISTED = "on"
    requireRole.mockResolvedValue({ user: { id: 1 } })
  })

  it("returns 422 when version lacks approval", async () => {
    axiosGet.mockResolvedValue({
      status: 200,
      data: [
        {
          id: 9,
          version_number: 2,
          campaign_status: "draft",
          mp_client_name: "Acme",
          billingSchedule: [
            {
              monthYear: "June 2026",
              mediaTotal: "$1.00",
              feeTotal: "$0.00",
              totalAmount: "$1.00",
              adservingTechFees: "$0.00",
              production: "$0.00",
              mediaCosts: {
                search: "$1.00",
                socialMedia: "$0.00",
                television: "$0.00",
                radio: "$0.00",
                newspaper: "$0.00",
                magazines: "$0.00",
                ooh: "$0.00",
                cinema: "$0.00",
                digiDisplay: "$0.00",
                digiAudio: "$0.00",
                digiVideo: "$0.00",
                bvod: "$0.00",
                integration: "$0.00",
                progDisplay: "$0.00",
                progVideo: "$0.00",
                progBvod: "$0.00",
                progAudio: "$0.00",
                progOoh: "$0.00",
                influencers: "$0.00",
                production: "$0.00",
              },
            },
          ],
        },
      ],
    })

    const { POST } = await import("./route")
    const req = new NextRequest("http://localhost/api/mba/generate", {
      method: "POST",
      body: JSON.stringify({ mba_number: "ACME001", version_number: 2 }),
      headers: { "content-type": "application/json" },
    })
    const res = await POST(req)
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.code).toBe("mba_approval_required")
  })
})
