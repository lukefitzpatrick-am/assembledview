'use client';
/**
 * AssembledView charts — COMPARISON (bar family)
 * BarChart · HorizontalBarChart · GroupedBarChart · StackedBarChart ·
 * PercentStackedBarChart · ComboChart · Histogram
 * All Recharts-native (shadcn tier).
 */
import * as React from 'react';
import {
  BarChart as RBarChart, Bar, ComposedChart, Line, LabelList, Legend,
  CartesianGrid, XAxis, YAxis, Cell,
} from 'recharts';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { fmt, NEUTRAL } from '@/lib/chart-theme';
import { ChartFilterLegend } from './chart-shell';

type Datum = Record<string, number | string>;
type Series = { key: string; label: string; color?: string };

export type SeriesClickPayload = {
  seriesKey: string;
  category?: string;
  source: 'bar' | 'legend';
};

const axisProps = { tickLine: false, axisLine: false, tick: { fontSize: 11, fill: NEUTRAL.axis } } as const;
const vfMap = {
  dollars: fmt.currencyCompact, number: fmt.number, compact: fmt.compact,
  percent: (n: number) => fmt.percent(n > 1 ? n / 100 : n),
};
function withConfig(series: Series[]): ChartConfig {
  return series.reduce((a, s, i) => {
    a[s.key] = { label: s.label, color: s.color ?? `var(--av-chart-${(i % 8) + 1})` };
    return a;
  }, {} as ChartConfig);
}

export interface BarProps {
  data: Datum[];
  xKey: string;
  series: Series[];
  valueFormat?: keyof typeof vfMap;
  /** 'group' (side by side) | 'stack' | 'expand' (100%) */
  layout?: 'group' | 'stack' | 'expand';
  horizontal?: boolean;
  showLegend?: boolean;
  className?: string;
  /** Legend click filters (dashboard) instead of hiding series. */
  onSeriesClick?: (payload: SeriesClickPayload) => void;
  legendVerticalAlign?: 'top' | 'bottom';
}

type BarSegClick = { payload?: Datum; value?: number | [number, number] };

/** Vertical/horizontal bars, grouped / stacked / 100%-stacked. */
export function BarChart({
  data, xKey, series, valueFormat = 'compact', layout = 'group', horizontal = false, showLegend, className,
  onSeriesClick, legendVerticalAlign = 'top',
}: BarProps) {
  const cfg = withConfig(series);
  const vf = vfMap[valueFormat];
  const stackId = layout === 'group' ? undefined : 'a';
  const filterLegend = onSeriesClick && (showLegend ?? series.length > 1);
  const bottomMargin = filterLegend && legendVerticalAlign === 'bottom' ? 56 : 4;
  const xAxisHeight = !horizontal && data.length > 8 ? 52 : 28;
  const cat = (
    <XAxis dataKey={xKey} type={horizontal ? 'category' : 'category'} {...axisProps}
      {...(horizontal ? { width: 80 } : {})}
      {...(!horizontal && data.length > 8 ? { angle: -25, textAnchor: 'end' as const, height: xAxisHeight, interval: 0 } : {})} />
  );
  const num = (
    <YAxis tickFormatter={layout === 'expand' ? (v) => fmt.percent(v) : vf}
      width={horizontal ? undefined : 44} {...axisProps} />
  );
  const legendItems = series.map((s, i) => ({
    key: s.key,
    label: s.label,
    color: s.color ?? `var(--av-chart-${(i % 8) + 1})`,
  }));
  return (
    <ChartContainer config={cfg} className={className}>
      <RBarChart
        data={data}
        layout={horizontal ? 'vertical' : 'horizontal'}
        stackOffset={layout === 'expand' ? 'expand' : undefined}
        margin={{ top: 8, right: 14, left: 4, bottom: bottomMargin }}
        barCategoryGap={layout === 'group' ? '22%' : '32%'}
      >
        <CartesianGrid vertical={false} horizontal={!horizontal} />
        {horizontal ? <><XAxis type="number" tickFormatter={vf} {...axisProps} />
          <YAxis dataKey={xKey} type="category" width={84} {...axisProps} /></>
          : <>{cat}{num}</>}
        <ChartTooltip content={<ChartTooltipContent formatter={(v) => vf(Number(v))} />} />
        {filterLegend ? (
          <Legend
            verticalAlign={legendVerticalAlign}
            align="center"
            content={() => (
              <ChartFilterLegend
                items={legendItems}
                onSelect={(key) => onSeriesClick!({ seriesKey: key, source: 'legend' })}
              />
            )}
          />
        ) : (showLegend ?? series.length > 1) ? (
          <ChartLegend content={<ChartLegendContent />} />
        ) : null}
        {series.map((s, i) => {
          const isTop = layout === 'stack' && i === series.length - 1;
          return (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId={stackId}
              fill={cfg[s.key]?.color as string}
              radius={
                layout === 'group'
                  ? (horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0])
                  : isTop
                    ? [3, 3, 0, 0]
                    : [0, 0, 0, 0]
              }
              cursor={onSeriesClick ? 'pointer' : 'default'}
              isAnimationActive={false}
              onClick={
                onSeriesClick
                  ? (barProps: BarSegClick) => {
                      const row = barProps.payload;
                      const catRaw = row?.[xKey];
                      if (!row || typeof catRaw !== 'string') return;
                      onSeriesClick({
                        seriesKey: s.key,
                        category: catRaw,
                        source: 'bar',
                      });
                    }
                  : undefined
              }
            />
          );
        })}
      </RBarChart>
    </ChartContainer>
  );
}

