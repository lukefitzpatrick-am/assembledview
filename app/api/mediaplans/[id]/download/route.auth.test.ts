import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

vi.mock("@/lib/requireRole", () => ({
  requireRole: vi.fn(async () => ({
    response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  })),
}))

vi.mock("axios", () => ({
  default: { get: vi.fn() },
}))

vi.mock("@/lib/api/xano", () => ({
  xanoAuthHeaderRecord: vi.fn(() => ({})),
  xanoPostHeaderRecord: vi.fn(() => ({})),
  xanoUrl: vi.fn(() => "https://example.test"),
}))

describe("GET /api/mediaplans/[id]/download auth", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when unauthenticated", async () => {
    const { GET } = await import("./route")
    const req = new NextRequest("http://localhost/api/mediaplans/123/download", {
      method: "GET",
    })
    const res = await GET(req, { params: Promise.resolve({ id: "123" }) })
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" })
  })
})
