/**
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"
import { GOLF_CLIENT_ROWS } from "./golfClientRows.fixture"

const skip = mockModuleSkip()

const golfRowsWithBrain = GOLF_CLIENT_ROWS.map((row, i) =>
  i === 0
    ? { ...row, client_brain: "SECRET-BRAIN", client_brain_updated_at: "2026-01-01" }
    : row,
)

if (supportsMockModule()) {
  await mock.module!("@/lib/data/readClients", {
    namedExports: {
      readClientsList: async () => ({
        status: 200,
        body: golfRowsWithBrain,
        contentType: "application/json",
      }),
    },
  })
}

const loaded = supportsMockModule()
  ? await import("../fetchClientRowByUrlSlug.js")
  : null

test("fetchXanoClientRowByUrlSlug golf-australia returns group.anchor with brain stripped", { skip }, async () => {
  const row = await loaded!.fetchXanoClientRowByUrlSlug("golf-australia")
  assert.equal(row?.id, 19)
  assert.equal("client_brain" in (row ?? {}), false)
  assert.equal(row?.has_client_brain, true)
})

test("fetchXanoClientRowByUrlSlug golf uses mbaidentifier-slug", { skip }, async () => {
  const row = await loaded!.fetchXanoClientRowByUrlSlug("golf")
  assert.equal(row?.id, 19)
})

test("fetchClientGroupByUrlSlug sibling slug returns both member ids, brains stripped", { skip }, async () => {
  const group = await loaded!.fetchClientGroupByUrlSlug("golf-australia-self-run-campaigns")
  assert.ok(group)
  assert.equal(group.anchor.id, 46)
  assert.deepEqual(
    group.members.map((m) => Number(m.id)).sort((a, b) => a - b),
    [19, 46],
  )
  for (const member of [group.anchor, ...group.members]) {
    assert.equal("client_brain" in member, false)
  }
})

test("fetchXanoClientRowByUrlSlug unknown slug returns null", { skip }, async () => {
  const row = await loaded!.fetchXanoClientRowByUrlSlug("not-a-client")
  assert.equal(row, null)
})
