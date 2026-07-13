'use client';
/**
 * AssembledView charts — DISTRIBUTION & RELATIONSHIP
 * ScatterChart (bubble) · RadarChart · SlopeChart
 * Recharts-native (shadcn tier).
 */
import * as React from 'react';
import {
  ScatterChart as RScatterChart, Scatter, ZAxis, ReferenceLine,
  RadarChart as RRadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line, LabelList,
  CartesianGrid, XAxis, YAxis, Cell,
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from '@/components/ui/chart';
import { fmt, NEUTRAL } from '@/lib/chart-theme';

const axisProps = { tickLine: false, axisLine: false, tick: { fontSize: 11, fill: NEUTRAL.axis } } as const;
const colorAt = (i: number, c?: string) => c ?? `var(--av-chart-${(i % 8) + 1})`;

export interface ScatterPoint { x: number; y: number; z?: number; label?: string; color?: string; id?: string }

export type ScatterQuadrantLabels = {
  /** High x, high y */
  topRight: string;
  /** Low x, high y */
  topLeft: string;
  /** High x, low y */
  bottomRight: string;
  /** Low x, low y */
  bottomLeft: string;
};

/** Scatter / bubble — two metrics + optional size (CPA vs ROAS, bubble = spend). */
export function ScatterChart({
  data, xLabel, yLabel, xFormat = 'compact', yFormat = 'compact', className,
  xReference, yReference, quadrantLabels, onPointClick,
}: {
  data: ScatterPoint[];
  xLabel?: string;
  yLabel?: string;
  xFormat?: 'compact' | 'dollars' | 'percent' | 'number';
  yFormat?: 'compact' | 'dollars' | 'percent' | 'number';
  className?: string;
  /** Vertical guide (e.g. median reach). */
  xReference?: number;
  /** Horizontal guide (e.g. index 100). */
  yReference?: number;
  /** Labels for the four quadrants formed by the reference guides. */
  quadrantLabels?: ScatterQuadrantLabels;
  onPointClick?: (point: ScatterPoint) => void;
}) {
  const vf = {
    compact: fmt.compact,
    dollars: fmt.currencyCompact,
    percent: (n: number) => fmt.percent(n / 100),
    number: fmt.number,
  };
  const showQuadrants = quadrantLabels && xReference != null && yReference != null;
  return (
    <ChartContainer config={{ point: { label: 'Series' } }} className={className}>
      <RScatterChart margin={{ top: showQuadrants ? 28 : 8, right: 14, left: 4, bottom: xLabel ? 18 : 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis type="number" dataKey="x" tickFormatter={vf[xFormat]} {...axisProps}
          label={xLabel ? { value: xLabel, position: 'insideBottom', offset: -8, fontSize: 10, fill: NEUTRAL.axis } : undefined} />
        <YAxis type="number" dataKey="y" width={40} tickFormatter={vf[yFormat]} {...axisProps}
          label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', fontSize: 10, fill: NEUTRAL.axis } : undefined} />
        <ZAxis type="number" dataKey="z" range={[40, 420]} />
        {xReference != null ? (
          <ReferenceLine
            x={xReference}
            stroke={NEUTRAL.axis}
            strokeDasharray="4 4"
          />
        ) : null}
        {yReference != null ? (
          <ReferenceLine
            y={yReference}
            stroke={NEUTRAL.axis}
            strokeDasharray="4 4"
          />
        ) : null}
        {showQuadrants ? (
          <>
            <ReferenceLine
              y={yReference}
              stroke="transparent"
              label={{ value: quadrantLabels.topLeft, position: 'insideTopLeft', fontSize: 10, fill: NEUTRAL.axis }}
            />
            <ReferenceLine
              y={yReference}
              stroke="transparent"
              label={{ value: quadrantLabels.topRight, position: 'insideTopRight', fontSize: 10, fill: NEUTRAL.axis }}
            />
            <ReferenceLine
              y={yReference}
              stroke="transparent"
              label={{ value: quadrantLabels.bottomLeft, position: 'insideBottomLeft', fontSize: 10, fill: NEUTRAL.axis }}
            />
            <ReferenceLine
              y={yReference}
              stroke="transparent"
              label={{ value: quadrantLabels.bottomRight, position: 'insideBottomRight', fontSize: 10, fill: NEUTRAL.axis }}
            />
          </>
        ) : null}
        <ChartTooltip cursor={{ strokeDasharray: '3 3' }} content={<ChartTooltipContent hideLabel />} />
        <Scatter
          data={data}
          isAnimationActive={false}
          cursor={onPointClick ? 'pointer' : 'default'}
          onClick={(state) => {
            if (!onPointClick) return;
            const payload = (state as { payload?: ScatterPoint })?.payload;
            if (payload) onPointClick(payload);
          }}
        >
          {data.map((p, i) => <Cell key={p.id ?? i} fill={colorAt(i, p.color)} fillOpacity={0.55} stroke={colorAt(i, p.color)} />)}
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
          <Radar key={s.key} dataKey={s.key} stroke={cfg[s.key]?.color as string} strokeWidth={2}
            fill={cfg[s.key]?.color as string} fillOpacity={0.16} isAnimationActive={false} />
        ))}
      </RRadarChart>
    </ChartContainer>
  );
}

/** Slope — rank change between two periods. */
export function SlopeChart({
  data, leftLabel, rightLabel, className,
}: { data: { label: string; left: number; right: number; color?: string }[]; leftLabel: string; rightLabel: string; className?: string }) {
  const rows = [{ period: leftLabel } as Record<string, string | number>, { period: rightLabel } as Record<string, string | number>];
  data.forEach((d) => { rows[0]![d.label] = d.left; rows[1]![d.label] = d.right; });
  const cfg = data.reduce((a, d, i) => { a[d.label] = { label: d.label, color: colorAt(i, d.color) }; return a; }, {} as ChartConfig);
  return (
    <ChartContainer config={cfg} className={className}>
      <LineChart data={rows} margin={{ top: 12, right: 56, left: 8, bottom: 4 }}>
        <XAxis dataKey="period" {...axisProps} />
        <YAxis hide />
        <ChartTooltip content={<ChartTooltipContent />} />
        {data.map((d) => (
          <Line key={d.label} dataKey={d.label} stroke={cfg[d.label]?.color as string} strokeWidth={2.2}
            dot={{ r: 3 }} isAnimationActive={false}>
            <LabelList dataKey={d.label} position="right" fontSize={10} fill={NEUTRAL.label}
              formatter={(v: number, _e: unknown, idx: number) => (idx === 1 ? d.label : '')} />
          </Line>
        ))}
      </LineChart>
    </ChartContainer>
  );
}
