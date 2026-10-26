import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { builderRequestBody, entriesFromLayout, setEntryWidth } from "@/lib/webReport/builder/editor"
import { cleanLayout } from "@/lib/webReport/builder/layout"
import { parseBuilderRequest } from "@/lib/webReport/builder/request"
import { columnSpanClass } from "@/lib/webReport/displayModel"
import { resolveWidth, type WebReportLayoutItem } from "@/lib/webReport/elements"

const KPI_A = "9e10df61-955c-41e4-a4b3-aecb946d160c"
const KPI_B = "e275e474-e2d0-4e41-a404-38806e345416"

/** Hartmann's layout shape: Half on page title, location and both KPI trackers. */
const layout: WebReportLayoutItem[] = [
  { elementId: "kpis", settings: { tiles: [{ kind: "metric", metric: "sessions" }] } },
  { elementId: "kpiTracker", settings: { kpiIds: [KPI_B], months: "12" } },
  { elementId: "kpiTracker", settings: { kpiIds: [KPI_A], months: "12" } },
  { elementId: "pages", settings: { topN: 10 } },
  { elementId: "location", settings: { topN: 10 } },
]

describe("element width round trip", () => {
  it("keeps Half from the builder through save, the stored JSON and the client view", () => {
    let entries = entriesFromLayout(layout)
    for (const index of [1, 2, 3, 4]) entries = setEntryWidth(entries, entries[index].key, 6)
    const body = builderRequestBody({ action: "save", entries, brandTerms: [], period: "last_28_days" })
    const parsed = parseBuilderRequest(JSON.parse(JSON.stringify(body)))
    assert.equal(parsed.ok, true)
    if (!parsed.ok || parsed.action !== "save") return
    // repo.saveLayout stores body.layout as jsonb; the client view reads it back with cleanLayout.
    const stored = JSON.parse(JSON.stringify(parsed.body.layout))
    assert.deepEqual(stored.map((item: { width?: number }) => item.width), [undefined, 6, 6, 6, 6])
    const viewed = cleanLayout(stored)
    assert.ok(viewed)
    assert.deepEqual(viewed?.map((item) => columnSpanClass(resolveWidth(item))), [
      "min-w-0 md:col-span-12",
      "min-w-0 md:col-span-6",
      "min-w-0 md:col-span-6",
      "min-w-0 md:col-span-6",
      "min-w-0 md:col-span-6",
    ])
  })

  it("reads back the stored Hartmann version 3 rows with their widths", () => {
    const stored = [
      { elementId: "kpiTracker", settings: { kpiIds: [KPI_B], months: "12" }, width: 6 },
      { elementId: "snapshot", settings: { tiles: ["sessions"] } },
      { elementId: "pages", settings: { topN: 10 }, width: 6 },
    ]
    assert.deepEqual(cleanLayout(stored)?.map(resolveWidth), [6, 12, 6])
  })
})
