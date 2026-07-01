'use client';
/**
 * AssembledView charts — TRENDS OVER TIME (line family)
 * LineChart · MultiLineChart · AreaChart · StackedAreaChart · StepChart · Sparkline
 * All Recharts-native (shadcn tier).
 */
import * as React from 'react';
import {
  LineChart as RLineChart, Line, AreaChart as RAreaChart, Area,
  CartesianGrid, XAxis, YAxis, Legend,
} from 'recharts';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { fmt, NEUTRAL } from '@/lib/chart-theme';

type Datum = Record<string, number | string>;
type Series = { key: string; label: string; color?: string };

const axisProps = {
  tickLine: false, axisLine: false,
  tick: { fontSize: 11, fill: NEUTRAL.axis },
} as const;

function withConfig(series: Series[]): ChartConfig {
  return series.reduce((acc, s, i) => {
    acc[s.key] = { label: s.label, color: s.color ?? `var(--av-chart-${(i % 8) + 1})` };
    return acc;
  }, {} as ChartConfig);
}

export interface LineProps {
  data: Datum[];
  xKey: string;
  series: Series[];
  /** dollars | number | percent | compact */
  valueFormat?: keyof typeof valueFormatters;
  smooth?: boolean;
  dots?: boolean;
  showLegend?: boolean;
  className?: string;
}

const valueFormatters = {
  dollars: fmt.currencyCompact,
  number: fmt.number,
  percent: (n: number) => fmt.percent(n > 1 ? n / 100 : n),
  compact: fmt.compact,
};

/** Single or multi-line trend. */
export function LineChart({
  data, xKey, series, valueFormat = 'compact', smooth = true, dots = true, showLegend, className,
}: LineProps) {
  const cfg = withConfig(series);
  const vf = valueFormatters[valueFormat];
  return (
    <ChartContainer config={cfg} className={className}>
      <RLineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={xKey} {...axisProps} />
        <YAxis width={40} tickFormatter={vf} {...axisProps} />
        <ChartTooltip content={<ChartTooltipContent formatter={(v) => vf(Number(v))} />} />
        {(showLegend ?? series.length > 1) && <ChartLegend content={<ChartLegendContent />} />}
        {series.map((s) => (
          <Line
            key={s.key} type={smooth ? 'monotone' : 'linear'} dataKey={s.key}
            stroke={`var(--color-${s.key})`} strokeWidth={2}
            dot={dots ? { r: 2.5, fill: '#fff', strokeWidth: 1.5 } : false}
            activeDot={{ r: 4 }} isAnimationActive={false}
          />
        ))}
      </RLineChart>
    </ChartContainer>
  );
}

/** Alias for clarity at call sites. */
export const MultiLineChart = (p: LineProps) => <LineChart {...p} showLegend />;

export interface AreaProps extends Omit<LineProps, 'dots'> { stacked?: boolean; }

/** Area / stacked-area. Set `stacked` for cumulative channels. */
export function AreaChart({
  data, xKey, series, valueFormat = 'compact', smooth = true, stacked = false, showLegend, className,
}: AreaProps) {
  const cfg = withConfig(series);
  const vf = valueFormatters[valueFormat];
  return (
    <ChartContainer config={cfg} className={className}>
      <RAreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={xKey} {...axisProps} />
        <YAxis width={40} tickFormatter={vf} {...axisProps} />
        <ChartTooltip content={<ChartTooltipContent formatter={(v) => vf(Number(v))} />} />
        {(showLegend ?? series.length > 1) && <ChartLegend content={<ChartLegendContent />} />}
        {series.map((s) => (
          <Area
            key={s.key} type={smooth ? 'monotone' : 'linear'} dataKey={s.key}
            stackId={stacked ? 'a' : undefined}
            stroke={`var(--color-${s.key})`} strokeWidth={2}
            fill={`var(--color-${s.key})`} fillOpacity={stacked ? 0.85 : 0.12}
            isAnimationActive={false}
          />
        ))}
      </RAreaChart>
    </ChartContainer>
  );
}

export const StackedAreaChart = (p: AreaProps) => <AreaChart {...p} stacked showLegend />;

/** Step line — a rate/state that holds then jumps (pacing targets). */
export function StepChart({ data, xKey, series, valueFormat = 'compact', className }: LineProps) {
  const cfg = withConfig(series);
  const vf = valueFormatters[valueFormat];
  return (
    <ChartContainer config={cfg} className={className}>
      <RLineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={xKey} {...axisProps} />
        <YAxis width={40} tickFormatter={vf} {...axisProps} />
        <ChartTooltip content={<ChartTooltipContent formatter={(v) => vf(Number(v))} />} />
        {series.map((s) => (
          <Line key={s.key} type="stepAfter" dataKey={s.key}
            stroke={`var(--color-${s.key})`} strokeWidth={2} dot={false} isAnimationActive={false} />
        ))}
      </RLineChart>
    </ChartContainer>
  );
}

/** Tiny inline sparkline — no axes. Pair with a headline figure. */
export function Sparkline({
  data, dataKey = 'value', color = 'var(--av-chart-1)', width = 120, height = 36,
}: { data: Datum[]; dataKey?: string; color?: string; width?: number; height?: number }) {
  return (
    <ChartContainer config={{ [dataKey]: { color } }} className="aspect-auto" style={{ width, height }}>
      <RLineChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 2 }}>
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2}
          dot={false} isAnimationActive={false} />
      </RLineChart>
    </ChartContainer>
  );
}
