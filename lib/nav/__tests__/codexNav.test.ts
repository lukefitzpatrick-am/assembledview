import assert from "node:assert/strict"
import test from "node:test"

import { withCodexNav } from "../codexNav"

const groups = [
  { label: "Work", items: [{ path: "/tasks" }, { path: "/pacing" }] },
  { label: "Codex only", items: [{ path: "/tasks" }] },
]

const paths = (gs: typeof groups) => gs.map((g) => g.items.map((i) => i.path))

test("flag on and admin: Codex shows", () => {
  assert.deepEqual(paths(withCodexNav(groups, { codexEnabled: true, roles: ["admin"] })), [
    ["/tasks", "/pacing"],
    ["/tasks"],
  ])
})

test("flag off: Codex is hidden even for admins, empty groups drop", () => {
  assert.deepEqual(paths(withCodexNav(groups, { codexEnabled: false, roles: ["admin"] })), [["/pacing"]])
})

test("flag on without shadow access: Codex is hidden", () => {
  assert.deepEqual(paths(withCodexNav(groups, { codexEnabled: true, roles: ["manager"] })), [["/pacing"]])
  assert.deepEqual(paths(withCodexNav(groups, { codexEnabled: true, roles: null })), [["/pacing"]])
})
