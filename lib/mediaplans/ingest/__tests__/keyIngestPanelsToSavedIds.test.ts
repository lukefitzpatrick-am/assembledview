/**
 * Guard: ingest panels must attach to ids this save wrote, not FORM_STAMP_MBA.
 */
import assert from "node:assert/strict"
import test from "node:test"
import { keyIngestPanelsToSavedIds } from "@/lib/mediaplans/ingest/keyIngestPanelsToSavedIds"
import type { IngestProposal } from "@/lib/mediaplans/ingest/proposeLineItems"

function oohProposal(n: number): IngestProposal {
  return {
    publisher_name: "QMS",
    media_type: "ooh",
    sheet_name: "Paid",
    line_items: Array.from({ length: n }, (_, i) => ({
      grouping: {},
      panels: [
        {
          descriptors: {},
          raw_unmapped: {},
          source_publisher: "QMS",
          source_row_ref: `Paid!r${i + 2}`,
          flights: [],
          grid_period_count: 0,
        },
      ],
      bursts: [],
    })),
    reconciliation: {
      line_item_count: n,
      panel_count: n,
      burst_count: 0,
      total_media_amount: 0,
      file_stated_total: 0,
      delta: 0,
      delta_pct: 0,
      accept_ok: true,
      block_reason: null,
      warnings: [],
      charges_detected_total: 0,
    },
  }
}

test("panels key to saved ids, not stamp OH1 when the channel already has lines", () => {
  const proposal = oohProposal(2)
  const { panels } = keyIngestPanelsToSavedIds({
    proposal,
    mbaNumber: "qmsround01",
    savedLineItems: [
      { lineItemId: "qmsround01OH1", channel: "ooh" },
      {
        lineItemId: "qmsround01OH7",
        channel: "ooh",
        ingestSourceRowRefs: ["Paid!r2"],
      },
      {
        lineItemId: "qmsround01OH8",
        channel: "ooh",
        ingestSourceRowRefs: ["Paid!r3"],
      },
    ],
  })
  const ids = panels.map((p) => p.lineItemId).toSorted()
  assert.deepEqual(ids, ["qmsround01OH7", "qmsround01OH8"])
  assert.ok(panels.every((p) => !p.lineItemId.includes("ingestform")))
  assert.ok(panels.every((p) => p.lineItemId !== "qmsround01OH1"))
})

test("panels key 1:1 when saved channel length matches ingest", () => {
  const proposal = oohProposal(1)
  const { panels } = keyIngestPanelsToSavedIds({
    proposal,
    mbaNumber: "qmsround01",
    savedLineItems: [
      {
        lineItemId: "qmsround01OH3",
        channel: "ooh",
        ingestSourceRowRefs: ["Paid!r2"],
      },
    ],
  })
  assert.equal(panels.length, 1)
  assert.equal(panels[0]?.lineItemId, "qmsround01OH3")
  assert.equal(panels[0]?.sourceRowRef, "Paid!r2")
})

test("deleting one ingested row does not shift panels onto preexisting lines", () => {
  const proposal = oohProposal(4)
  const preexisting = [
    "qmsround01OH1",
    "qmsround01OH2",
    "qmsround01OH3",
  ] as const
  const { panels } = keyIngestPanelsToSavedIds({
    proposal,
    mbaNumber: "qmsround01",
    savedLineItems: [
      { lineItemId: preexisting[0], channel: "ooh" },
      { lineItemId: preexisting[1], channel: "ooh" },
      { lineItemId: preexisting[2], channel: "ooh" },
      {
        lineItemId: "qmsround01OH4",
        channel: "ooh",
        ingestSourceRowRefs: ["Paid!r2"],
      },
      {
        lineItemId: "qmsround01OH5",
        channel: "ooh",
        ingestSourceRowRefs: ["Paid!r3"],
      },
      {
        lineItemId: "qmsround01OH6",
        channel: "ooh",
        ingestSourceRowRefs: ["Paid!r5"],
      },
    ],
  })
  const byRef = Object.fromEntries(
    panels.map((p) => [p.sourceRowRef, p.lineItemId]),
  )
  assert.deepEqual(byRef, {
    "Paid!r2": "qmsround01OH4",
    "Paid!r3": "qmsround01OH5",
    "Paid!r5": "qmsround01OH6",
  })
  assert.equal(panels.length, 3)
  assert.ok(!panels.some((p) => p.sourceRowRef === "Paid!r4"))
  for (const id of preexisting) {
    assert.ok(
      !panels.some((p) => p.lineItemId === id),
      `${id} must not receive a panel`,
    )
  }
})

test("order of saved lines does not change panel attachment", () => {
  const proposal = oohProposal(2)
  const { panels } = keyIngestPanelsToSavedIds({
    proposal,
    mbaNumber: "qmsround01",
    savedLineItems: [
      {
        lineItemId: "qmsround01OH8",
        channel: "ooh",
        ingestSourceRowRefs: ["Paid!r3"],
      },
      { lineItemId: "qmsround01OH1", channel: "ooh" },
      {
        lineItemId: "qmsround01OH7",
        channel: "ooh",
        ingestSourceRowRefs: ["Paid!r2"],
      },
    ],
  })
  const byRef = Object.fromEntries(
    panels.map((p) => [p.sourceRowRef, p.lineItemId]),
  )
  assert.deepEqual(byRef, {
    "Paid!r2": "qmsround01OH7",
    "Paid!r3": "qmsround01OH8",
  })
})

test("a human-added row with no ingest identity receives no panels", () => {
  const proposal = oohProposal(2)
  const { panels } = keyIngestPanelsToSavedIds({
    proposal,
    mbaNumber: "qmsround01",
    savedLineItems: [
      {
        lineItemId: "qmsround01OH4",
        channel: "ooh",
        ingestSourceRowRefs: ["Paid!r2"],
      },
      { lineItemId: "qmsround01OH5", channel: "ooh" },
      {
        lineItemId: "qmsround01OH6",
        channel: "ooh",
        ingestSourceRowRefs: ["Paid!r3"],
      },
    ],
  })
  assert.equal(panels.length, 2)
  assert.ok(!panels.some((p) => p.lineItemId === "qmsround01OH5"))
})

test("identity can ride nested attrs from pickAttrs", () => {
  const proposal = oohProposal(1)
  const { panels } = keyIngestPanelsToSavedIds({
    proposal,
    mbaNumber: "qmsround01",
    savedLineItems: [
      {
        lineItemId: "qmsround01OH9",
        channel: "ooh",
        attrs: { attrs: { ingest_source_row_refs: ["Paid!r2"] } },
      },
    ],
  })
  assert.equal(panels.length, 1)
  assert.equal(panels[0]?.lineItemId, "qmsround01OH9")
})
