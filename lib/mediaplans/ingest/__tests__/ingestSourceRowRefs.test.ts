import assert from "node:assert/strict"
import test from "node:test"
import {
  ingestSourceRowRefsFromAttrs,
  ingestSourceRowRefsFromFormSnapshot,
} from "@/lib/mediaplans/ingest/ingestSourceRowRefs"

test("reads stamped refs from nested pickAttrs attrs", () => {
  assert.deepEqual(
    ingestSourceRowRefsFromAttrs({
      attrs: { ingest_source_row_refs: ["Paid!r2", "Paid!r3"] },
    }),
    ["Paid!r2", "Paid!r3"],
  )
})

test("falls back to form panels sourceRowRef", () => {
  assert.deepEqual(
    ingestSourceRowRefsFromFormSnapshot({
      panels: [{ sourceRowRef: "Paid!r4" }, { source_row_ref: "Paid!r5" }],
    }),
    ["Paid!r4", "Paid!r5"],
  )
})
