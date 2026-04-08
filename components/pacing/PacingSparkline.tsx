"use client"

import { useMemo } from "react"
import { Line, LineChart, ResponsiveContainer } from "recharts"
import type { LineItemPacingDailyPoint } from "@/lib/xano/pacing-types"

type Point = { idx: number; actual: number; expected: number }

function buildSeries(
  points: LineItemPacingDailyPoint[],
  expectedTarget: number | null | undefined
): Point[] {
  const sorted = [...points].sort((a, b) => a.delivery_date.localeCompare(b.delivery_date))
  let cum = 0
  const running: number[] = []
  for (const p of sorted) {
    cum += Number(p.spend ?? 0)
    running.push(cum)
  }
  const n = sorted.length
  const target = Number(expectedTarget ?? 0)
  const finalAct = running[n - 1] ?? 0
  return sorted.map((_, i) => {
    const actual = running[i] ?? 0
    const expected =
      n > 0 && target > 0
        ? (target * (i + 1)) / n
        : n > 0
          ? (finalAct * (i + 1)) / n
          : actual
    return { idx: i, actual, expected }
  })
}

export function PacingSparkline({
  points,
  expectedTarget,
}: {
  points: LineItemPacingDailyPoint[] | undefined
  expectedTarget: number | null | undefined
}) {
  const data = useMemo(
    () => buildSeries(Array.isArray(points) ? points : [], expectedTarget),
    [points, expectedTarget]
  )

  if (data.length === 0) {
    return <div className="h-8 w-[120px] rounded border border-dashed border-border/60 bg-muted/20" />
  }

  return (
    <div className="h-8 w-[120px] shrink-0" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey="expected"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={1.2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="actual"
            stroke="hsl(var(--primary))"
            strokeWidth={1.4}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
