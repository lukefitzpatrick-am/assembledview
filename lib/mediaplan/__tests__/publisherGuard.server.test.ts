/**
 * B19 Q4: publisherGuardForSave reads the switch and a fresh publisher list
 * only on publish, and lets the save through when either read fails.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { publisherGuardForSave, type PublisherGuardDeps } from "@/lib/mediaplan/publisherGuard.server"

const LINES = [
  { lineItemId: "DD1", channel: "digi_display", publisher: "Nine Digital" },
  { lineItemId: "S1", channel: "search", platform: "" },
]

function deps(over: Partial<PublisherGuardDeps> & { calls?: { isOn: number; load: number } }) {
  const calls = over.calls ?? { isOn: 0, load: 0 }
  const d: PublisherGuardDeps = {
    isOn: async () => {
      calls.isOn += 1
      return over.isOn ? over.isOn() : true
    },
    loadPublishers: async () => {
      calls.load += 1
      return over.loadPublishers ? over.loadPublishers() : [{ id: 11, publisher_name: "Nine", publisherid: "nine" }]
    },
  }
  return { d, calls }
}

describe("publisherGuardForSave", () => {
  it("draft and new_version read nothing and pass", async () => {
    for (const mode of ["draft", "new_version"] as const) {
      const { d, calls } = deps({})
      assert.deepEqual(await publisherGuardForSave(mode, LINES, d), { reject: false, warnings: [] })
      assert.deepEqual(calls, { isOn: 0, load: 0 })
    }
  })

  it("switch off: reads the switch, not the publishers, and passes", async () => {
    const { d, calls } = deps({ isOn: async () => false })
    assert.deepEqual(await publisherGuardForSave("publish", LINES, d), { reject: false, warnings: [] })
    assert.deepEqual(calls, { isOn: 1, load: 0 })
  })

  it("switch on: blocks the unknown name", async () => {
    const { d, calls } = deps({})
    const r = await publisherGuardForSave("publish", LINES, d)
    assert.equal(r.reject, true)
    if (r.reject) assert.deepEqual(r.body.lineItemIds, ["DD1"])
    assert.deepEqual(calls, { isOn: 1, load: 1 })
  })

  it("switch on: only a blank media line passes with its warning", async () => {
    const { d } = deps({})
    const r = await publisherGuardForSave("publish", [LINES[1]], d)
    assert.equal(r.reject, false)
    if (!r.reject) assert.deepEqual(r.warnings.map((w) => w.lineItemId), ["S1"])
  })

  it("a failed switch read counts as off", async () => {
    const { d, calls } = deps({ isOn: async () => { throw new Error("db down") } })
    assert.deepEqual(await publisherGuardForSave("publish", LINES, d), { reject: false, warnings: [] })
    assert.equal(calls.load, 0)
  })

  it("a failed publisher read lets the save through", async () => {
    const { d } = deps({ loadPublishers: async () => { throw new Error("db down") } })
    assert.deepEqual(await publisherGuardForSave("publish", LINES, d), { reject: false, warnings: [] })
  })
})
