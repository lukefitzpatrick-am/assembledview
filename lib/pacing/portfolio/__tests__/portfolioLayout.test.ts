import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"

import {
  PORTFOLIO_LAYOUT_STORAGE_KEY,
  parsePortfolioLayout,
  readPortfolioLayout,
  resetPortfolioLayoutCacheForTests,
  writePortfolioLayout,
} from "../portfolioLayout.js"

const memory = new Map<string, string>()

const storage = {
  getItem(key: string) {
    return memory.has(key) ? memory.get(key)! : null
  },
  setItem(key: string, value: string) {
    memory.set(key, value)
  },
}

describe("portfolioLayout", () => {
  afterEach(() => {
    memory.clear()
    resetPortfolioLayoutCacheForTests()
  })

  it("defaults to cards and only accepts table", () => {
    assert.equal(parsePortfolioLayout(null), "cards")
    assert.equal(parsePortfolioLayout("cards"), "cards")
    assert.equal(parsePortfolioLayout("grid"), "cards")
    assert.equal(parsePortfolioLayout("table"), "table")
  })

  it("persists the choice under pacing.portfolioLayout", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: storage,
    })
    writePortfolioLayout("table")
    assert.equal(memory.get(PORTFOLIO_LAYOUT_STORAGE_KEY), "table")
    resetPortfolioLayoutCacheForTests()
    assert.equal(readPortfolioLayout(), "table")
  })

  it("swallows storage failures", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem() {
          throw new Error("blocked")
        },
        setItem() {
          throw new Error("blocked")
        },
      },
    })
    resetPortfolioLayoutCacheForTests()
    assert.equal(readPortfolioLayout(), "cards")
    assert.doesNotThrow(() => writePortfolioLayout("table"))
  })
})
