import assert from "node:assert/strict"
import { test } from "node:test"

import { inboxPageEnvelope } from "../inboxPage.js"
import { dismissAllProposedForNotePure } from "../proposals.js"

test("inboxPageEnvelope pendingCount is the full set, not the loaded page", () => {
  const page = inboxPageEnvelope({
    groups: [{ note_id: 1 }, { note_id: 2 }],
    pendingCount: 1307,
    itemsTotal: 80,
    page: 1,
    perPage: 20,
  })
  assert.equal(page.groups.length, 2)
  assert.equal(page.pendingCount, 1307)
  assert.equal(page.itemsTotal, 80)
  assert.equal(page.curPage, 1)
  assert.equal(page.pageTotal, 4)
  assert.equal(page.nextPage, 2)
})

test("dismiss-all marks the full note set in one bulk call, not per-id", async () => {
  let bulkCalls = 0
  let seenNoteId = 0
  const result = await dismissAllProposedForNotePure(
    { noteId: 42, decidedByEmail: "admin@assembledmedia.com.au" },
    {
      markDismissedBulk: async (noteId, patch) => {
        bulkCalls += 1
        seenNoteId = noteId
        assert.equal(patch.status, "rejected")
        assert.equal(patch.decidedByEmail, "admin@assembledmedia.com.au")
        assert.ok(patch.decidedAt)
        assert.equal(
          (patch.decisionDiff as { action?: string }).action,
          "dismiss"
        )
        return 47
      },
    }
  )
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.dismissed, 47)
  assert.equal(bulkCalls, 1)
  assert.equal(seenNoteId, 42)
})

test("dismiss-all never creates a task", async () => {
  const result = await dismissAllProposedForNotePure(
    { noteId: 1, decidedByEmail: "a@x.com" },
    {
      markDismissedBulk: async () => 3,
    }
  )
  assert.equal(result.ok, true)
})
