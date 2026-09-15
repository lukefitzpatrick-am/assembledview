import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { PlansSaveRequestBody } from "../buildPostgresSavePayload"
import {
  flattenPartialMbaSelectedLineIds,
  kpiRowsForDraftDocuments,
  mergeDraftDocumentsBody,
} from "../mergeDraftDocumentsBody"

const saveBody = {
  masterId: 9,
  mbaNumber: "golf025",
  versionNumber: 33,
  mode: "publish",
  campaignName: "Open",
  lineItems: [],
  feeLoading: {},
} as unknown as PlansSaveRequestBody

describe("flattenPartialMbaSelectedLineIds", () => {
  it("flattens per-media chips", () => {
    assert.deepEqual(
      flattenPartialMbaSelectedLineIds({
        search: ["a", " b "],
        social: [],
        tv: ["c"],
      }),
      ["a", "b", "c"]
    )
  })
})

describe("kpiRowsForDraftDocuments", () => {
  it("maps page KPI fields onto the draft renderer keys", () => {
    assert.deepEqual(
      kpiRowsForDraftDocuments([
        {
          media_type: "search",
          publisher: "Google",
          lineItemLabel: "Brand",
          buyType: "cpc",
          spend: 10,
          deliverables: 100,
        },
      ]),
      [
        {
          mediaType: "search",
          publisher: "Google",
          label: "Brand",
          buyType: "cpc",
          spend: 10,
          deliverables: 100,
          ctr: null,
          vtr: null,
          cpv: null,
          conversion_rate: null,
          frequency: null,
          calculatedClicks: null,
          calculatedViews: null,
          calculatedReach: null,
        },
      ]
    )
  })
})

describe("mergeDraftDocumentsBody", () => {
  it("omits masterId on create and restores campaignStatus stripped by assemble", () => {
    const body = mergeDraftDocumentsBody(saveBody, {
      kind: "mba_pdf",
      omitMasterId: true,
      campaignStatus: "Draft",
    })
    assert.equal(body.masterId, null)
    assert.equal(body.kind, "mba_pdf")
    assert.equal(body.campaignStatus, "Draft")
    assert.equal(body.mbaNumber, "golf025")
  })
})
