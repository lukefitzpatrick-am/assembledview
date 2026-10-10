import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { PlanDraftStateV1 } from "../types.js"
import {
  createBrowserDraftKey,
  createDraftExportFilename,
  exportCreateDraftFile,
  importCreateDraftFile,
  migrateLegacyCreateDraftRecords,
  removeCreateBrowserDraft,
  upsertCreateBrowserDraft,
  type CreateDraftRow,
} from "../createBrowserDraft.js"

function state(over: Partial<PlanDraftStateV1> = {}): PlanDraftStateV1 {
  return {
    v: 1,
    mbaNumber: "KRUSTY014",
    masterId: null,
    baseVersionId: null,
    formValues: {
      mp_client_name: "Krusty Krab",
      mp_campaignname: "Summer",
      ...(over.formValues ?? {}),
    },
    channels: over.channels ?? { search: [{ line_item_id: "a" }] },
    meta: { lineCount: 1, budgetCents: 0, ...(over.meta ?? {}) },
  }
}

describe("create browser drafts", () => {
  it("two draft ids for the same client do not overwrite each other", () => {
    const store = new Map<string, CreateDraftRow>()
    const five = state({
      channels: {
        search: [
          { line_item_id: "1" },
          { line_item_id: "2" },
          { line_item_id: "3" },
          { line_item_id: "4" },
          { line_item_id: "5" },
        ],
      },
    })
    const two = state({ channels: { search: [{ line_item_id: "1" }, { line_item_id: "2" }] } })
    upsertCreateBrowserDraft(store, {
      draftId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      userId: "luke@assembled.media",
      state: five,
      updatedAt: "2026-10-10T01:00:00.000Z",
    })
    upsertCreateBrowserDraft(store, {
      draftId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      userId: "luke@assembled.media",
      state: two,
      updatedAt: "2026-10-10T02:00:00.000Z",
    })
    assert.equal(store.size, 2)
    assert.notEqual(
      createBrowserDraftKey("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "luke@assembled.media"),
      createBrowserDraftKey("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "luke@assembled.media"),
    )
    const first = store.get(
      createBrowserDraftKey("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "luke@assembled.media"),
    )
    assert.equal(Object.values(first?.state.channels ?? {}).flat().length, 5)
    assert.equal(first?.clientName, "Krusty Krab")
    assert.equal(first?.previewMba, "KRUSTY014")
    assert.equal(first?.lineCount, 5)
  })

  it("the old mba key migrates without dropping the payload", () => {
    const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"]
    let n = 0
    const legacy: CreateDraftRow[] = [
      {
        key: "mba:KRUSTY014::luke@assembled.media",
        updatedAt: "2026-10-09T00:00:00.000Z",
        state: state(),
      },
      {
        key: "mba:KRUSTY015::luke@assembled.media",
        updatedAt: "2026-10-08T00:00:00.000Z",
        state: state({ formValues: { mp_campaignname: "Other" }, mbaNumber: "KRUSTY015" }),
      },
      {
        key: "mba:KRUSTY014::other@assembled.media",
        updatedAt: "2026-10-07T00:00:00.000Z",
        state: state(),
      },
      {
        key: "m283::luke@assembled.media",
        updatedAt: "2026-10-07T00:00:00.000Z",
        state: state({ masterId: 283 }),
      },
    ]
    const { next, migrated } = migrateLegacyCreateDraftRecords(
      legacy,
      "luke@assembled.media",
      () => ids[n++]!,
    )
    console.log(`create-draft migration count: ${migrated}`)
    assert.equal(migrated, 2)
    assert.equal(next.length, 4)
    assert.equal(next.some((row) => row.key.startsWith("mba:KRUSTY014::luke")), false)
    assert.equal(
      next.some((row) => row.key === "draft:11111111-1111-4111-8111-111111111111::luke@assembled.media"),
      true,
    )
    assert.equal(next.some((row) => row.key === "mba:KRUSTY014::other@assembled.media"), true)
    assert.equal(next.some((row) => row.key === "m283::luke@assembled.media"), true)
    const moved = next.find((row) => row.draftId === ids[0])
    assert.equal(moved?.previewMba, "KRUSTY014")
    assert.equal(moved?.state.formValues.mp_client_name, "Krusty Krab")
  })

  it("export then import round-trips the payload", () => {
    const payload = state()
    const file = exportCreateDraftFile(payload)
    assert.equal(file.schemaVersion, 1)
    const back = importCreateDraftFile(JSON.parse(JSON.stringify(file)))
    assert.equal(back.ok, true)
    if (back.ok) assert.deepEqual(back.payload, payload)
    const wrong = importCreateDraftFile({ schemaVersion: 2, payload })
    assert.equal(wrong.ok, false)
    if (!wrong.ok) {
      assert.match(wrong.error, /different version/)
    }
    assert.equal(
      createDraftExportFilename("Krusty Krab", "Summer"),
      "DRAFT - Krusty Krab - Summer - draft.json",
    )
  })

  it("publish clears that draft id and leaves the other tab", () => {
    const store = new Map<string, CreateDraftRow>()
    const userId = "luke@assembled.media"
    upsertCreateBrowserDraft(store, {
      draftId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      userId,
      state: state(),
      updatedAt: "2026-10-10T01:00:00.000Z",
    })
    upsertCreateBrowserDraft(store, {
      draftId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      userId,
      state: state({ channels: { search: [{ line_item_id: "only" }] } }),
      updatedAt: "2026-10-10T02:00:00.000Z",
    })
    removeCreateBrowserDraft(store, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", userId)
    assert.equal(store.size, 1)
    assert.equal(
      store.has(createBrowserDraftKey("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", userId)),
      true,
    )
  })
})
