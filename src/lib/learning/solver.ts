import { evaluateFormula } from "./evaluator";
import { FormulaDSL } from "./types";

export const OUTPUT_KEY = "__output";

export type SolveParams = {
  formula: FormulaDSL;
  solveFor: string; // variable key or "output"
  values: Record<string, number>;
  desiredOutput?: number;
};

const EPSILON = 1e-9;

const assertFinite = (value: number, message: string) => {
  if (!Number.isFinite(value)) {
    throw new Error(message);
  }
  return value;
};

export const roundToTwo = (value: number) => {
  return Number(value.toFixed(2));
};

export const formatNumericInput = (value: number) => {
  return roundToTwo(value).toString();
};

export const solveForOutput = (formula: FormulaDSL, values: Record<string, number>) => {
  const numericValues: Record<string, number> = {};
  for (const variable of formula.variables) {
    const value = values[variable.key];
    if (value === undefined || Number.isNaN(value)) {
      throw new Error(`${variable.label} is required`);
    }
    numericValues[variable.key] = value;
  }
  return evaluateFormula(formula, numericValues);
};

export const solveForVariable = ({ formula, solveFor, values, desiredOutput }: SolveParams) => {
  if (desiredOutput === undefined || Number.isNaN(desiredOutput)) {
    throw new Error("Output value is required");
  }

  const baseValues: Record<string, number> = {};
  for (const variable of formula.variables) {
    if (variable.key === solveFor) continue;
    const value = values[variable.key];
    if (value === undefined || Number.isNaN(value)) {
      throw new Error(`${variable.label} is required`);
    }
    baseValues[variable.key] = value;
  }

  // Multiplicative inverse approach: evaluate the expression with the target set
  // to 1 and 2, infer the exponent, and solve for the target value.
  const withOne = evaluateFormula(formula, { ...baseValues, [solveFor]: 1 });
  const withTwo = evaluateFormula(formula, { ...baseValues, [solveFor]: 2 });

  const ratio = assertFinite(withTwo / withOne, "Cannot solve for this variable");
  const exponent = Math.log(ratio) / Math.log(2);

  if (!Number.isFinite(exponent) || Math.abs(exponent) < EPSILON) {
    throw new Error("Cannot solve for this variable");
  }

  if (Math.abs(desiredOutput) < EPSILON) {
    return 0;
  }

  const solved = Math.pow(desiredOutput / withOne, 1 / exponent);
  return assertFinite(solved, "Could not calculate");
};








