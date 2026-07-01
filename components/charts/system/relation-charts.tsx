'use client';
/**
 * AssembledView charts — DISTRIBUTION & RELATIONSHIP
 * ScatterChart (bubble) · RadarChart · SlopeChart
 * Recharts-native (shadcn tier).
 */
import * as React from 'react';
import {
  ScatterChart as RScatterChart, Scatter, ZAxis,
  RadarChart as RRadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line, LabelList,
  CartesianGrid, XAxis, YAxis, Cell,
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from '@/components/ui/chart';
import { fmt, NEUTRAL } from '@/lib/chart-theme';

const axisProps = { tickLine: false, axisLine: false, tick: { fontSize: 11, fill: NEUTRAL.axis } } as const;
const colorAt = (i: number, c?: string) => c ?? `var(--av-chart-${(i % 8) + 1})`;

export interface ScatterPoint { x: number; y: number; z?: number; label?: string; color?: string }

/** Scatter / bubble — two metrics + optional size (CPA vs ROAS, bubble = spend). */
export function ScatterChart({
  data, xLabel, yLabel, xFormat = 'compact', yFormat = 'compact', className,
}: {
  data: ScatterPoint[]; xLabel?: string; yLabel?: string;
  xFormat?: 'compact' | 'dollars' | 'percent'; yFormat?: 'compact' | 'dollars' | 'percent'; className?: string;
}) {
  const vf = { compact: fmt.compact, dollars: fmt.currencyCompact, percent: (n: number) => fmt.percent(n / 100) };
  return (
    <ChartContainer config={{ point: { label: 'Series' } }} className={className}>
      <RScatterChart margin={{ top: 8, right: 14, left: 4, bottom: xLabel ? 18 : 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis type="number" dataKey="x" tickFormatter={vf[xFormat]} {...axisProps}
          label={xLabel ? { value: xLabel, position: 'insideBottom', offset: -8, fontSize: 10, fill: NEUTRAL.axis } : undefined} />
        <YAxis type="number" dataKey="y" width={40} tickFormatter={vf[yFormat]} {...axisProps}
          label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', fontSize: 10, fill: NEUTRAL.axis } : undefined} />
        <ZAxis type="number" dataKey="z" range={[40, 420]} />
        <ChartTooltip cursor={{ strokeDasharray: '3 3' }} content={<ChartTooltipContent hideLabel />} />
        <Scatter data={data} isAnimationActive={false}>
          {data.map((p, i) => <Cell key={i} fill={colorAt(i, p.color)} fillOpacity={0.55} stroke={colorAt(i, p.color)} />)}
        </Scatter>
      </RScatterChart>
    </ChartContainer>
  );
}

export interface RadarSeries { key: string; label: string; color?: string }

/** Radar — multi-metric profile of a channel / campaign. */
export function RadarChart({
  data, axisKey, series, className,
}: { data: Record<string, number | string>[]; axisKey: string; series: RadarSeries[]; className?: string }) {
  const cfg = series.reduce((a, s, i) => { a[s.key] = { label: s.label, color: colorAt(i, s.color) }; return a; }, {} as ChartConfig);
  return (
    <ChartContainer config={cfg} className={className}>
      <RRadarChart data={data} margin={{ top: 12, right: 12, bottom: 12, left: 12 }}>
        <PolarGrid stroke="var(--av-grid)" />
        <PolarAngleAxis dataKey={axisKey} tick={{ fontSize: 10, fill: NEUTRAL.axis }} />
        <PolarRadiusAxis tick={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
        {series.map((s) => (
          <Radar key={s.key} dataKey={s.key} stroke={`var(--color-${s.key})`} strokeWidth={2}
            fill={`var(--color-${s.key})`} fillOpacity={0.16} isAnimationActive={false} />
        ))}
      </RRadarChart>
    </ChartContainer>
  );
}

/** Slope — rank change between two periods. */
export function SlopeChart({
  data, leftLabel, rightLabel, className,
}: { data: { label: string; left: number; right: number; color?: string }[]; leftLabel: string; rightLabel: string; className?: string }) {
  const rows = [{ period: leftLabel } as any, { period: rightLabel } as any];
  data.forEach((d) => { rows[0][d.label] = d.left; rows[1][d.label] = d.right; });
  const cfg = data.reduce((a, d, i) => { a[d.label] = { label: d.label, color: colorAt(i, d.color) }; return a; }, {} as ChartConfig);
  return (
    <ChartContainer config={cfg} className={className}>
      <LineChart data={rows} margin={{ top: 12, right: 56, left: 8, bottom: 4 }}>
        <XAxis dataKey="period" {...axisProps} />
        <YAxis hide />
        <ChartTooltip content={<ChartTooltipContent />} />
        {data.map((d) => (
          <Line key={d.label} dataKey={d.label} stroke={`var(--color-${d.label})`} strokeWidth={2.2}
            dot={{ r: 3 }} isAnimationActive={false}>
            <LabelList dataKey={d.label} position="right" fontSize={10} fill={NEUTRAL.label}
              formatter={(v: number, _e: any, idx: number) => (idx === 1 ? d.label : '')} />
          </Line>
        ))}
      </LineChart>
    </ChartContainer>
  );
}
