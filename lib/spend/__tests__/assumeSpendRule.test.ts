import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { isAssumedSpendLine, type AssumeSpendLine } from "@/lib/spend/assumeSpendRule"

const digital = (noAdserving: boolean): AssumeSpendLine => ({
  buyType: "cpm",
  sourceTable: "media_plan_digi_video",
  noAdserving,
  publisher: null,
  platform: "not-a-delivery-source",
  deliveryMediaCents: 1_482_240,
})

describe("isAssumedSpendLine", () => {
  it("does not assume a no-adserving digital line that already has delivery", () => {
    assert.equal(isAssumedSpendLine(digital(true), true), false)
  })

  it("assumes a no-adserving digital line with no delivery rows", () => {
    assert.equal(isAssumedSpendLine(digital(true), false), true)
  })

  it("assumes offline newspaper with no delivery rows", () => {
    assert.equal(
      isAssumedSpendLine(
        {
          buyType: "insertions",
          sourceTable: "media_plan_newspaper",
          noAdserving: false,
          publisher: "The Age",
          platform: null,
          deliveryMediaCents: 310_000,
        },
        false,
      ),
      true,
    )
  })

  it("does not assume bonus or a digital line that still has ad serving", () => {
    assert.equal(isAssumedSpendLine({ ...digital(true), buyType: "bonus" }, false), false)
    assert.equal(isAssumedSpendLine(digital(false), false), false)
  })
})
