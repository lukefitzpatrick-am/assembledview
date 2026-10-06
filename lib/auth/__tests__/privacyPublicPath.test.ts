import { NextRequest } from "next/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth0", () => ({
  auth0: {
    middleware: vi.fn(async () => undefined),
    getSession: vi.fn(async () => null),
  },
}))

import { middleware } from "../../../middleware"

describe("privacy public path", () => {
  it("passes /privacy with no session and does not redirect to login", async () => {
    const response = await middleware(new NextRequest("http://localhost:3000/privacy"))
    expect(response.status).toBe(200)
    expect(response.headers.get("location")).toBeNull()
    expect(response.headers.get("x-middleware-next")).toBe("1")
  })

  it("passes /data-deletion with no session and does not redirect to login", async () => {
    const response = await middleware(new NextRequest("http://localhost:3000/data-deletion"))
    expect(response.status).toBe(200)
    expect(response.headers.get("location")).toBeNull()
    expect(response.headers.get("x-middleware-next")).toBe("1")
  })
})
