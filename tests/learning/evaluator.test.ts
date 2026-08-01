import { describe, expect, it } from "vitest"

import termsData from "@/src/data/learning/terms.json"
import { evaluateFormula, formatValue } from "@/src/lib/learning/evaluator"
import type { LearningTerm } from "@/src/lib/learning/types"

const terms = termsData as LearningTerm[]

const calculatorTerms = terms.filter(
  (term) =>
    term.type === "formula" &&
    term.formula &&
    !term.formula.unmapped &&
    (term.formula.variables?.length ?? 0) > 0,
)

describe("learning evaluator regression", () => {
  it("evaluates every mapped calculator with all variables set to 2 without throwing", () => {
    expect(calculatorTerms.length).toBeGreaterThanOrEqual(30)

    for (const term of calculatorTerms) {
      const formula = term.formula!
      const values: Record<string, number> = {}
      for (const variable of formula.variables) {
        values[variable.key] = 2
      }
      expect(() => evaluateFormula(formula, values), term.id).not.toThrow()
    }
  })

  it("formats Gross Margin as 40.00% for revenue=1000, cogs=600", () => {
    const term = terms.find((t) => t.id === "gross-margin-finance-0d39fc1a")
    expect(term?.formula).toBeTruthy()
    const result = evaluateFormula(term!.formula!, { revenue: 1000, cogs: 600 })
    expect(formatValue(result, term!.formula!.format)).toBe("40.00%")
  })

  it("names unsubstituted tokens with the formula id", () => {
    expect(() =>
      evaluateFormula(
        {
          calculatorId: "broken-example",
          expression: "cost / video views",
          variables: [
            { key: "cost", label: "Cost", required: true },
            { key: "views", label: "Views", required: true },
          ],
          output: { label: "Result" },
          format: "number",
        },
        { cost: 2, views: 2 },
      ),
    ).toThrow(/Formula "broken-example".*unsubstituted tokens/i)
  })
})
