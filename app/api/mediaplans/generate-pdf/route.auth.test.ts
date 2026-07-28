import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

vi.mock("@/lib/requireRole", () => ({
  requireRole: vi.fn(async () => ({
    response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  })),
}))

vi.mock("@/lib/generateMediaPlan", () => ({
  generateMediaPlan: vi.fn(),
}))

describe("POST /api/mediaplans/generate-pdf auth", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when unauthenticated", async () => {
    const { POST } = await import("./route")
    const req = new NextRequest("http://localhost/api/mediaplans/generate-pdf", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" })
  })
})
