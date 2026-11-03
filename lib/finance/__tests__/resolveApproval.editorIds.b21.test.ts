/**
 * B3b note (B21): partial MBA approval is decided against the editor id
 * (`editorBillingStableLineItemId(billingKey, rawLine, index)`), never the raw
 * saved `line_item_id`. An unlisted channel loads approved (decision Q10).
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import type { SeedLineFeesMediaConfig } from "@/lib/billing/seedLineFees"
import {
  buildEditorLineItemInputs,
  editorBillingStableLineItemId,
  resolveApproval,
} from "@/lib/finance/buildEditorLineItemInputs"

const BURST = { startDate: "2025-10-01", endDate: "2025-10-31", budget: "1000" }

function config(billingKey: string, ids: Array<string | undefined>): SeedLineFeesMediaConfig {
  return {
    billingKey,
    lineItems: ids.map((id) => (id ? { line_item_id: id, bursts: [BURST] } : { bursts: [BURST] })),
    containerBursts: [],
  }
}

test("engine input ids are the decorated editor ids", () => {
  const inputs = buildEditorLineItemInputs([config("digiDisplay", ["PGAAUS010DD1", undefined])])
  assert.deepEqual(
    inputs.map((l) => l.lineItemId),
    ["billing-digiDisplay::PGAAUS010DD1", "billing-digiDisplay::new-1"]
  )
  assert.equal(
    editorBillingStableLineItemId("digiDisplay", { id: "PGAAUS010DD1" }, 0),
    "billing-digiDisplay::PGAAUS010DD1"
  )
})

test("a selection of bare or decorated current ids approves; the old saved id does not", () => {
  const configs = [config("digiDisplay", ["PGAAUS010DD1"])]
  const approval = (selected: string[]) =>
    buildEditorLineItemInputs(configs, {
      isPartialMBA: true,
      partialMBASelectedLineItemIds: { digiDisplay: selected },
    })[0]!.approval
  assert.equal(approval(["PGAAUS010DD1"]), "approved")
  assert.equal(approval(["billing-digiDisplay::PGAAUS010DD1"]), "approved")
  // The rewritten line no longer carries ML1, so a saved ML1 misses (MB-33 before B21).
  assert.equal(approval(["PGAAUS010ML1"]), "excluded")
})

test("resolveApproval: unlisted channel approved; listed under another key is unlisted for this key", () => {
  const opts = { isPartialMBA: true, partialMBASelectedLineItemIds: { social: ["PGAAUS005SM1"] } }
  // B3b: a saved mediaKey that isn't the current billing key leaves the channel unlisted.
  assert.equal(resolveApproval("socialMedia", "billing-socialMedia::PGAAUS005SM1", opts), "approved")
})

test("source pin: approval is resolved on the editor id built from billingKey, rawLine and index", () => {
  const src = readFileSync(join(process.cwd(), "lib/finance/buildEditorLineItemInputs.ts"), "utf8")
  assert.match(src, /const lineItemId = editorBillingStableLineItemId\(billingKey, rawLine, index\)/)
  assert.match(src, /approval: resolveApproval\(billingKey, lineItemId, opts\),/)
  assert.doesNotMatch(src, /resolveApproval\([^)]*line_item_id/)
})
