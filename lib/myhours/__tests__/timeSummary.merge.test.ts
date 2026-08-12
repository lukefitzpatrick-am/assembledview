import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { mergeTeamHoursWithRoster } from "../hoursMath.js"

describe("mergeTeamHoursWithRoster", () => {
  it("renders zero hours for members with no entries (not missing)", () => {
    const roster = [
      { email: "Alice@Example.com", name: "Alice", active: true },
      { email: "bob@example.com", name: "Bob", active: true },
    ]
    const minutes = new Map<string, number>([["alice@example.com", 90]])
    const rows = mergeTeamHoursWithRoster(roster, minutes)
    assert.equal(rows.length, 2)
    const alice = rows.find((r) => r.email === "alice@example.com")
    const bob = rows.find((r) => r.email === "bob@example.com")
    assert.ok(alice)
    assert.ok(bob)
    assert.equal(alice!.hours, 1.5)
    assert.equal(bob!.hours, 0)
    assert.equal(bob!.duration_minutes, 0)
  })
})
