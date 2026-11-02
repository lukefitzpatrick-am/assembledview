/**
 * P6 — Draft save invariants that still apply after the Xano channel replace
 * was deleted (B5): the hydrate duplicate gate and line id reminting. The
 * editor saves through POST /api/plans/save only.
 */
import { describe, expect, it } from "vitest"

import {
  MEDIA_TYPE_ID_CODES,
  assignLineItemIdentities,
} from "@/lib/mediaplan/lineItemIds"
import {
  computeChannelDuplicateStats,
  isSaveAllowedAfterHydration,
} from "@/lib/mediaplan/channelHydrationGate"

const MBA = "PENFOLD016"

describe("draftSaveReplaceInvariants", () => {
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
