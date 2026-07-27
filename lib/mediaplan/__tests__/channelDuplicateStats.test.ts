import { describe, expect, it } from "vitest"

import {
  computeAllChannelsHydrated,
  computeChannelDuplicateStats,
  formatSaveModeLabel,
  isSaveAllowedAfterHydration,
  reconciliationBadgeVisibility,
} from "@/lib/mediaplan/channelHydrationGate"

describe("channelDuplicateStats", () => {
  it("computeChannelDuplicateStats: clean channel has rows === distinct ids", () => {
    const summary = computeChannelDuplicateStats({
      ooh: [
        { line_item_id: "PENFOLD016OH1" },
        { line_item_id: "PENFOLD016OH2" },
      ],
    })
    expect(summary.duplicatesDetected).toBe(false)
    expect(summary.perChannel.ooh).toEqual({ rows: 2, distinctLineItemIds: 2 })
    expect(summary.duplicateChannels).toHaveLength(0)
  })

  it("computeChannelDuplicateStats: detects OOH 44/22 style inflation", () => {
    const rows: { line_item_id: string }[] = []
    for (let i = 1; i <= 22; i++) {
      rows.push({ line_item_id: `PENFOLD016OH${i}` })
      rows.push({ line_item_id: `PENFOLD016OH${i}` }) // duplicate stamp
    }
    expect(rows).toHaveLength(44)

    const summary = computeChannelDuplicateStats({
      ooh: rows,
      search: [{ line_item_id: "PENFOLD016SE1" }],
    })
    expect(summary.duplicatesDetected).toBe(true)
    expect(summary.perChannel.ooh).toEqual({ rows: 44, distinctLineItemIds: 22 })
    expect(summary.perChannel.search).toEqual({ rows: 1, distinctLineItemIds: 1 })
    expect(summary.duplicateChannels).toHaveLength(1)
    expect(summary.duplicateChannels[0].channel).toBe("ooh")
    expect(summary.inflatedRows).toBe(44)
    expect(summary.inflatedDistinctIds).toBe(22)
  })

  it("computeChannelDuplicateStats: blank line_item_ids count as distinct empty once each row", () => {
    // Rows without ids cannot collapse — each blank is its own row identity gap.
    // Spec: distinct line_item_ids — empty string should not count as a shared id.
    const summary = computeChannelDuplicateStats({
      television: [{ line_item_id: "" }, { line_item_id: "" }, { line_item_id: "TV1" }],
    })
    expect(summary.perChannel.television.rows).toBe(3)
    // Only one non-empty distinct id; blanks are excluded from the distinct set → 3 > 1
    expect(summary.perChannel.television.distinctLineItemIds).toBe(1)
    expect(summary.duplicatesDetected).toBe(true)
  })

  it("reconciliationBadgeVisibility: duplicatesDetected suppresses green tick", () => {
    expect(reconciliationBadgeVisibility(true, true, { duplicatesDetected: true })).toEqual({
      showEquals: false,
      showMismatch: false,
    })
    expect(reconciliationBadgeVisibility(true, true, { duplicatesDetected: false })).toEqual({
      showEquals: true,
      showMismatch: false,
    })
  })

  it("isSaveAllowedAfterHydration: blocked when duplicatesDetected", () => {
    expect(isSaveAllowedAfterHydration(true, { duplicatesDetected: true })).toBe(false)
    expect(isSaveAllowedAfterHydration(true, { duplicatesDetected: false })).toBe(true)
    expect(isSaveAllowedAfterHydration(false, { duplicatesDetected: false })).toBe(false)
  })

  it("Save gate re-evaluates live editor set: corrupted 44/22 blocks, prune to unique enables", () => {
    const corruptedRows: { line_item_id: string }[] = []
    for (let i = 1; i <= 22; i++) {
      corruptedRows.push({ line_item_id: `PENFOLD016OH${i}` })
      corruptedRows.push({ line_item_id: `PENFOLD016OH${i}` })
    }
    expect(corruptedRows).toHaveLength(44)

    const loadTime = computeChannelDuplicateStats({ ooh: corruptedRows })
    expect(loadTime.duplicatesDetected).toBe(true)
    expect(
      isSaveAllowedAfterHydration(true, { duplicatesDetected: loadTime.duplicatesDetected })
    ).toBe(false)

    // User prunes to one row per id — Save must recompute from CURRENT set (not frozen load).
    const pruned = corruptedRows.filter((_, index) => index % 2 === 0)
    expect(pruned).toHaveLength(22)
    const live = computeChannelDuplicateStats({ ooh: pruned })
    expect(live.duplicatesDetected).toBe(false)
    expect(
      isSaveAllowedAfterHydration(true, { duplicatesDetected: live.duplicatesDetected })
    ).toBe(true)
    // Load-time banner stats remain inflated even after prune.
    expect(loadTime.inflatedRows).toBe(44)
    expect(loadTime.inflatedDistinctIds).toBe(22)
  })

  it("computeAllChannelsHydrated unchanged: still boolean gate", () => {
    expect(
      computeAllChannelsHydrated({
        loadPhase: "ready",
        expectedFlags: ["mp_ooh"],
        mediaLoadStatus: { mp_ooh: "ready" },
        settledFlags: { mp_ooh: true },
      })
    ).toBe(true)
  })

  it("formatSaveModeLabel: draft overwrite vs next increment", () => {
    expect(formatSaveModeLabel("overwrite", 1)).toBe("Draft — overwrites v1")
    expect(formatSaveModeLabel("increment", 2)).toBe("Will create v2")
  })
})
