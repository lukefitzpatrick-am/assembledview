import { format } from "date-fns"

import type { FinanceForecastScenario } from "@/lib/types/financeForecast"

export function scenarioDisplayLabel(scenario: FinanceForecastScenario): string {
  return scenario === "confirmed" ? "Confirmed" : "Confirmed + Probable"
}

/**
 * Human-readable, unique-by-second label for automated snapshots.
 */
export function formatAutomatedSnapshotLabel(
  financialYearStart: number,
  scenario: FinanceForecastScenario,
  takenAt: Date,
  options?: { repeatCapture?: boolean }
): string {
  const fy = `${financialYearStart}–${String(financialYearStart + 1).slice(-2)}`
  const ts = format(takenAt, "yyyy-MM-dd HH:mm:ss")
  const base = `Forecast · FY ${fy} · ${scenarioDisplayLabel(scenario)} · ${ts} UTC`
  return options?.repeatCapture ? `${base} · Repeat capture` : base
}
