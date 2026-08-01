import { evaluateFormula } from "./evaluator";
import { FormulaDSL } from "./types";

export const OUTPUT_KEY = "__output";

export type SolveParams = {
  formula: FormulaDSL;
  solveFor: string; // variable key or "output"
  values: Record<string, number>;
  desiredOutput?: number;
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

const PROBE_LADDER: readonly number[] = [
  -1e9, -1e6, -1e3, -100, -10, -1, -0.1, -1e-3, -1e-6,
  0,
  1e-6, 1e-3, 0.1, 1, 10, 100, 1e3, 1e6, 1e9,
];

const BISECT_ABS_TOL = 1e-12;
const BISECT_MAX_ITERS = 200;
const ROOT_REL_TOL = 1e-6;

/** Residual g(x) = f(x) - desiredOutput; null when the formula is undefined at x. */
function residualAt(
  formula: FormulaDSL,
  baseValues: Record<string, number>,
  solveFor: string,
  x: number,
  desiredOutput: number,
): number | null {
  try {
    const y = evaluateFormula(formula, { ...baseValues, [solveFor]: x });
    if (!Number.isFinite(y)) return null;
    const g = y - desiredOutput;
    return Number.isFinite(g) ? g : null;
  } catch {
    return null;
  }
}

function bisectRoot(
  formula: FormulaDSL,
  baseValues: Record<string, number>,
  solveFor: string,
  desiredOutput: number,
  a0: number,
  b0: number,
  gA0: number,
  gB0: number,
): number | null {
  let a = a0;
  let b = b0;
  let gA = gA0;
  let gB = gB0;

  if (gA === 0) return a;
  if (gB === 0) return b;

  for (let i = 0; i < BISECT_MAX_ITERS; i++) {
    if (Math.abs(b - a) <= Math.max(BISECT_ABS_TOL, BISECT_ABS_TOL * Math.abs(b))) {
      break;
    }
    const mid = (a + b) / 2;
    const gMid = residualAt(formula, baseValues, solveFor, mid, desiredOutput);
    if (gMid === null) {
      // Hole inside the bracket — abandon this bracket.
      return null;
    }
    if (gMid === 0) return mid;
    if (Math.sign(gMid) === Math.sign(gA)) {
      a = mid;
      gA = gMid;
    } else {
      b = mid;
      gB = gMid;
    }
  }

  return (a + b) / 2;
}

function rootVerified(
  formula: FormulaDSL,
  baseValues: Record<string, number>,
  solveFor: string,
  root: number,
  desiredOutput: number,
): boolean {
  const gRoot = residualAt(formula, baseValues, solveFor, root, desiredOutput);
  if (gRoot === null || !Number.isFinite(gRoot)) return false;
  const scale = Math.max(1, Math.abs(desiredOutput));
  return Math.abs(gRoot) <= ROOT_REL_TOL * scale;
}

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

  // Evaluate the full ladder; brackets come only from adjacent ladder steps
  // that both defined — never span a pole (e.g. k/x at 0).
  const gByX = new Map<number, number>();
  for (const x of PROBE_LADDER) {
    const g = residualAt(formula, baseValues, solveFor, x, desiredOutput);
    if (g !== null) gByX.set(x, g);
  }

  type Bracket = { a: number; b: number; gA: number; gB: number };
  const brackets: Bracket[] = [];
  for (let i = 0; i < PROBE_LADDER.length - 1; i++) {
    const a = PROBE_LADDER[i]!;
    const b = PROBE_LADDER[i + 1]!;
    const gA = gByX.get(a);
    const gB = gByX.get(b);
    if (gA === undefined || gB === undefined) continue;
    if (gA === 0 || gB === 0 || Math.sign(gA) !== Math.sign(gB)) {
      brackets.push({ a, b, gA, gB });
    }
  }

  if (brackets.length === 0) {
    throw new Error("Cannot solve for this variable");
  }

  const verifiedRoots: number[] = [];
  for (const bracket of brackets) {
    const root = bisectRoot(
      formula,
      baseValues,
      solveFor,
      desiredOutput,
      bracket.a,
      bracket.b,
      bracket.gA,
      bracket.gB,
    );
    if (root === null) continue;
    if (!rootVerified(formula, baseValues, solveFor, root, desiredOutput)) continue;
    verifiedRoots.push(root);
  }

  if (verifiedRoots.length === 0) {
    throw new Error("Cannot solve for this variable");
  }

  // Formulas quadratic (or higher) in the target can have two valid solutions;
  // by convention prefer the smallest-magnitude non-negative root, else the
  // smallest-magnitude root overall.
  const nonNegative = verifiedRoots.filter((r) => r >= 0);
  const pool = nonNegative.length > 0 ? nonNegative : verifiedRoots;
  pool.sort((a, b) => Math.abs(a) - Math.abs(b));
  return pool[0]!;
};
