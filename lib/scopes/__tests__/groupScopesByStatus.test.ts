import assert from "node:assert/strict"
import test from "node:test"
import { groupScopesByStatus, KNOWN_SCOPE_STATUSES } from "../groupScopesByStatus.js"

test("known statuses group under their canonical labels", () => {
  const groups = groupScopesByStatus([
    { id: 1, project_status: "draft" },
    { id: 2, project_status: "In-Progress" },
    { id: 3, project_status: "approved" },
  ])
  const byStatus = Object.fromEntries(groups.map((g) => [g.status, g.scopes.map((s) => s.id)]))
  assert.deepEqual(byStatus.Draft, [1])
  assert.deepEqual(byStatus["In-Progress"], [2])
  assert.deepEqual(byStatus.Approved, [3])
  assert.ok(KNOWN_SCOPE_STATUSES.includes("Draft"))
})

test("unknown status still appears under Other / unrecognised (never dropped)", () => {
  const groups = groupScopesByStatus([
    { id: 10, project_status: "On Hold" },
    { id: 11, project_status: "waiting-client" },
    { id: 12, project_status: "Approved" },
  ])
  const other = groups.find((g) => g.status === "Other / unrecognised")
  assert.ok(other, "Other / unrecognised group must exist")
  assert.deepEqual(
    other!.scopes.map((s) => s.id).sort((a, b) => a - b),
    [10, 11],
  )
  const approved = groups.find((g) => g.status === "Approved")
  assert.deepEqual(approved?.scopes.map((s) => s.id), [12])
})

test("empty or missing status is treated as unknown, not silently dropped", () => {
  const groups = groupScopesByStatus([
    { id: 1, project_status: "" },
    { id: 2, project_status: undefined },
  ])
  const other = groups.find((g) => g.status === "Other / unrecognised")
  assert.ok(other)
  assert.equal(other!.scopes.length, 2)
})
