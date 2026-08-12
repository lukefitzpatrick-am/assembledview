import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  shouldBlockEmptyPublish,
  shouldRunDeferredMasterPublish,
} from "@/lib/mediaplan/publishVersionIntegrityClient"

describe("shouldRunDeferredMasterPublish (SV-1)", () => {
  it("only when deferred AND intent publish", () => {
    assert.equal(
      shouldRunDeferredMasterPublish({ deferredPublish: true, saveIntent: "publish" }),
      true
    )
    assert.equal(
      shouldRunDeferredMasterPublish({ deferredPublish: true, saveIntent: "save" }),
      false
    )
    assert.equal(
      shouldRunDeferredMasterPublish({ deferredPublish: false, saveIntent: "publish" }),
      false
    )
    assert.equal(
      shouldRunDeferredMasterPublish({ deferredPublish: false, saveIntent: "save" }),
      false
    )
  })
})

describe("shouldBlockEmptyPublish intent gate (SV-1)", () => {
  it("intent save never blocks even when deferred + empty", () => {
    assert.equal(
      shouldBlockEmptyPublish({
        deferredPublish: true,
        enabledMediaTypeCount: 1,
        totalStagedLineItems: 0,
        saveIntent: "save",
      }),
      false
    )
  })

  it("intent publish still blocks deferred empty", () => {
    assert.equal(
      shouldBlockEmptyPublish({
        deferredPublish: true,
        enabledMediaTypeCount: 1,
        totalStagedLineItems: 0,
        saveIntent: "publish",
      }),
      true
    )
  })

  it("omitted saveIntent keeps legacy deferred-empty block", () => {
    assert.equal(
      shouldBlockEmptyPublish({
        deferredPublish: true,
        enabledMediaTypeCount: 1,
        totalStagedLineItems: 0,
      }),
      true
    )
  })
})
