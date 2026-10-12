import assert from "node:assert/strict"
import test from "node:test"

import type { GanttRow } from "@/components/charts/system"

import { groupGanttRowsByChannel } from "../groupGanttRowsByChannel"

function row(channelKey: string, label: string, start: number, end: number, plannedMedia?: number): GanttRow {
  return {
    label,
    sub: channelKey === "search" ? "Search" : channelKey === "television" ? "Television" : "BVOD",
    channelKey,
    plannedMedia,
    bursts: [{ startWeek: start, endWeek: end }],
  }
}

function lines(count: number, channels: string[]): GanttRow[] {
  return Array.from({ length: count }, (_, index) => {
    const channelKey = channels[index % channels.length]!
    return row(channelKey, `Line ${index + 1}`, index, index + 2, 10)
  })
}

test("22 lines across 3 channels start collapsed", () => {
  const { groups, collapsed } = groupGanttRowsByChannel(
    lines(22, ["television", "search", "bvod"]),
    { collapseAt: 20 },
  )
  assert.equal(collapsed, true)
  assert.deepEqual(groups.map((group) => group.channelKey), ["television", "search", "bvod"])
  assert.equal(groups.reduce((sum, group) => sum + group.lineCount, 0), 22)
})

test("19 lines start open", () => {
  const { collapsed, groups } = groupGanttRowsByChannel(
    lines(19, ["search", "television"]),
    { collapseAt: 20 },
  )
  assert.equal(collapsed, false)
  assert.equal(groups.reduce((sum, group) => sum + group.lineCount, 0), 19)
})

test("span is the earliest start and the latest end", () => {
  const { groups } = groupGanttRowsByChannel(
    [
      row("search", "early", 4, 6, 10.1),
      row("search", "late", 1, 9, 20.2),
      row("television", "other", 0, 2, 5),
    ],
    { collapseAt: 20 },
  )
  assert.equal(groups[0]?.start, 1)
  assert.equal(groups[0]?.end, 9)
  assert.equal(groups[0]?.plannedMedia, 30.3)
  assert.equal(groups[0]?.label, "Search")
  assert.equal(groups[1]?.start, 0)
  assert.equal(groups[1]?.end, 2)
})
