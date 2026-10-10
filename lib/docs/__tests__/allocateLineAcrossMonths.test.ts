import assert from "node:assert/strict"
import test from "node:test"

import {
  allocateLineAcrossMonths,
  dollarsFromPartCents,
} from "@/lib/docs/allocateLineAcrossMonths"
import { sumCents, toCents } from "@/lib/money"

const MONTHS = ["November 2026", "December 2026"] as const
const MEDIA = {
  "November 2026": 18666.66,
  "December 2026": 23333.34,
}

test("krusty002 v1 fee and ad serving months are half-up cents", () => {
  const fee = allocateLineAcrossMonths({
    lineTotal: 3000,
    monthKeys: MONTHS,
    weights: MEDIA,
  })
  const adServing = allocateLineAcrossMonths({
    lineTotal: 60,
    monthKeys: MONTHS,
    weights: MEDIA,
  })

  assert.equal(toCents(fee["November 2026"]!), toCents(1333.33))
  assert.equal(toCents(fee["December 2026"]!), toCents(1666.67))
  assert.equal(toCents(adServing["November 2026"]!), toCents(26.67))
  assert.equal(toCents(adServing["December 2026"]!), toCents(33.33))

  const november = dollarsFromPartCents([
    MEDIA["November 2026"],
    fee["November 2026"]!,
    adServing["November 2026"]!,
  ])
  const december = dollarsFromPartCents([
    MEDIA["December 2026"],
    fee["December 2026"]!,
    adServing["December 2026"]!,
  ])
  assert.equal(toCents(november), toCents(20026.66))
  assert.equal(toCents(december), toCents(25033.34))
})

test("allocated months sum to the line total", () => {
  const weights = { a: 1, b: 1, c: 1 }
  const allocated = allocateLineAcrossMonths({
    lineTotal: 10,
    monthKeys: ["a", "b", "c"],
    weights,
  })
  assert.equal(toCents(allocated.a!), toCents(3.33))
  assert.equal(toCents(allocated.b!), toCents(3.33))
  assert.equal(toCents(allocated.c!), toCents(3.34))
  assert.equal(
    sumCents([toCents(allocated.a!), toCents(allocated.b!), toCents(allocated.c!)]),
    toCents(10),
  )

  const fee = allocateLineAcrossMonths({
    lineTotal: 3000,
    monthKeys: MONTHS,
    weights: MEDIA,
  })
  assert.equal(
    sumCents(MONTHS.map((month) => toCents(fee[month]!))),
    toCents(3000),
  )
  const adServing = allocateLineAcrossMonths({
    lineTotal: 60,
    monthKeys: MONTHS,
    weights: MEDIA,
  })
  assert.equal(
    sumCents(MONTHS.map((month) => toCents(adServing[month]!))),
    toCents(60),
  )
})
