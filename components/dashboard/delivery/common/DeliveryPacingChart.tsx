"use client"

import { useMemo } from "react"

import { BaseChartCard, PacingBandChart } from "@/components/charts/system"
import { BRAND } from "@/lib/brand"
import type { TargetCurvePoint } from "@/lib/kpi/deliveryTargetCurve"

import { reshapeCumulativeToPacingBand } from "./deliveryChartReshape"

export interface DeliveryPacingChartProps {
  targetCurve: TargetCurvePoint[]
  cumulativeActual: Array<{ date: string; actual: number }>
  asAtDate: string | null
  deliverableLabel: string
  /** @deprecated Unused for paint. Actual is forest; expected is context. */
  brandColour?: string
}

export function DeliveryPacingChart({
  targetCurve,
  cumulativeActual,
  asAtDate,
  deliverableLabel,
  brandColour: _brandColour,
}: DeliveryPacingChartProps) {
  const pacing = useMemo(
    () => reshapeCumulativeToPacingBand(targetCurve, cumulativeActual, asAtDate),
    [targetCurve, cumulativeActual, asAtDate],
  )

  if (targetCurve.length < 2) return null

  const targetColor = BRAND.colour.context
  const actualColor = BRAND.colour.forest

  const exportRows = pacing.weekLabels.map((week, i) => ({
    week: week || String(i + 1),
    date: targetCurve[i]?.date ?? "",
    actual: pacing.actual[i],
    target: pacing.target[i],
    bandLow: pacing.bandLow[i],
    bandHigh: pacing.bandHigh[i],
  }))

  return (
    <BaseChartCard
      title={`Cumulative ${deliverableLabel}`}
      subtitle="Actual vs expected delivery envelope"
      exportPage="pacing"
      exportSeries={{
        rows: exportRows,
        columns: ["week", "date", "actual", "target", "bandLow", "bandHigh"],
      }}
    >
      <PacingBandChart
        actual={pacing.actual}
        target={pacing.target}
        bandLow={pacing.bandLow}
        bandHigh={pacing.bandHigh}
        weekLabels={pacing.weekLabels}
        todayIndex={pacing.todayIndex}
        ymax={pacing.ymax}
        targetColor={targetColor}
        actualColor={actualColor}
        actualLabel={`${deliverableLabel} actual`}
      />
    </BaseChartCard>
  )
}
