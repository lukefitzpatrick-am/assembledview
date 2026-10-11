/**
 * Production blank buyType resolves to "production"; unknown types warn once per session.
 */
import assert from "node:assert/strict"
import test from "node:test"

import {
  coerceBuyTypeWithDevWarn,
  normaliseBurstDeliverables,
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

test("normaliseBurstDeliverables rounds a cpm float and does not recompute from budget", () => {
  const out = normaliseBurstDeliverables({
    buyType: "cpm",
    bursts: [{ budget: "3000", buyAmount: "15", calculatedValue: 10.4 }],
  })
  const burst = out.bursts[0] as { calculatedValue: number }
  assert.equal(burst.calculatedValue, 10)
})

test("normaliseBurstDeliverables: fixed_cost with a budget and a zero rate stores 1", () => {
  const out = normaliseBurstDeliverables({
    buyType: "fixed_cost",
    bursts: [{ budget: "$9,000.00", buyAmount: "0", calculatedValue: 0 }],
  })
  const burst = out.bursts[0] as { calculatedValue: number }
  assert.equal(burst.calculatedValue, 1)
})

test("normaliseBurstDeliverables: fixed_cost with a zero budget keeps the stored quantity", () => {
  const out = normaliseBurstDeliverables({
    buyType: "fixed_cost",
    bursts: [{ budget: "$0.00", calculatedValue: 0 }],
  })
  const burst = out.bursts[0] as { calculatedValue: number }
  assert.equal(burst.calculatedValue, 0)
})

test("normaliseBurstDeliverables leaves package and bonus quantities untouched", () => {
  const packaged = {
    buyType: "package",
    bursts: [{ budget: "100", calculatedValue: 1.6 }],
  }
  assert.equal(normaliseBurstDeliverables(packaged), packaged)

  const bonus = {
    buyType: "bonus",
    bursts: [{ budget: "100", calculatedValue: 2.4 }],
  }
  assert.equal(normaliseBurstDeliverables(bonus), bonus)
})
