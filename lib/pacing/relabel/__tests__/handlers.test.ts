import assert from "node:assert/strict"
import test from "node:test"

import { RelabelApplyError } from "../applyGuard.js"
import {
  runRelabelApply,
  runRelabelRevert,
  type RelabelHandlerDeps,
} from "../handlers.js"
import {
  notifyRelabel,
  relabelNotifyTitle,
  shouldAutoCloseAppliedTask,
} from "../notify.js"
import { RelabelRevertError } from "../revert.js"
import type { RelabelPreview } from "../types.js"

const STAFF = "staff@assembledmedia.com.au"

function preview(overrides: Partial<RelabelPreview> = {}): RelabelPreview {
  return {
    channel: "Social - Meta",
    platformEntityId: "120256089860390550",
    entityName: "BICAU002 SM2",
    lineItemId: "bicau002sm2",
    mbaNumber: "bicau002",
    dateFrom: null,
    dateTo: null,
    cardChannel: "social",
    targetCardChannel: "social",
    moves: [
      {
        previousLineItemId: "bicau002sm1",
        dateFrom: "2026-08-04",
        dateTo: "2026-08-24",
        dayCount: 21,
        spend: 1200,
        impressions: 40000,
        rows: 21,
      },
    ],
    rowsMoving: 21,
    spendMoving: 1200,
    daysMoving: 21,
    warnings: [],
    blocks: [],
    duplicateOldNameDays: [],
    activeMap: null,
    publishedLine: {
      lineItemId: "bicau002sm2",
      mbaNumber: "bicau002",
      lineChannel: "social",
      cardChannel: "social",
      published: true,
      onPublishedVersion: true,
    },
    ...overrides,
  }
}

function baseDeps(store: {
  relabels: Array<Record<string, unknown>>
  logs: Array<Record<string, unknown>>
  tasks: Array<Record<string, unknown>>
  emails: unknown[]
}): RelabelHandlerDeps {
  return {
    previewRelabel: async () => preview(),
    applyRelabel: async (p) => {
      const row = {
        id: 7,
        status: "applied",
        mbaNumber: p.mbaNumber,
        entityName: p.entityName,
        toLineItemId: p.lineItemId,
        fromLineItemId: p.moves[0]?.previousLineItemId ?? null,
        reason: "fix attribution",
        actorEmail: STAFF,
        applyResult: { rowsUpdated: p.rowsMoving, rowsDeleted: 0, spendMoving: p.spendMoving },
      }
      store.relabels.push(row)
      store.logs.push({ relabelId: 7, action: "apply", actorEmail: STAFF, payload: {} })
      return {
        relabelId: 7,
        rowsUpdated: p.rowsMoving,
        rowsDeleted: 0,
        mapInserted: true,
        beforeState: {
          channel: p.channel,
          platformEntityId: p.platformEntityId,
          entityName: p.entityName,
          lineItemId: p.lineItemId,
          dateFrom: p.dateFrom,
          dateTo: p.dateTo,
          previousByRange: p.moves,
          priorActiveMap: null,
          deletedDuplicateRows: [],
        },
      }
    },
    revertRelabel: async (id, actorEmail) => {
      const row = store.relabels.find((r) => r.id === id)
      if (!row) throw new RelabelRevertError("not_found", "missing")
      row.status = "reverted"
      store.logs.push({ relabelId: id, action: "revert", actorEmail, payload: {} })
      return { relabelId: id, restoredRanges: 1, reinsertedRows: 0 }
    },
    listRelabels: async () => [],
    getRelabel: async (id) => {
      const row = store.relabels.find((r) => r.id === id)
      return (row as never) ?? null
    },
    insertLog: async (row) => {
      store.logs.push(row)
    },
    insertBlocked: async () => {
      throw new Error("unexpected block")
    },
    assertRelabelTablesAvailable: async () => {},
    lookupPublishedLine: async () => preview().publishedLine,
    query: async () => [],
    notify: notifyRelabel,
    notifyIo: {
      createTask: async (input) => {
        store.tasks.push(input)
        return { id: 99 }
      },
      sendHtmlEmail: async (params) => {
        store.emails.push(params)
      },
    },
  }
}

