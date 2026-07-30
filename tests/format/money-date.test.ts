import { describe, expect, it } from "vitest"

import { formatDateLong, formatDateRange, formatDateShort } from "@/lib/format/date"
import { formatMoney, formatMoneyCompact, formatPercent, formatRate } from "@/lib/format/money"

describe("formatMoney", () => {
  it("returns em dash for null, undefined, and NaN", () => {
    expect(formatMoney(null)).toBe("—")
    expect(formatMoney(undefined)).toBe("—")
    expect(formatMoney(Number.NaN)).toBe("—")
  })

  it("formats AUD with two decimals by default", () => {
    expect(formatMoney(42653)).toBe("$42,653.00")
    expect(formatMoney(42653, { decimals: 0 })).toBe("$42,653")
  })
})

describe("formatMoneyCompact", () => {
  it("returns em dash for null, undefined, and NaN", () => {
    expect(formatMoneyCompact(null)).toBe("—")
    expect(formatMoneyCompact(undefined)).toBe("—")
    expect(formatMoneyCompact(Number.NaN)).toBe("—")
  })

  it("uses compact notation above 1000 and whole dollars below", () => {
    expect(formatMoneyCompact(43000)).toBe("$43.0K")
    expect(formatMoneyCompact(999)).toBe("$999")
  })
})

describe("formatPercent", () => {
  it("returns em dash for null, undefined, and NaN", () => {
    expect(formatPercent(null)).toBe("—")
    expect(formatPercent(undefined)).toBe("—")
    expect(formatPercent(Number.NaN)).toBe("—")
  })

  it("treats the value as an already-scaled percentage", () => {
    expect(formatPercent(58.1)).toBe("58.1%")
    expect(formatPercent(58)).toBe("58.0%")
    expect(formatPercent(58, { decimals: 0 })).toBe("58%")
  })
})

describe("formatRate", () => {
  it("defaults to en-AU / AUD when no options are passed", () => {
    // AUD en-AU uses "$" with grouping; must not be USD-shaped differently for whole dollars.
    expect(formatRate(12.5)).toBe("$12.50")
  })
})

describe("formatDateShort", () => {
  it("returns em dash for null, undefined, and unparseable input", () => {
    expect(formatDateShort(null)).toBe("—")
    expect(formatDateShort(undefined)).toBe("—")
    expect(formatDateShort("not-a-date")).toBe("—")
  })

  it("formats en-AU short dates", () => {
    expect(formatDateShort(new Date(2026, 3, 1))).toBe("1 Apr 2026")
  })
})

describe("formatDateLong", () => {
  it("returns em dash for null, undefined, and unparseable input", () => {
    expect(formatDateLong(null)).toBe("—")
    expect(formatDateLong(undefined)).toBe("—")
    expect(formatDateLong("not-a-date")).toBe("—")
  })

  it("formats en-AU long dates", () => {
    expect(formatDateLong(new Date(2026, 3, 1))).toBe("1 April 2026")
  })
})

describe("formatDateRange", () => {
  it("returns em dash when either bound is unparseable", () => {
    expect(formatDateRange(null, new Date(2026, 11, 31))).toBe("—")
    expect(formatDateRange(new Date(2026, 3, 1), undefined)).toBe("—")
    expect(formatDateRange("bad", "also-bad")).toBe("—")
  })

  it("collapses shared year and shared month", () => {
    expect(formatDateRange(new Date(2026, 3, 1), new Date(2026, 11, 31))).toBe("1 Apr – 31 Dec 2026")
    expect(formatDateRange(new Date(2026, 3, 1), new Date(2026, 3, 15))).toBe("1 – 15 Apr 2026")
  })
})
