/**
 * P6 — Draft save / replace invariants (integration-style).
 * Channel replace is deleted; the live cases assert that throw.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import { replaceChannelLineItems, saveTelevisionLineItems } from "@/lib/api"
import {
  buildReplaceListQueryParams,
  collectRowsForVersionReplace,
} from "@/lib/api/replaceChannelLineItems.pure"
import {
  MEDIA_TYPE_ID_CODES,
  assignLineItemIdentities,
} from "@/lib/mediaplan/lineItemIds"
import {
  computeChannelDuplicateStats,
  isSaveAllowedAfterHydration,
} from "@/lib/mediaplan/channelHydrationGate"

const MBA = "PENFOLD016"
const CLIENT = "Penfold"
const PLAN = "1"
const VERSION_ID = 1020
const CHANNEL = "media_plan_television"
const BASE = `http://localhost/test/${CHANNEL}`

type StoreRow = {
  id: number
  line_item_id?: unknown
  mba_number?: unknown
  media_plan_version?: unknown
  mp_plannumber?: unknown
  version_number?: unknown
  [key: string]: unknown
}

type FetchLogEntry = {
  method: string
  url: string
  body?: unknown
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function lineItemIdSet(rows: StoreRow[]): string[] {
  return rows
    .map((r) => String(r.line_item_id ?? "").trim())
    .filter(Boolean)
    .sort()
}

function tvLine(
  lineItemId: string,
  lineItem: number,
  over: Record<string, unknown> = {}
) {
  return {
    line_item_id: lineItemId,
    line_item: lineItem,
    network: `net-${lineItem}`,
    bursts: [],
    ...over,
  }
}

describe("draftSaveReplaceInvariants", () => {
  let store: StoreRow[]
  let nextId: number
  let fetchLog: FetchLogEntry[]
  let failDeleteIds: Set<number>

  beforeEach(() => {
    store = []
    nextId = 1
    fetchLog = []
    failDeleteIds = new Set()

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = String(init?.method ?? "GET").toUpperCase()
        let body: unknown
        if (init?.body != null && method !== "GET" && method !== "DELETE") {
          try {
            body = JSON.parse(String(init.body))
          } catch {
            body = init.body
          }
        }
        fetchLog.push({ method, url, body })

        const u = new URL(url, "http://localhost")
        const path = u.pathname.replace(/\/+$/, "")
        const idMatch = path.match(new RegExp(`/${CHANNEL}/(\\d+)$`))
        const isChannelRoot =
          path.endsWith(`/${CHANNEL}`) || path === `/${CHANNEL}`

        if (method === "GET" && isChannelRoot) {
          const mba = u.searchParams.get("mba_number")
          const rows =
            mba != null && mba !== ""
              ? store.filter((r) => String(r.mba_number ?? "") === mba)
              : [...store]
          return jsonResponse(rows)
        }

        if (method === "DELETE" && idMatch) {
          const id = Number(idMatch[1])
          if (failDeleteIds.has(id)) {
            return jsonResponse({ error: `delete failed for ${id}` }, 500)
          }
          store = store.filter((r) => r.id !== id)
          return jsonResponse({ ok: true })
        }

        if (method === "POST" && isChannelRoot) {
          const row = { ...(body as Record<string, unknown>), id: nextId++ } as StoreRow
          store.push(row)
          return jsonResponse(row)
        }

        return jsonResponse({ error: `unexpected ${method} ${url}` }, 404)
      })
    )
  })

  it("1. save → save → save yields identical channel row sets (PENFOLD016)", async () => {
    await expect(saveTelevisionLineItems(VERSION_ID, MBA, CLIENT, PLAN, [])).rejects.toThrow(
      /deleted/
    )
    return
    const ui = [
      tvLine("PENFOLD016TV1", 1),
      tvLine("PENFOLD016TV2", 2),
      tvLine("PENFOLD016TV3", 3),
    ]

    await saveTelevisionLineItems(VERSION_ID, MBA, CLIENT, PLAN, ui)
    const snap1 = { count: store.length, ids: lineItemIdSet(store) }

    await saveTelevisionLineItems(VERSION_ID, MBA, CLIENT, PLAN, ui)
    const snap2 = { count: store.length, ids: lineItemIdSet(store) }

    await saveTelevisionLineItems(VERSION_ID, MBA, CLIENT, PLAN, ui)
    const snap3 = { count: store.length, ids: lineItemIdSet(store) }

    expect(snap1).toEqual({
      count: 3,
      ids: ["PENFOLD016TV1", "PENFOLD016TV2", "PENFOLD016TV3"],
    })
    expect(snap2).toEqual(snap1)
    expect(snap3).toEqual(snap1)
  })

  it("2. UI line removal → save removes the row", async () => {
    await expect(saveTelevisionLineItems(VERSION_ID, MBA, CLIENT, PLAN, [])).rejects.toThrow(
      /deleted/
    )
    return
    const a = tvLine("PENFOLD016TV1", 1)
    const b = tvLine("PENFOLD016TV2", 2)

    await saveTelevisionLineItems(VERSION_ID, MBA, CLIENT, PLAN, [a, b])
    expect(store).toHaveLength(2)

    await saveTelevisionLineItems(VERSION_ID, MBA, CLIENT, PLAN, [a])
    expect(store).toHaveLength(1)
    expect(lineItemIdSet(store)).toEqual(["PENFOLD016TV1"])
  })

  it("3. reorder → save keeps every line_item_id", async () => {
    await expect(saveTelevisionLineItems(VERSION_ID, MBA, CLIENT, PLAN, [])).rejects.toThrow(
      /deleted/
    )
    return
    const a = tvLine("PENFOLD016TV1", 1)
    const b = tvLine("PENFOLD016TV2", 2)
    const c = tvLine("PENFOLD016TV3", 3)

    await saveTelevisionLineItems(VERSION_ID, MBA, CLIENT, PLAN, [a, b, c])
    await saveTelevisionLineItems(VERSION_ID, MBA, CLIENT, PLAN, [c, a, b])

    expect(store).toHaveLength(3)
    expect(lineItemIdSet(store)).toEqual([
      "PENFOLD016TV1",
      "PENFOLD016TV2",
      "PENFOLD016TV3",
    ])
  })

  it("4. failed DELETE aborts before any POST (no partial replace)", async () => {
    await expect(replaceChannelLineItems(CHANNEL, VERSION_ID, [], MBA)).rejects.toThrow(/deleted/)
    return
    store = [
      {
        id: 50,
        media_plan_version: VERSION_ID,
        mba_number: MBA,
        line_item_id: "PENFOLD016TV1",
      },
      {
        id: 51,
        media_plan_version: VERSION_ID,
        mba_number: MBA,
        line_item_id: "PENFOLD016TV2",
      },
    ]
    nextId = 100
    failDeleteIds.add(51)

    await expect(
      replaceChannelLineItems(
        CHANNEL,
        VERSION_ID,
        [{ media_plan_version: VERSION_ID, mba_number: MBA, line_item_id: "PENFOLD016TV9" }],
        MBA
      )
    ).rejects.toThrow(/aborted POST|Failed to delete/i)

    const posts = fetchLog.filter((e) => e.method === "POST")
    expect(posts).toHaveLength(0)
    // Target-version rows may be partially deleted, but no new rows may land.
    expect(store.every((r) => r.id === 50 || r.id === 51)).toBe(true)
    expect(store.some((r) => r.line_item_id === "PENFOLD016TV9")).toBe(false)
  })

  it("5. replace deletes ONLY rows whose media_plan_version FK equals target id", async () => {
    await expect(replaceChannelLineItems(CHANNEL, VERSION_ID, [], MBA)).rejects.toThrow(/deleted/)
    return
    const target = VERSION_ID
    const otherFk = 9999
    store = [
      {
        id: 1,
        media_plan_version: target,
        mba_number: MBA,
        mp_plannumber: PLAN,
        line_item_id: "TARGET-A",
      },
      {
        id: 2,
        media_plan_version: otherFk,
        mba_number: MBA,
        mp_plannumber: String(target), // plan-number collision — must NOT delete
        version_number: target,
        line_item_id: "OTHER-FK",
      },
      {
        id: 3,
        // unversioned legacy — no media_plan_version FK
        mba_number: MBA,
        mp_plannumber: PLAN,
        version_number: target,
        line_item_id: "LEGACY-UNVERSIONED",
      },
      {
        id: 4,
        media_plan_version: String(target),
        mba_number: MBA,
        line_item_id: "TARGET-B",
      },
    ]
    nextId = 200

    // Pure filter agrees with replace semantics
    expect(
      collectRowsForVersionReplace(store, target)
        .map((r) => r.id)
        .sort()
    ).toEqual([1, 4])

    await replaceChannelLineItems(CHANNEL, target, [], MBA)

    const remainingIds = store.map((r) => r.id).sort((a, b) => a - b)
    expect(remainingIds).toEqual([2, 3])
    expect(store.map((r) => r.line_item_id).sort()).toEqual([
      "LEGACY-UNVERSIONED",
      "OTHER-FK",
    ])
  })

  it("6. replace GET includes mba_number in its query", async () => {
    await expect(replaceChannelLineItems(CHANNEL, VERSION_ID, [], MBA)).rejects.toThrow(/deleted/)
    return
    const params = buildReplaceListQueryParams(VERSION_ID, MBA)
    expect(params.mba_number).toBe(MBA)
    expect(params.media_plan_version).toBe(VERSION_ID)

    await replaceChannelLineItems(CHANNEL, VERSION_ID, [], MBA)

    const gets = fetchLog.filter((e) => e.method === "GET")
    expect(gets.length).toBeGreaterThan(0)
    for (const g of gets) {
      const u = new URL(g.url, "http://localhost")
      expect(u.searchParams.get("mba_number")).toBe(MBA)
    }
  })

  it("7. duplicated hydrate input blocks Save; prune to unique ids unblocks", () => {
    const inflated = [
      { line_item_id: "PENFOLD016OH1" },
      { line_item_id: "PENFOLD016OH1" }, // same id twice
    ]
    const dup = computeChannelDuplicateStats({ ooh: inflated })
    expect(dup.duplicatesDetected).toBe(true)
    expect(dup.perChannel.ooh).toEqual({ rows: 2, distinctLineItemIds: 1 })
    expect(isSaveAllowedAfterHydration(true, { duplicatesDetected: dup.duplicatesDetected })).toBe(
      false
    )

    const pruned = [{ line_item_id: "PENFOLD016OH1" }]
    const clean = computeChannelDuplicateStats({ ooh: pruned })
    expect(clean.duplicatesDetected).toBe(false)
    expect(
      isSaveAllowedAfterHydration(true, { duplicatesDetected: clean.duplicatesDetected })
    ).toBe(true)
  })

  it("8. two UI lines with the same persisted id → second reminted max+1", () => {
    const warns: string[] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => {
      warns.push(args.map(String).join(" "))
    }
    try {
      const ids = assignLineItemIdentities(
        [
          { line_item_id: "PENFOLD016TV3", line_item: 3 },
          { line_item_id: "PENFOLD016TV3", line_item: 3 },
        ],
        MBA,
        MEDIA_TYPE_ID_CODES.television
      )
      expect(ids[0].line_item_id).toBe("PENFOLD016TV3")
      expect(ids[1].line_item_id).toBe("PENFOLD016TV4")
      expect(ids[1].line_item).toBe(4)
      expect(warns.some((w) => /collision|duplicate|same-id/i.test(w))).toBe(true)
    } finally {
      console.warn = originalWarn
    }
  })
})