test("apply writes the relabel row, the apply log, a Codex task, and emails once", async () => {
  const store = { relabels: [] as Array<Record<string, unknown>>, logs: [] as Array<Record<string, unknown>>, tasks: [] as Array<Record<string, unknown>>, emails: [] as unknown[] }
  const res = await runRelabelApply(
    {
      channel: "Social - Meta",
      platformEntityId: "120256089860390550",
      lineItemId: "bicau002sm2",
      reason: "fix attribution",
    },
    STAFF,
    baseDeps(store),
  )
  assert.equal(res.status, 200)
  assert.equal(store.relabels.length, 1)
  assert.equal(store.relabels[0]?.status, "applied")
  assert.ok(store.logs.some((row) => row.action === "apply"))
  assert.equal(store.tasks.length, 1)
  assert.match(String(store.tasks[0]?.title), /Relabel applied: bicau002 BICAU002 SM2 → bicau002sm2/)
  assert.equal(store.emails.length, 1)
})

test("revert flips status and logs", async () => {
  const store = { relabels: [] as Array<Record<string, unknown>>, logs: [] as Array<Record<string, unknown>>, tasks: [] as Array<Record<string, unknown>>, emails: [] as unknown[] }
  const deps = baseDeps(store)
  await runRelabelApply(
    {
      channel: "Social - Meta",
      platformEntityId: "120256089860390550",
      lineItemId: "bicau002sm2",
      reason: "fix attribution",
    },
    STAFF,
    deps,
  )
  store.tasks.length = 0
  store.emails.length = 0
  const res = await runRelabelRevert(7, STAFF, deps)
  assert.equal(res.status, 200)
  assert.equal(store.relabels[0]?.status, "reverted")
  assert.ok(store.logs.some((row) => row.action === "revert"))
  assert.equal(store.emails.length, 1)
  assert.match(relabelNotifyTitle({
    kind: "reverted",
    relabelId: 7,
    mbaNumber: "bicau002",
    entityName: "BICAU002 SM2",
    lineItemId: "bicau002sm2",
    actorEmail: STAFF,
    reason: "fix attribution",
    rowsMoved: 21,
    spendMoved: 1200,
    duplicatesRemoved: 0,
    beforeLineItemId: "bicau002sm1",
    afterLineItemId: "bicau002sm2",
  }), /Relabel reverted/)
})

test("apply with preview blocks writes a blocked row and notifies without applying", async () => {
  const store = { relabels: [] as Array<Record<string, unknown>>, logs: [] as Array<Record<string, unknown>>, tasks: [] as Array<Record<string, unknown>>, emails: [] as unknown[] }
  const deps = baseDeps(store)
  deps.previewRelabel = async () =>
    preview({ blocks: [{ code: "channel_mismatch", message: "no" }] })
  deps.insertBlocked = async (args) => {
    const row = {
      id: 8,
      status: "blocked" as const,
      channel: args.channel,
      platformEntityId: args.platformEntityId,
      entityName: args.entityName,
      fromLineItemId: args.fromLineItemId,
      toLineItemId: args.toLineItemId,
      mbaNumber: args.mbaNumber,
      dateFrom: args.dateFrom,
      dateTo: args.dateTo,
      reason: args.reason,
      actorEmail: args.actorEmail,
      beforeState: args.beforeState,
      applyResult: args.applyResult,
      createdAt: "2026-09-21T00:00:00.000Z",
      revertedAt: null,
      revertedByEmail: null,
    }
    store.relabels.push(row)
    store.logs.push({ relabelId: 8, action: "block", actorEmail: args.actorEmail, payload: args.applyResult })
    return row
  }
  deps.applyRelabel = async () => {
    throw new RelabelApplyError("blocked", "should not apply")
  }
  const res = await runRelabelApply(
    {
      channel: "Social - Meta",
      platformEntityId: "120256089860390550",
      lineItemId: "bicau002sm2",
      reason: "fix attribution",
    },
    STAFF,
    deps,
  )
  assert.equal(res.status, 409)
  assert.equal(store.relabels[0]?.status, "blocked")
  assert.ok(store.logs.some((row) => row.action === "block"))
  assert.equal(store.emails.length, 1)
  assert.match(String(store.tasks[0]?.title), /Relabel blocked/)
})

test("applied relabel tasks auto-close after 7 untouched days; blocked stay open", () => {
  assert.equal(
    shouldAutoCloseAppliedTask(
      {
        avaAutoKey: "relabel:applied:7",
        status: "todo",
        createdAt: "2026-09-14T00:00:00.000Z",
        updatedAt: "2026-09-14T00:00:00.000Z",
      },
      "2026-09-21",
    ),
    true,
  )
  assert.equal(
    shouldAutoCloseAppliedTask(
      {
        avaAutoKey: "relabel:blocked:8",
        status: "todo",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      },
      "2026-09-21",
    ),
    false,
  )
})
