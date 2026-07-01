"use client"

import { useMemo } from "react"

import { BaseChartCard, PacingBandChart } from "@/components/charts/system"
import { channelColorFor, STATUS } from "@/lib/chart-theme"
import type { TargetCurvePoint } from "@/lib/kpi/deliveryTargetCurve"

import { reshapeCumulativeToPacingBand } from "./deliveryChartReshape"

export interface DeliveryPacingChartProps {
  targetCurve: TargetCurvePoint[]
  cumulativeActual: Array<{ date: string; actual: number }>
  asAtDate: string | null
  deliverableLabel: string
  brandColour?: string
}

export function DeliveryPacingChart({
  targetCurve,
  cumulativeActual,
  asAtDate,
  deliverableLabel,
  brandColour,
}: DeliveryPacingChartProps) {
  const pacing = useMemo(
    () => reshapeCumulativeToPacingBand(targetCurve, cumulativeActual, asAtDate),
    [targetCurve, cumulativeActual, asAtDate],
  )

  if (targetCurve.length < 2) return null

  const targetColor = brandColour ?? STATUS.ahead
  const actualColor = channelColorFor(deliverableLabel, 1)

  return (
    <BaseChartCard
      title={`Cumulative ${deliverableLabel}`}
      subtitle="Actual vs expected delivery envelope"
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
