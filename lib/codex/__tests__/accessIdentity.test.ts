/**
 * PACK3fix (review K6): `loadAccessIdentity` counts a failed switch read as
 * off (the switch's own default), so a broken read never widens private
 * project access through aliases. Requires --experimental-test-module-mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

let flag: () => Promise<boolean> = async () => true

test("a failed codex_roster_aliases read is off: no alias map, even with aliases in the roster", { skip }, async () => {
  await mock.module!("@/lib/features/server", {
    namedExports: { isFeatureOn: (key: string) => (key === "codex_roster_aliases" ? flag() : Promise.resolve(false)) },
  })
  await mock.module!("@/lib/codex/rosterRead", {
    namedExports: {
      loadRosterPeople: async () => [{ email: "mia.tran@x.au", name: "Mia", aliases: ["mia@x.au"] }],
    },
  })
  const { loadAccessIdentity } = await import("../taskVisibility.js")
  const database = {} as never
  flag = async () => true
  assert.equal((await loadAccessIdentity(database)).get("mia@x.au"), "mia.tran@x.au", "on: the alias maps")
  flag = async () => false
  assert.equal((await loadAccessIdentity(database)).size, 0, "off: no map")
  flag = async () => {
    throw new Error("feature store down")
  }
  assert.equal((await loadAccessIdentity(database)).size, 0, "a failed read counts as off")
  assert.equal((await loadAccessIdentity(database, true)).size, 1, "a caller that already read the switch decides")
})
