import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { SEARCH_LIMITS_PMAX, SEARCH_LIMITS_RSA } from "../limits"
import { trimSearchCopyToLimits } from "../prompt"
import type { SearchAdCopy, SearchAsset } from "@/components/creative/searchads/types"

function asset(text: string, angle: SearchAsset["angle"] = "benefit"): SearchAsset {
  return { text, angle }
}

function baseRsa(overrides: Partial<SearchAdCopy> = {}): SearchAdCopy {
  return {
    format: "rsa",
    finalUrl: "https://example.com.au",
    path1: "",
    path2: "",
    headlines: [],
    descriptions: [],
    ...overrides,
  }
}

describe("trimSearchCopyToLimits", () => {
  it("caps headline, description, and path character lengths", () => {
    const out = trimSearchCopyToLimits(
      baseRsa({
        path1: "p".repeat(40),
        path2: "q".repeat(40),
        headlines: [asset("h".repeat(50))],
        descriptions: [asset("d".repeat(120))],
      }),
      SEARCH_LIMITS_RSA,
    )
    assert.equal(out.headlines[0].text.length, SEARCH_LIMITS_RSA.headline)
    assert.equal(out.descriptions[0].text.length, SEARCH_LIMITS_RSA.description)
    assert.equal(out.path1.length, SEARCH_LIMITS_RSA.path)
    assert.equal(out.path2.length, SEARCH_LIMITS_RSA.path)
  })

  it("caps rsa descriptions at 4 and headlines at 15", () => {
    const out = trimSearchCopyToLimits(
      baseRsa({
        headlines: Array.from({ length: 20 }, (_, i) => asset(`Headline ${i + 1}`)),
        descriptions: Array.from({ length: 8 }, (_, i) => asset(`Description ${i + 1}`)),
      }),
      SEARCH_LIMITS_RSA,
    )
    assert.equal(out.headlines.length, 15)
    assert.equal(out.descriptions.length, 4)
  })

  it("caps pmax descriptions at 5, long headlines at 5, and business name length", () => {
    const out = trimSearchCopyToLimits(
      {
        format: "pmax",
        finalUrl: "https://example.com.au",
        path1: "",
        path2: "",
        headlines: [asset("Short")],
        descriptions: Array.from({ length: 9 }, (_, i) => asset(`Desc ${i + 1}`)),
        longHeadlines: Array.from({ length: 8 }, (_, i) =>
          asset("L".repeat(100) + ` ${i}`),
        ),
        businessName: "B".repeat(40),
      },
      SEARCH_LIMITS_PMAX,
    )
    assert.equal(out.descriptions.length, 5)
    assert.equal(out.longHeadlines?.length, 5)
    assert.ok(out.longHeadlines?.every((row) => row.text.length <= SEARCH_LIMITS_PMAX.longHeadline))
    assert.equal(out.businessName?.length, SEARCH_LIMITS_PMAX.businessName)
  })

  it("drops empty-text assets", () => {
    const out = trimSearchCopyToLimits(
      baseRsa({
        headlines: [asset("Keep me"), asset(""), asset("   "), asset("Also keep")],
        descriptions: [asset(""), asset("Real desc")],
      }),
      SEARCH_LIMITS_RSA,
    )
    assert.deepEqual(
      out.headlines.map((row) => row.text),
      ["Keep me", "Also keep"],
    )
    assert.deepEqual(
      out.descriptions.map((row) => row.text),
      ["Real desc"],
    )
  })
})
