/**
 * Plan C S2-P3 — replace-set protocol + idempotency.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  analyseReplaceSetPayload,
  buildReplaceSetLogCheck,
  PLANC_REPLACESET_LOG_PREFIX,
  replaceSetForChannel,
  resolvePlanCReplaceSetMode,
  type ReplaceSetRow,
  type ReplaceSetTransport,
} from "@/lib/mediaplan/replaceSet"
import {
  pickIdempotencyKey,
  readIdempotencyFromMaster,
} from "@/lib/mediaplan/idempotency"
import {
  collectRowsForVersionReplace,
  isLiveChannelRow,
} from "@/lib/api/replaceChannelLineItems.pure"
import { filterByMbaAndVersion } from "@/lib/api/fetchChannelLineItemsByMba"

describe("resolvePlanCReplaceSetMode", () => {
  const prev = process.env.PLANC_REPLACE_SET
  afterEach(() => {
    if (prev === undefined) delete process.env.PLANC_REPLACE_SET
    else process.env.PLANC_REPLACE_SET = prev
  })

  it("defaults to off", () => {
    delete process.env.PLANC_REPLACE_SET
    expect(resolvePlanCReplaceSetMode()).toBe("off")
  })

  it("accepts log and on", () => {
    expect(resolvePlanCReplaceSetMode("log")).toBe("log")
    expect(resolvePlanCReplaceSetMode("on")).toBe("on")
  })
})

describe("analyseReplaceSetPayload", () => {
  it("flags duplicate line_uids", () => {
    const result = analyseReplaceSetPayload([
      { line_uid: "a" },
      { line_uid: "a" },
      { line_uid: "b" },
    ])
    expect(result.duplicateLineUids).toEqual(["a"])
  })
})

describe("superseded filtering", () => {
  it("collectRowsForVersionReplace excludes superseded", () => {
    const rows = [
      { id: 1, media_plan_version: 10, superseded: false },
      { id: 2, media_plan_version: 10, superseded: true },
      { id: 3, media_plan_version: 10 },
    ]
    expect(collectRowsForVersionReplace(rows, 10).map((r) => r.id)).toEqual([1, 3])
  })

  it("filterByMbaAndVersion excludes superseded (readers)", () => {
    const items = [
      { id: 1, mba_number: "MBA1", media_plan_version: 5, superseded: false },
      { id: 2, mba_number: "MBA1", media_plan_version: 5, superseded: true },
    ]
    const filtered = filterByMbaAndVersion(items, "MBA1", 1, 5)
    expect(filtered.map((r) => r.id)).toEqual([1])
  })

  it("isLiveChannelRow treats missing superseded as live", () => {
    expect(isLiveChannelRow({ id: 1 })).toBe(true)
    expect(isLiveChannelRow({ id: 1, superseded: true })).toBe(false)
  })
})

describe("idempotency helpers", () => {
  it("pickIdempotencyKey reads snake or camel", () => {
    expect(pickIdempotencyKey({ idempotencyKey: " abc " })).toBe("abc")
    expect(pickIdempotencyKey({ idempotency_key: "x" })).toBe("x")
    expect(pickIdempotencyKey({})).toBeNull()
  })

  it("readIdempotencyFromMaster returns prior key+result", () => {
    const rec = readIdempotencyFromMaster({
      last_idempotency_key: "k1",
      last_idempotency_result: { versionId: 9 },
    })
    expect(rec).toEqual({ key: "k1", result: { versionId: 9 } })
  })

  it("retry-same-key: matching key yields prior result (unit)", () => {
    const master = {
      last_idempotency_key: "same-key",
      last_idempotency_result: { mode: "overwrite", versionId: 42 },
    }
    const key = pickIdempotencyKey({ idempotencyKey: "same-key" })
    const prior = readIdempotencyFromMaster(master)
    expect(key).toBe("same-key")
    expect(prior?.key).toBe(key)
    expect(prior?.result).toEqual({ mode: "overwrite", versionId: 42 })
  })
})

describe("replaceSetForChannel", () => {
  let store: ReplaceSetRow[]
  let nextId: number
  let failSupersede: boolean
  let stageFailAt: number | null

  function makeTransport(): ReplaceSetTransport {
    return {
      async list(versionId) {
        return store.filter(
          (r) => Number(r.media_plan_version) === versionId && r.id != null
        )
      },
      async stage(rows) {
        const created: ReplaceSetRow[] = []
        for (let i = 0; i < rows.length; i++) {
          if (stageFailAt === i) {
            throw new Error("forced stage failure")
          }
          const row = { ...rows[i], id: nextId++ }
          store.push(row)
          created.push(row)
        }
        return created
      },
      async bulkSupersede(ids) {
        if (failSupersede) throw new Error("forced supersede failure")
        const idSet = new Set(ids.map(String))
        for (const row of store) {
          if (row.id != null && idSet.has(String(row.id))) {
            row.superseded = true
          }
        }
      },
      async deleteRows(ids) {
        const idSet = new Set(ids.map(String))
        store = store.filter((r) => r.id == null || !idSet.has(String(r.id)))
      },
    }
  }

  beforeEach(() => {
    store = []
    nextId = 1
    failSupersede = false
    stageFailAt = null
  })

  it("stages then supersedes prior; UI-deleted (empty) clears live rows", async () => {
    store = [
      {
        id: 10,
        media_plan_version: 100,
        mba_number: "MBA",
        line_uid: "old-1",
        superseded: false,
      },
    ]
    nextId = 20

    await replaceSetForChannel({
      table: "media_plan_television",
      mediaPlanVersionId: 100,
      mbaNumber: "MBA",
      rows: [{ line_uid: "new-1", media_plan_version: 100 }],
      transport: makeTransport(),
    })

    const live = store.filter(isLiveChannelRow)
    expect(live).toHaveLength(1)
    expect(live[0].line_uid).toBe("new-1")
    expect(store.find((r) => r.id === 10)?.superseded).toBe(true)

    // Empty payload = UI deleted all lines
    await replaceSetForChannel({
      table: "media_plan_television",
      mediaPlanVersionId: 100,
      mbaNumber: "MBA",
      rows: [],
      transport: makeTransport(),
    })
    expect(store.filter(isLiveChannelRow)).toHaveLength(0)
  })

  it("production rows are version-stamped", async () => {
    const result = await replaceSetForChannel({
      table: "media_plan_production",
      mediaPlanVersionId: 77,
      mbaNumber: "MBA",
      rows: [{ line_uid: "prod-1", description: "spot" }],
      transport: makeTransport(),
    })
    expect(result.staged[0].media_plan_version).toBe(77)
    expect(store[0].media_plan_version).toBe(77)
  })

  it("mid-failure leaves no staged orphans", async () => {
    store = [
      {
        id: 1,
        media_plan_version: 5,
        line_uid: "prior",
        superseded: false,
      },
    ]
    nextId = 50
    failSupersede = true

    await expect(
      replaceSetForChannel({
        table: "media_plan_television",
        mediaPlanVersionId: 5,
        mbaNumber: "MBA",
        rows: [{ line_uid: "staged-1" }],
        transport: makeTransport(),
      })
    ).rejects.toThrow(/forced supersede/)

    // Staged row removed; prior still live
    expect(store.some((r) => r.line_uid === "staged-1")).toBe(false)
    expect(store.find((r) => r.id === 1)?.superseded).not.toBe(true)
  })

  it("buildReplaceSetLogCheck reports prior vs payload", () => {
    const check = buildReplaceSetLogCheck({
      table: "media_plan_ooh",
      versionId: 1,
      rows: [{ line_uid: "a" }, { line_uid: "b" }],
      priorLive: [{ id: 1, line_uid: "old" }],
    })
    expect(check.payloadCount).toBe(2)
    expect(check.priorLiveCount).toBe(1)
    expect(PLANC_REPLACESET_LOG_PREFIX).toBe("[planc-replaceset]")
  })
})
