import assert from "node:assert/strict"
import test from "node:test"

import * as schema from "@/db/schema"
import {
  insertPacingOrphanFix,
  selectPacingOrphanFixes,
  type PacingOrphanFixDb,
} from "../pacingOrphanFixRows"

test("orphan assignment is visible on the next read", async () => {
  const stored: Record<string, unknown>[] = []
  let nextId = 1
  const db: PacingOrphanFixDb = {
    insert: (table) => {
      assert.equal(table, schema.pacingOrphanFixes)
      return {
        values: (row) => ({
          returning: async () => {
            const saved = {
              id: nextId++,
              createdAt: "2026-09-23T00:00:00.000Z",
              ...row,
            }
            stored.push(saved)
            return [saved]
          },
        }),
      }
    },
    select: () => ({
      from: async (table) => {
        assert.equal(table, schema.pacingOrphanFixes)
        return stored
      },
    }),
  }

  const created = await insertPacingOrphanFix(db, {
    adminUserEmail: "admin@assembledmedia.com",
    channel: "search",
    platformLineItemId: "pli-9",
    previousLineItemId: null,
    newLineItemId: "search-line-1",
    adGroupName: "Brand",
    campaignName: "Always On",
    note: "matched live line",
  })

  const rows = await selectPacingOrphanFixes(db)
  const visible = rows.find((row) => row.id === created.id)
  assert.ok(visible)
  assert.equal(visible?.new_line_item_id, "search-line-1")
  assert.equal(visible?.platform_line_item_id, "pli-9")
  assert.equal(visible?.channel, "search")
  assert.equal(visible?.admin_user_email, "admin@assembledmedia.com")
})
