import { FormulaDSL } from "./types";

const allowedPattern = /^[0-9+\-*/().\s%]*$/;

export function evaluateFormula(dsl: FormulaDSL, values: Record<string, number>): number {
  let expr = dsl.expression;

  for (const variable of dsl.variables) {
    const value = values[variable.key];
    if (variable.required && (value === undefined || Number.isNaN(value))) {
      throw new Error(`${variable.label} is required`);
    }
    const numeric = typeof value === "number" ? value : Number(value);
    expr = expr.replace(new RegExp(`\\b${variable.key}\\b`, "g"), `${numeric}`);
  }

  const sanitized = expr.replace(/\s+/g, "");
  if (!allowedPattern.test(sanitized)) {
    throw new Error("Invalid characters in expression");
  }

  // eslint-disable-next-line no-new-func
  const result = Function(`"use strict"; return (${expr});`)();
  if (!Number.isFinite(result)) {
    throw new Error("Calculation produced an invalid number");
  }
  return result;
}

export function formatValue(value: number, format: FormulaDSL["format"]): string {
  if (!Number.isFinite(value)) return "—";
  const normalized = Number(value);
  if (format === "currency") {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(normalized);
  }
  if (format === "percent") {
    return `${normalized.toFixed(2)}%`;
  }
  if (Math.abs(normalized) >= 1000) return normalized.toFixed(0);
  return normalized.toFixed(2);
}























