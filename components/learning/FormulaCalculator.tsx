"use client"

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormulaDSL, FormulaVariable } from "@/src/lib/learning/types";
import { formatValue } from "@/src/lib/learning/evaluator";
import { OUTPUT_KEY, formatNumericInput, roundToTwo, solveForOutput, solveForVariable } from "@/src/lib/learning/solver";

type Props = {
  formula: FormulaDSL;
  fallbackText?: string;
};

export function FormulaCalculator({ formula, fallbackText }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [solveFor, setSolveFor] = useState<string>("output");

  const isUnmapped = formula.unmapped || formula.variables.length === 0;

  const description = useMemo(() => {
    if (formula.inferred) return "Formula not fully mapped. Displaying expression only.";
    return "Select the field to solve. Enter the others to auto-calc.";
  }, [formula.inferred]);

  const targetLabel = useMemo(() => {
    if (solveFor === "output") return formula.output?.label || "Result";
    const variable = formula.variables.find((v) => v.key === solveFor);
    return variable?.label || solveFor;
  }, [formula.output?.label, formula.variables, solveFor]);

  const parseNumber = (raw: string | undefined, label: string) => {
    if (raw === undefined || raw === "") {
      throw new Error(`${label} is required`);
    }
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      throw new Error(`${label} must be a number`);
    }
    return parsed;
  };

  const hasAllValues = (variables: FormulaVariable[]) => {
    return variables.every((variable) => {
      if (solveFor === variable.key) return true;
      const raw = values[variable.key];
      return raw !== undefined && raw !== "";
    });
  };

  const autoCalculate = useCallback(() => {
    if (isUnmapped) return;
    setError("");

    try {
      if (solveFor === "output") {
        if (!hasAllValues(formula.variables)) {
          setResult("");
          return;
        }
        const numericValues: Record<string, number> = {};
        for (const variable of formula.variables) {
          numericValues[variable.key] = parseNumber(values[variable.key], variable.label);
        }
        const numericResult = solveForOutput(formula, numericValues);
        setResult(formatValue(roundToTwo(numericResult), formula.format));
        return;
      }

      const desiredOutput = values[OUTPUT_KEY];
      const otherVariables = formula.variables.filter((v) => v.key !== solveFor);
      if (!desiredOutput || !hasAllValues(otherVariables)) {
        setResult("");
        return;
      }

      const numericValues: Record<string, number> = {};
      for (const variable of otherVariables) {
        numericValues[variable.key] = parseNumber(values[variable.key], variable.label);
      }

      const solvedValue = solveForVariable({
        formula,
        solveFor,
        values: numericValues,
        desiredOutput: parseNumber(desiredOutput, formula.output.label || "Output"),
      });

      const rounded = formatNumericInput(solvedValue);
      setValues((prev) => {
        if (prev[solveFor] === rounded) return prev;
        return { ...prev, [solveFor]: rounded };
      });
      setResult(rounded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not calculate");
      setResult("");
    }
  }, [formula, isUnmapped, solveFor, values]);

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleReset = () => {
    setValues({});
    setResult("");
    setError("");
    setSolveFor("output");
  };

  const handleCalculate = () => autoCalculate();

  useEffect(() => autoCalculate(), [autoCalculate]);

  if (isUnmapped) {
    return (
      <Alert variant="default" className="bg-muted/60">
        <AlertTitle>Formula reference</AlertTitle>
        <AlertDescription>{fallbackText || formula.expression}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="grid gap-3 sm:grid-cols-2 items-end">
        <div className="space-y-1.5">
          <Label className="text-sm font-medium text-foreground">Solving for</Label>
          <Select value={solveFor} onValueChange={setSolveFor}>
            <SelectTrigger>
              <SelectValue placeholder="Choose target" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="output">{formula.output?.label || "Output"}</SelectItem>
              {formula.variables.map((variable) => (
                <SelectItem key={variable.key} value={variable.key}>
                  {variable.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          Enter the other fields; the selected one will auto-calculate with 2-decimal rounding.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {formula.variables.map((variable) => (
          <div key={variable.key} className="space-y-1.5">
            <Label className="text-sm font-medium text-foreground">
              {variable.label}
              {variable.unit ? ` (${variable.unit})` : ""}
              {variable.required && <span className="text-brand ml-1">*</span>}
            </Label>
            <Input
              inputMode="decimal"
              value={values[variable.key] ?? ""}
              onChange={(e) => handleChange(variable.key, e.target.value)}
              placeholder={solveFor === variable.key ? "Auto-calculated" : "0"}
              readOnly={solveFor === variable.key}
              disabled={solveFor === variable.key}
            />
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm font-medium text-foreground">
          {formula.output?.label || "Output"}
          {formula.output?.unit ? ` (${formula.output.unit})` : ""}
        </Label>
        <Input
          inputMode="decimal"
          value={solveFor === "output" ? result : values[OUTPUT_KEY] ?? ""}
          onChange={(e) => handleChange(OUTPUT_KEY, e.target.value)}
          placeholder={solveFor === "output" ? "Auto-calculated" : "Enter desired output"}
          readOnly={solveFor === "output"}
          disabled={solveFor === "output"}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={handleCalculate} className="bg-primary text-primary-foreground hover:bg-primary/90">
          Calculate
        </Button>
        <Button variant="ghost" onClick={handleReset}>
          Reset
        </Button>
        <span className="text-sm text-muted-foreground">
          Solving for: {targetLabel}
        </span>
      </div>
      <Separator />
      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs uppercase text-muted-foreground tracking-wide mb-1">Result</p>
        <p className="text-2xl font-semibold text-foreground">
          {solveFor === "output" ? result || "—" : values[solveFor] || "—"}
        </p>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Check inputs</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}





