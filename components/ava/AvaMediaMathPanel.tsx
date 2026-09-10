"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatNumberAU } from "@/lib/format/chartFormat"
import { formatAUD, parseMoneyInput } from "@/lib/format/money"
import { BUY_TYPES_WITH_DERIVED_DELIVERABLES } from "@/lib/mediaplan/deliverableBudget"
import {
  solveMediaMath,
  type SolveMediaMathOk,
  type SolveMediaMathResult,
} from "@/lib/mediaplan/solveMediaMath"
import { cn } from "@/lib/utils"

export type AvaMediaMathPanelProps = {
  onPrefillComposer: (text: string) => void
}

const BUY_TYPE_OPTIONS = [...BUY_TYPES_WITH_DERIVED_DELIVERABLES]

/** Cold start: no values yet. Solver refusals stay hidden until a field is filled. */
export const AVA_MEDIA_MATH_COLD_HINT = "Enter two values to solve the third."

function parseOptionalNumber(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const parsed = parseMoneyInput(trimmed)
  return parsed == null ? undefined : parsed
}

function formatDeliverables(value: number): string {
  return formatNumberAU(Math.round(value))
}

function formatSolvedValue(
  field: SolveMediaMathOk["solvedField"],
  value: number,
): string {
  if (field === "budget" || field === "rate") return formatAUD(value)
  return formatDeliverables(value)
}

function finiteDisplay(result: SolveMediaMathOk): string | null {
  if (!Number.isFinite(result.solvedValue)) return null
  const formatted = formatSolvedValue(result.solvedField, result.solvedValue)
  if (!formatted) return null
  if (formatted.includes("NaN") || formatted.includes("Infinity")) return null
  return formatted
}

function resultSlotText(result: SolveMediaMathResult): string {
  if (!result.ok) return result.reason
  const formatted = finiteDisplay(result)
  if (!formatted) return "Could not display a finite result."
  const parts = [formatted, result.formula, ...result.roundingApplied]
  return parts.join(" ")
}

function describeSolve(buyType: string, result: SolveMediaMathResult): string {
  if (!result.ok) {
    return `For ${buyType}, media math could not be solved: ${result.reason}`
  }
  const formatted = finiteDisplay(result) ?? String(result.solvedValue)
  return `For ${buyType}, the missing ${result.solvedField} is ${formatted}. Formula: ${result.formula}.`
}

export function AvaMediaMathPanel({ onPrefillComposer }: AvaMediaMathPanelProps) {
  const [buyType, setBuyType] = useState<string>(BUY_TYPE_OPTIONS[0] ?? "cpm")
  const [budgetRaw, setBudgetRaw] = useState("")
  const [rateRaw, setRateRaw] = useState("")
  const [deliverablesRaw, setDeliverablesRaw] = useState("")
  const [weeksRaw, setWeeksRaw] = useState("")
  const [monthsRaw, setMonthsRaw] = useState("")

  const showWeeks = buyType === "weekly_rate"
  const showMonths = buyType === "monthly_rate"
  const quantityKind = showWeeks ? "weeks" : showMonths ? "months" : "deliverables"
  const quantityLabel =
    quantityKind === "weeks" ? "Weeks" : quantityKind === "months" ? "Months" : "Deliverables"
  const quantityRaw = showWeeks ? weeksRaw : showMonths ? monthsRaw : deliverablesRaw
  const setQuantityRaw = showWeeks
    ? setWeeksRaw
    : showMonths
      ? setMonthsRaw
      : setDeliverablesRaw

  const hasAnyInput = [budgetRaw, rateRaw, deliverablesRaw, weeksRaw, monthsRaw].some(
    (s) => s.trim() !== "",
  )

  const result = useMemo((): SolveMediaMathResult => {
    return solveMediaMath({
      buyType,
      budget: parseOptionalNumber(budgetRaw),
      rate: parseOptionalNumber(rateRaw),
      deliverables:
        quantityKind === "deliverables"
          ? parseOptionalNumber(deliverablesRaw)
          : undefined,
      weeks: quantityKind === "weeks" ? parseOptionalNumber(weeksRaw) : undefined,
      months: quantityKind === "months" ? parseOptionalNumber(monthsRaw) : undefined,
    })
  }, [
    buyType,
    budgetRaw,
    rateRaw,
    deliverablesRaw,
    weeksRaw,
    monthsRaw,
    quantityKind,
  ])

  const solvedField = result.ok ? result.solvedField : null
  const slotText = hasAnyInput ? resultSlotText(result) : AVA_MEDIA_MATH_COLD_HINT
  const quantitySolved = solvedField === "deliverables"
  const quantityValue = quantitySolved
    ? (result.ok ? finiteDisplay(result) : null) ?? quantityRaw
    : quantityRaw
  const displayOrRaw = (
    field: SolveMediaMathOk["solvedField"],
    raw: string,
  ): string => {
    if (solvedField !== field || !result.ok) return raw
    return finiteDisplay(result) ?? raw
  }

  return (
    <div
      className="shrink-0 border-b border-border bg-card px-3 py-3"
      data-testid="ava-math-panel"
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="ava-math-buy-type" className="text-xs text-muted-foreground">
            Buy type
          </Label>
          <select
            id="ava-math-buy-type"
            data-testid="ava-math-buy-type"
            className="flex h-9 w-full rounded-input border border-input bg-background px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={buyType}
            onChange={(e) => setBuyType(e.target.value)}
          >
            {BUY_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <MathField
            id="ava-math-budget"
            label="Budget"
            value={displayOrRaw("budget", budgetRaw)}
            readOnly={solvedField === "budget"}
            onChange={setBudgetRaw}
          />
          <MathField
            id="ava-math-rate"
            label="Rate"
            value={displayOrRaw("rate", rateRaw)}
            readOnly={solvedField === "rate"}
            onChange={setRateRaw}
          />
          <MathField
            id={`ava-math-${quantityKind}`}
            label={quantityLabel}
            value={quantityValue}
            readOnly={quantitySolved}
            onChange={setQuantityRaw}
          />
        </div>

        <p
          data-testid="ava-math-result"
          className={cn(
            "min-h-5 text-xs",
            result.ok ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {slotText}
        </p>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-fit"
          onClick={() => onPrefillComposer(describeSolve(buyType, result))}
        >
          Send to Ava
        </Button>
      </div>
    </div>
  )
}

function MathField({
  id,
  label,
  value,
  readOnly,
  onChange,
}: {
  id: string
  label: string
  value: string
  readOnly: boolean
  onChange: (next: string) => void
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        data-testid={id}
        className={cn("h-9 num", readOnly && "bg-muted/50")}
        value={value}
        readOnly={readOnly}
        inputMode="decimal"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