export const HorizontalBarChart = (p: Omit<BarProps, 'horizontal'>) => <BarChart {...p} horizontal />;
export const GroupedBarChart = (p: BarProps) => <BarChart {...p} layout="group" showLegend />;
export const StackedBarChart = (p: BarProps) => <BarChart {...p} layout="stack" showLegend />;
export const PercentStackedBarChart = (p: BarProps) => <BarChart {...p} layout="expand" valueFormat="percent" showLegend />;

export interface ComboProps {
  data: Datum[];
  xKey: string;
  bar: Series & { format?: keyof typeof vfMap };
  line: Series & { format?: keyof typeof vfMap };
  className?: string;
}

/** Volume bars + a rate line on a second axis. */
export function ComboChart({ data, xKey, bar, line, className }: ComboProps) {
  const cfg = withConfig([bar, line]);
  const bvf = vfMap[bar.format ?? 'compact'], lvf = vfMap[line.format ?? 'compact'];
  return (
    <ChartContainer config={cfg} className={className}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={xKey} {...axisProps} />
        <YAxis yAxisId="l" width={44} tickFormatter={bvf} {...axisProps} />
        <YAxis yAxisId="r" orientation="right" width={40} tickFormatter={lvf} {...axisProps} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar yAxisId="l" dataKey={bar.key} fill={cfg[bar.key]?.color as string} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        <Line yAxisId="r" type="monotone" dataKey={line.key} stroke={cfg[line.key]?.color as string}
          strokeWidth={2.4} dot={{ r: 2.6, fill: '#fff', strokeWidth: 1.6 }} isAnimationActive={false} />
      </ComposedChart>
    </ChartContainer>
  );
}

/** Distribution of a continuous value — bars with no gap. */
export function Histogram({
  data, xKey, valueKey = 'count', color = 'var(--av-chart-2)', xLabel, className,
}: { data: Datum[]; xKey: string; valueKey?: string; color?: string; xLabel?: string; className?: string }) {
  return (
    <ChartContainer config={{ [valueKey]: { label: 'Count', color } }} className={className}>
      <RBarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: xLabel ? 20 : 4 }} barCategoryGap={1}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={xKey} {...axisProps}
          label={xLabel ? { value: xLabel, position: 'insideBottom', offset: -8, fontSize: 10, fill: NEUTRAL.axis } : undefined} />
        <YAxis width={36} {...axisProps} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey={valueKey} fill={color} isAnimationActive={false} />
      </RBarChart>
    </ChartContainer>
  );
}
