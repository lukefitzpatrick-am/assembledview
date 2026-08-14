import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { PlanDraftStateV1 } from "../types.js"
import {
  isCreateLocalDraftExpired,
  isMeaningfulCreateDraft,
  shouldOfferCreateLocalDraft,
  summarizeCreateDraftOffer,
} from "../createLocalDraft.js"

function draft(over: Partial<PlanDraftStateV1> = {}): PlanDraftStateV1 {
  const { formValues, channels, meta, ...rest } = over
  return {
    v: 1,
    mbaNumber: "",
    masterId: null,
    baseVersionId: null,
    ...rest,
    formValues: {
      mp_client_name: "",
      mp_campaignname: "",
      mp_campaignbudget: 0,
      ...(formValues ?? {}),
    },
    channels: channels ?? { search: [], television: [] },
    meta: { lineCount: 0, budgetCents: 0, ...(meta ?? {}) },
  }
}

describe("isMeaningfulCreateDraft", () => {
  it("rejects an empty/no-op create snapshot", () => {
    assert.equal(isMeaningfulCreateDraft(draft()), false)
  })

  it("accepts a selected client", () => {
    assert.equal(
      isMeaningfulCreateDraft(draft({ formValues: { mp_client_name: "Penfold" } })),
      true
    )
  })

  it("accepts a non-empty campaign name", () => {
    assert.equal(
      isMeaningfulCreateDraft(draft({ formValues: { mp_campaignname: " Summer  " } })),
      true
    )
  })

  it("accepts budget > 0", () => {
    assert.equal(
      isMeaningfulCreateDraft(draft({ formValues: { mp_campaignbudget: 15000 } })),
      true
    )
  })

  it("accepts any line item even when meta.lineCount is 0", () => {
    assert.equal(
      isMeaningfulCreateDraft(
        draft({
          channels: { search: [{ line_item_id: "x-se1" }] },
          meta: { lineCount: 0, budgetCents: 0 },
        })
      ),
      true
    )
  })
})

describe("shouldOfferCreateLocalDraft", () => {
  const now = new Date("2026-08-14T00:00:00.000Z")

  it("does not offer an empty draft even when fresh", () => {
    assert.equal(
      shouldOfferCreateLocalDraft({
        state: draft(),
        updatedAt: "2026-08-13T00:00:00.000Z",
        now,
      }),
      false
    )
  })

  it("offers a meaningful draft within 14 days", () => {
    assert.equal(
      shouldOfferCreateLocalDraft({
        state: draft({ formValues: { mp_client_name: "Penfold" } }),
        updatedAt: "2026-08-01T00:00:00.000Z",
        now,
      }),
      true
    )
  })

  it("drops a 15-day-old draft even when meaningful", () => {
    assert.equal(
      isCreateLocalDraftExpired("2026-07-30T00:00:00.000Z", now),
      true
    )
    assert.equal(
      shouldOfferCreateLocalDraft({
        state: draft({ formValues: { mp_client_name: "Penfold" } }),
        updatedAt: "2026-07-30T00:00:00.000Z",
        now,
      }),
      false
    )
  })

  it("keeps a 13-day-old meaningful draft", () => {
    assert.equal(
      shouldOfferCreateLocalDraft({
        state: draft({ formValues: { mp_campaignname: "Always on" } }),
        updatedAt: "2026-08-01T00:00:00.000Z",
        now,
      }),
      true
    )
  })
})

describe("summarizeCreateDraftOffer", () => {
  it("names client, campaign, line count, and budget", () => {
    const s = summarizeCreateDraftOffer(
      draft({
        formValues: { mp_client_name: "Penfold", mp_campaignname: "Summer brand" },
        channels: { search: [{ line_item_id: "a" }, { line_item_id: "b" }] },
        meta: { lineCount: 2, budgetCents: 1_250_000 },
      })
    )
    assert.equal(
      s,
      "Unsaved campaign: Penfold — Summer brand, 2 lines, $12500"
    )
  })

  it("falls back to untitled when the campaign name is blank", () => {
    const s = summarizeCreateDraftOffer(
      draft({
        formValues: { mp_client_name: "Penfold", mp_campaignname: "  " },
        meta: { lineCount: 0, budgetCents: 0 },
      })
    )
    assert.match(s, /Unsaved campaign: Penfold — untitled, 0 lines, \$0/)
  })
})
