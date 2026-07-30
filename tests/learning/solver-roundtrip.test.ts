import { describe, expect, it } from "vitest"

import termsData from "@/src/data/learning/terms.json"
import { solveForOutput, solveForVariable } from "@/src/lib/learning/solver"
import type { LearningTerm } from "@/src/lib/learning/types"

const terms = termsData as LearningTerm[]

const calculatorTerms = terms.filter(
  (term) =>
    term.type === "formula" &&
    term.formula &&
    !term.formula.unmapped &&
    (term.formula.variables?.length ?? 0) > 0,
)

/** Distinct primes so (a-b) etc. never collapse to a degenerate zero. */
const PRIME_SEQUENCE = [3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41] as const

/**
 * Pairs where reverse-solve is genuinely impossible (variable absent from the
 * expression, or output does not vary with it). Assert these THROW
 * "Cannot solve for this variable" — do not wrap the happy path in try/catch.
 *
 * Currently empty: every mapped (formula, variable) pair in terms.json is
 * invertible under the round-trip values below.
 */
const UNSOLVABLE_ALLOWLIST: ReadonlyArray<{
  termId: string
  variableKey: string
  reason: string
}> = [
  // e.g. { termId: "…", variableKey: "…", reason: "does not appear in expression" },
]

const unsolvableKey = (termId: string, variableKey: string) => `${termId}::${variableKey}`

const unsolvableSet = new Set(
  UNSOLVABLE_ALLOWLIST.map((entry) => unsolvableKey(entry.termId, entry.variableKey)),
)

function assignPrimeValues(variableKeys: string[]): Record<string, number> {
  const values: Record<string, number> = {}
  variableKeys.forEach((key, index) => {
    const prime = PRIME_SEQUENCE[index]
    if (prime === undefined) {
      throw new Error(`Need more primes for variable index ${index}`)
    }
    values[key] = prime
  })
  return values
}

describe("solver round-trip property", () => {
  it("inverts every mapped formula variable (or throws for allowlisted unsolvables)", () => {
    expect(calculatorTerms.length).toBeGreaterThanOrEqual(30)

    let pairCount = 0

    for (const term of calculatorTerms) {
      const formula = term.formula!
      const keys = formula.variables.map((v) => v.key)
      const values = assignPrimeValues(keys)
      const out = solveForOutput(formula, values)

      for (const key of keys) {
        pairCount += 1
        const allowlisted = unsolvableSet.has(unsolvableKey(term.id, key))

        if (allowlisted) {
          expect(
            () =>
              solveForVariable({
                formula,
                solveFor: key,
                values,
                desiredOutput: out,
              }),
            `${term.id} / ${key} (allowlisted unsolvable)`,
          ).toThrow("Cannot solve for this variable")
          continue
        }

        const solved = solveForVariable({
          formula,
          solveFor: key,
          values,
          desiredOutput: out,
        })
        const expected = values[key]!
        const tol = 1e-6 * Math.max(1, Math.abs(expected))
        expect(
          Math.abs(solved - expected),
          `${term.id} / ${key}: solved=${solved} expected=${expected}`,
        ).toBeLessThanOrEqual(tol)
      }
    }

    // 31 mapped calculators × their variables = 65 pairs today.
    expect(pairCount).toBe(65)
  })
})

describe("solver named regressions", () => {
  it("Profit Margin: solve cost (revenue 1000, target 40) → 600", () => {
    const term = terms.find((t) => t.id === "profit-margin-finance-86c6dc80")
    expect(term?.formula).toBeTruthy()
    const solved = solveForVariable({
      formula: term!.formula!,
      solveFor: "cost",
      values: { revenue: 1000 },
      desiredOutput: 40,
    })
    expect(Math.abs(solved - 600)).toBeLessThanOrEqual(1e-6 * 600)
  })

  it("Gross Margin: solve revenue (cogs 600, target 40) → 1000", () => {
    const term = terms.find((t) => t.id === "gross-margin-finance-0d39fc1a")
    expect(term?.formula).toBeTruthy()
    const solved = solveForVariable({
      formula: term!.formula!,
      solveFor: "revenue",
      values: { cogs: 600 },
      desiredOutput: 40,
    })
    expect(Math.abs(solved - 1000)).toBeLessThanOrEqual(1e-6 * 1000)
  })

  it("ROI: solve ret (cost 500, target 20) → 600", () => {
    const term = terms.find((t) => t.id === "roi-metric-8692c7a3")
    expect(term?.formula).toBeTruthy()
    const solved = solveForVariable({
      formula: term!.formula!,
      solveFor: "ret",
      values: { cost: 500 },
      desiredOutput: 20,
    })
    expect(Math.abs(solved - 600)).toBeLessThanOrEqual(1e-6 * 600)
  })

  it("Net Margin: solve revenue (net_profit 200, target 40) → 500", () => {
    const term = terms.find((t) => t.id === "net-margin-finance-539067ab")
    expect(term?.formula).toBeTruthy()
    const solved = solveForVariable({
      formula: term!.formula!,
      solveFor: "revenue",
      values: { net_profit: 200 },
      desiredOutput: 40,
    })
    expect(Math.abs(solved - 500)).toBeLessThanOrEqual(1e-6 * 500)
  })

  it("CTR: solve impressions (clicks 50, target 5) → 1000", () => {
    const term = terms.find((t) => t.id === "ctr-metric-3c0b3730")
    expect(term?.formula).toBeTruthy()
    const solved = solveForVariable({
      formula: term!.formula!,
      solveFor: "impressions",
      values: { clicks: 50 },
      desiredOutput: 5,
    })
    expect(Math.abs(solved - 1000)).toBeLessThanOrEqual(1e-6 * 1000)
  })
})
