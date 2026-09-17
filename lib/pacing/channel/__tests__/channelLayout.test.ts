import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"

import {
  channelLayoutStorageKey,
  parseChannelLayout,
  readChannelLayout,
  resetChannelLayoutCacheForTests,
  writeChannelLayout,
} from "../channelLayout.js"

const memory = new Map<string, string>()

const storage = {
  getItem(key: string) {
    return memory.has(key) ? memory.get(key)! : null
  },
  setItem(key: string, value: string) {
    memory.set(key, value)
  },
}

describe("channelLayout", () => {
  afterEach(() => {
    memory.clear()
    resetChannelLayoutCacheForTests()
  })

  it("defaults to cards and only accepts table", () => {
    assert.equal(parseChannelLayout(null), "cards")
    assert.equal(parseChannelLayout("cards"), "cards")
    assert.equal(parseChannelLayout("grid"), "cards")
    assert.equal(parseChannelLayout("table"), "table")
  })

  it("persists each channel under pacing.<channel>Layout", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: storage,
    })
    writeChannelLayout("search", "table")
    writeChannelLayout("social", "cards")
    assert.equal(memory.get(channelLayoutStorageKey("search")), "table")
    assert.equal(memory.get(channelLayoutStorageKey("social")), "cards")
    resetChannelLayoutCacheForTests()
    assert.equal(readChannelLayout("search"), "table")
    assert.equal(readChannelLayout("social"), "cards")
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
    resetChannelLayoutCacheForTests()
    assert.equal(readChannelLayout("direct"), "cards")
    assert.doesNotThrow(() => writeChannelLayout("direct", "table"))
  })
})
