import { describe, expect, it } from "vitest"
import { resolveClientsIdByMbaIdentifier } from "../resolveClientsIdByMbaIdentifier"

describe("resolveClientsIdByMbaIdentifier", () => {
  const clients = [
    { id: 1, mbaidentifier: "kr" },
    { id: 8, mbaidentifier: "krusty" },
    { id: 9, mbaidentifier: "other" },
  ]

  it("returns longest mbaidentifier prefix match", () => {
    expect(resolveClientsIdByMbaIdentifier("krusty006", clients)).toBe(8)
  })

  it("returns null when no prefix matches", () => {
    expect(resolveClientsIdByMbaIdentifier("unknown001", clients)).toBeNull()
  })

  it("returns null for empty mba", () => {
    expect(resolveClientsIdByMbaIdentifier("  ", clients)).toBeNull()
  })
})
