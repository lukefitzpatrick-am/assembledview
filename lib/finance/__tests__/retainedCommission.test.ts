/**
 * Zero-AA clamp — retained commission is max(0, rate − 2)% of GROSS media.
 * Decision 6 Aug 2026.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { applyForecastCommissionRate } from "@/lib/finance/forecast/mapping/classification"
import {
  AA_COMMISSION_RATE,
  retainedCommissionRate,
} from "@/lib/finance/retainedCommission"

test("AA_COMMISSION_RATE is fixed at 2", () => {
  assert.equal(AA_COMMISSION_RATE, 2)
})

test("rate 10 → retained 8% of gross media", () => {
  assert.equal(retainedCommissionRate(10), 8)
  assert.equal(applyForecastCommissionRate(10_000, 10), 800)
})

test("rate 20 → retained 18%", () => {
  assert.equal(retainedCommissionRate(20), 18)
  assert.equal(applyForecastCommissionRate(10_000, 20), 1_800)
})

test("rate 2 → retained 0 (boundary — no warning; Math.max does not change the value)", () => {
  const warnings: unknown[] = []
  const orig = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args)
  }
  try {
    assert.equal(retainedCommissionRate(2), 0)
    assert.equal(applyForecastCommissionRate(10_000, 2), 0)
    assert.equal(
      warnings.filter(
        (a) => Array.isArray(a) && a[0] === "[retained-commission-zero-aa]"
      ).length,
      0,
      "boundary rate===2 must not warn"
    )
  } finally {
    console.warn = orig
  }
})

test("rate 0 → retained 0 AND a warning is emitted", () => {
  const warnings: unknown[] = []
  const orig = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args)
  }
  try {
    assert.equal(
      retainedCommissionRate(0, {
        publisher: "Seven Network",
        lineItemId: "MBA1TV001",
      }),
      0
    )
    assert.equal(
      applyForecastCommissionRate(10_000, 0, {
        publisher: "Seven Network",
        lineItemId: "MBA1TV001",
      }),
      0
    )
    const clampWarns = warnings.filter(
      (a) => Array.isArray(a) && a[0] === "[retained-commission-zero-aa]"
    )
    assert.ok(clampWarns.length >= 1, "expected zero-AA clamp warning")
    const payload = clampWarns[0]![1] as Record<string, unknown>
    assert.equal(payload.publisher, "Seven Network")
    assert.equal(payload.lineItemId, "MBA1TV001")
    assert.equal(payload.rate, 0)
    assert.equal(payload.retained, 0)
  } finally {
    console.warn = orig
  }
})

test("rate 0 with client_pays_for_media → retained 0, earns nothing", () => {
  assert.equal(
    applyForecastCommissionRate(10_000, 0, { clientPaysForMedia: true }),
    0
  )
  // Even a high rate must not earn on client-pays.
  assert.equal(
    applyForecastCommissionRate(10_000, 20, { clientPaysForMedia: true }),
    0
  )
})

test("worked example: $10,000 gross @ 10% → commission $1,000, AA $200, retained $800", () => {
  const gross = 10_000
  const rate = 10
  const fullCommission = gross * (rate / 100)
  const aaTake = gross * (AA_COMMISSION_RATE / 100)
  const retained = applyForecastCommissionRate(gross, rate)
  assert.equal(fullCommission, 1_000)
  assert.equal(aaTake, 200)
  assert.equal(retained, 800)
  assert.equal(retained, fullCommission - aaTake)
  assert.equal(retainedCommissionRate(rate), 8)
})
