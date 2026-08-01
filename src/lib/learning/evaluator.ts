import { formatMoney, formatPercent } from "@/lib/format/money"
import { FormulaDSL } from "./types"

const allowedPattern = /^[0-9+\-*/().\s%]*$/
const remainingTokenPattern = /[A-Za-z_][A-Za-z0-9_]*/g

function formulaLabel(dsl: FormulaDSL): string {
  return dsl.calculatorId || dsl.expression
}

export function evaluateFormula(dsl: FormulaDSL, values: Record<string, number>): number {
  let expr = dsl.expression

  for (const variable of dsl.variables) {
    const value = values[variable.key]
    if (variable.required && (value === undefined || Number.isNaN(value))) {
      throw new Error(`${variable.label} is required`)
    }
    const numeric = typeof value === "number" ? value : Number(value)
    expr = expr.replace(new RegExp(`\\b${variable.key}\\b`, "g"), `${numeric}`)
  }

  const sanitized = expr.replace(/\s+/g, "")
  const remainingTokens = sanitized.match(remainingTokenPattern)
  if (remainingTokens?.length) {
    throw new Error(
      `Formula "${formulaLabel(dsl)}" has unsubstituted tokens after substitution: ${[...new Set(remainingTokens)].join(", ")}`,
    )
  }
  if (!allowedPattern.test(sanitized)) {
    throw new Error(
      `Formula "${formulaLabel(dsl)}" has invalid characters after substitution: ${sanitized}`,
    )
  }

  // eslint-disable-next-line no-new-func
  const result = Function(`"use strict"; return (${expr});`)()
  if (!Number.isFinite(result)) {
    throw new Error("Calculation produced an invalid number")
  }
  return result
}

export function formatValue(value: number, format: FormulaDSL["format"]): string {
  if (!Number.isFinite(value)) return "—"
  const normalized = Number(value)
  if (format === "currency") {
    return formatMoney(normalized, { decimals: 2 })
  }
  if (format === "percent") {
    return formatPercent(normalized, { decimals: 2 })
  }
  if (Math.abs(normalized) >= 1000) {
    return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 }).format(normalized)
  }
  return normalized.toFixed(2)
}
