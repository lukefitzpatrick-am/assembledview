import assert from "node:assert/strict"
import test from "node:test"

import type { TaxonomyRow } from "../../../lib/planning/adapter.js"
import { taxonomyHonestyKind } from "../TaxonomyStatusBadge.js"

function leaf(over: Partial<TaxonomyRow> = {}): TaxonomyRow {
  return {
    rowType: "leaf",
    channelId: "ooh_street",
    engineChannelId: "ooh_street",
    level1: "Outdoor",
    label: "Street furniture",
    sortOrder: 41,
    reachPct: 0.1,
    reachWc: 100,
    ageBase: 14,
    isRmMeasured: true,
    engine: null,
    ...over,
  }
}

test("taxonomyHonestyKind: inherited wins over scored", () => {
  const kind = taxonomyHonestyKind(
    leaf({ mappingProvenance: "inherited", inheritedFromLabel: "Outdoor" })
  )
  assert.deepEqual(kind, { kind: "inherited", group: "Outdoor" })
})

test("taxonomyHonestyKind: benchmark-only matches OutcomeCharts badge language", () => {
  assert.deepEqual(
    taxonomyHonestyKind(leaf({ mappingProvenance: "benchmark-only", isRmMeasured: false })),
    { kind: "benchmark" }
  )
})

test("taxonomyHonestyKind: injected Search stays modelled", () => {
  assert.deepEqual(
    taxonomyHonestyKind(
      leaf({
        rowType: "injected",
        channelId: "search",
        engineChannelId: "search",
        mappingProvenance: undefined,
      })
    ),
    { kind: "injected" }
  )
})
