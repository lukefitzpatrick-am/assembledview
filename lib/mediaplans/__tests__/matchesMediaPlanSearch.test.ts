import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { matchesMediaPlanSearch } from "../matchesMediaPlanSearch"

describe("matchesMediaPlanSearch", () => {
  it("does not throw when required string fields are missing", () => {
    const malformed = {
      // mp_client_name / mba_number / campaign_name / brand all absent
    }
    assert.doesNotThrow(() => matchesMediaPlanSearch(malformed, "jayco"))
    assert.equal(matchesMediaPlanSearch(malformed, "jayco"), false)
  })

  it("does not throw when fields are null or undefined", () => {
    const row = {
      mp_client_name: null,
      campaign_name: undefined,
      mba_number: null,
      brand: undefined,
    }
    assert.doesNotThrow(() => matchesMediaPlanSearch(row, "x"))
    assert.equal(matchesMediaPlanSearch(row, "x"), false)
  })

  it("matches client / mba / campaign / brand case-insensitively", () => {
    const plan = {
      mp_client_name: "Jayco",
      campaign_name: "Annual Plan",
      mba_number: "jayco001",
      brand: "Jayco AU",
    }
    assert.equal(matchesMediaPlanSearch(plan, "JAY"), true)
    assert.equal(matchesMediaPlanSearch(plan, "annual"), true)
    assert.equal(matchesMediaPlanSearch(plan, "jayco001"), true)
    assert.equal(matchesMediaPlanSearch(plan, "au"), true)
    assert.equal(matchesMediaPlanSearch(plan, "zzz"), false)
  })

  it("empty search matches all rows", () => {
    assert.equal(matchesMediaPlanSearch({}, ""), true)
  })

  it("does not throw when mba_number is a number (coercion corruption)", () => {
    const corrupted = {
      mp_client_name: "Mitchelton Winery",
      campaign_name: "Brand",
      mba_number: 1001 as unknown as string,
      brand: null,
    }
    assert.doesNotThrow(() => matchesMediaPlanSearch(corrupted, "001001"))
    assert.equal(matchesMediaPlanSearch(corrupted, "1001"), true)
    assert.equal(matchesMediaPlanSearch(corrupted, "mitchelton"), true)
  })
})
