/**
 * B55fix (R2): once the client instrumentation has run, building and parsing a
 * zod object schema calls no `new Function`, so the CSP sends no eval report.
 */
import { afterEach, describe, expect, it } from "vitest"

const RealFunction = globalThis.Function
afterEach(() => {
  globalThis.Function = RealFunction
})

/** Counts `new Function(...)` from here on (zod reads the global each time). */
function countFunctionConstructs(): { count: number } {
  const seen = { count: 0 }
  globalThis.Function = new Proxy(RealFunction, {
    construct(target, args) {
      seen.count++
      return Reflect.construct(target, args)
    },
  })
  return seen
}

describe("zod in the browser (instrumentation-client)", () => {
  it("builds and parses object schemas with no new Function", async () => {
    await import("../../../instrumentation-client")
    const seen = countFunctionConstructs()
    const { z } = await import("zod")
    const schema = z.object({
      name: z.string().min(1, "Name is required"),
      email: z.string().email(),
      lines: z.array(z.object({ budget: z.number(), start: z.string() })).min(1),
    })
    expect(schema.safeParse({ name: "A", email: "a@example.com", lines: [{ budget: 1, start: "2026-12-01" }] }).success).toBe(true)
    const bad = schema.safeParse({ name: "", email: "nope", lines: [] })
    expect(bad.success).toBe(false)
    expect(bad.error!.issues.map((i) => i.path.join("."))).toEqual(["name", "email", "lines"])
    await expect(schema.parseAsync({ name: "A", email: "a@example.com", lines: [{ budget: 1, start: "x" }] })).resolves.toBeTruthy()
    expect(seen.count).toBe(0)
  })

  it("the counter does see zod's compiled parser when jitless is off (so the check above is not vacuous)", async () => {
    const { z } = await import("zod")
    z.config({ jitless: false })
    try {
      const seen = countFunctionConstructs()
      z.object({ a: z.string() }).safeParse({ a: "x" })
      expect(seen.count).toBeGreaterThan(0)
    } finally {
      z.config({ jitless: true })
    }
  })
})
