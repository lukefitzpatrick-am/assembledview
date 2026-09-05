/**
 * Production blank buyType resolves to "production"; unknown types warn once per session.
 */
import assert from "node:assert/strict"
import test from "node:test"

import {
  coerceBuyTypeWithDevWarn,
  resolveBuyTypeForChannel,
  shouldMountCpcFamilyBurstCalculatedField,
} from "@/lib/mediaplan/deliverableBudget"

function withDevelopmentEnv(fn: () => void) {
  const prev = process.env.NODE_ENV
  const env = process.env as { NODE_ENV?: string }
  env.NODE_ENV = "development"
  try {
    fn()
  } finally {
    env.NODE_ENV = prev
  }
}

function warnSpy() {
  const original = console.warn
  const calls: unknown[][] = []
  console.warn = (...args: unknown[]) => {
    calls.push(args)
  }
  return {
    calls,
    restore() {
      console.warn = original
    },
  }
}

test("resolveBuyTypeForChannel: production + null/blank → production", () => {
  assert.equal(resolveBuyTypeForChannel("production", null), "production")
  assert.equal(resolveBuyTypeForChannel("production", undefined), "production")
  assert.equal(resolveBuyTypeForChannel("production", ""), "production")
  assert.equal(resolveBuyTypeForChannel("production", "  "), "production")
})

test("resolveBuyTypeForChannel: production keeps an explicit buy type", () => {
  assert.equal(resolveBuyTypeForChannel("production", "production"), "production")
  assert.equal(resolveBuyTypeForChannel("production", "fixed_cost"), "fixed_cost")
})

test("resolveBuyTypeForChannel: non-production blank stays blank", () => {
  assert.equal(resolveBuyTypeForChannel("radio", null), "")
  assert.equal(resolveBuyTypeForChannel("radio", ""), "")
  assert.equal(resolveBuyTypeForChannel("search", "cpc"), "cpc")
})

test("shouldMountCpcFamilyBurstCalculatedField is false for production", () => {
  assert.equal(
    shouldMountCpcFamilyBurstCalculatedField({ mediaTypeKey: "production" }),
    false
  )
  assert.equal(
    shouldMountCpcFamilyBurstCalculatedField({ buyType: "production" }),
    false
  )
  assert.equal(
    shouldMountCpcFamilyBurstCalculatedField({ mediaTypeKey: "search", buyType: "cpc" }),
    true
  )
})

test("coerceBuyTypeWithDevWarn: production does not warn", () => {
  withDevelopmentEnv(() => {
    const spy = warnSpy()
    try {
      const bt = coerceBuyTypeWithDevWarn("production", "deliverableBudget.test")
      assert.equal(bt, "production")
      assert.equal(
        spy.calls.filter((a) => String(a[0]).includes("[deliverableBudget]")).length,
        0
      )
    } finally {
      spy.restore()
    }
  })
})

test("coerceBuyTypeWithDevWarn: unknown buy type warns exactly once per (buyType, context)", () => {
  withDevelopmentEnv(() => {
    const spy = warnSpy()
    try {
      const ctx = "deliverableBudget.unknown-once"
      const unknown = "sm18-not-a-buy-type"
      coerceBuyTypeWithDevWarn(unknown, ctx)
      coerceBuyTypeWithDevWarn(unknown, ctx)
      coerceBuyTypeWithDevWarn(unknown, ctx)
      const hits = spy.calls.filter((a) =>
        String(a[0]).includes(`Unrecognised buyType "${unknown}"`)
      )
      assert.equal(hits.length, 1)
      assert.match(String(hits[0]![0]), /using string as BuyType \(may default to 0\)/)
    } finally {
      spy.restore()
    }
  })
})
