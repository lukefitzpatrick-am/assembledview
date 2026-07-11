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
  CartesianGrid, XAxis, YAxis, Cell, ReferenceLine,
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

export type ChartReferenceLine = {
  /** Value on the numeric axis (Y for vertical bars, X for horizontal). */
  value: number;
  label?: string;
  strokeDasharray?: string;
  /** Defaults to muted axis colour. */
  color?: string;
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
  /** Dashed guides on the numeric axis (e.g. DFII = 100). */
  referenceLines?: ChartReferenceLine[];
}

type BarSegClick = { payload?: Datum; value?: number | [number, number] };

/** Vertical/horizontal bars, grouped / stacked / 100%-stacked. */
export function BarChart({
  data, xKey, series, valueFormat = 'compact', layout = 'group', horizontal = false, showLegend, className,
  onSeriesClick, legendVerticalAlign = 'top', referenceLines,
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
        {horizontal ? <XAxis type="number" tickFormatter={vf} {...axisProps} /> : cat}
        {horizontal ? <YAxis dataKey={xKey} type="category" width={84} {...axisProps} /> : num}
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
        {(referenceLines ?? []).map((rl) => (
          <ReferenceLine
            key={`${rl.value}-${rl.label ?? ''}`}
            {...(horizontal ? { x: rl.value } : { y: rl.value })}
            stroke={rl.color ?? NEUTRAL.axis}
            strokeDasharray={rl.strokeDasharray ?? '4 4'}
            label={rl.label ? { value: rl.label, position: 'insideTopRight', fontSize: 10, fill: NEUTRAL.axis } : undefined}
          />
        ))}
        {series.map((s, i) => {
          const isTop = layout === 'stack' && i === series.length - 1;
          return (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId={stackId}
              fill={(cfg[s.key]?.color as string) ?? `var(--av-chart-${(i % 8) + 1})`}
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

export type ComboSeries = Series & { format?: keyof typeof vfMap };

export type ComboReferenceLine = {
  yAxisId: 'l' | 'r';
  value: number;
  label?: string;
  strokeDasharray?: string;
  color?: string;
};

export interface ComboProps {
  data: Datum[];
  xKey: string;
  /** Single-bar shorthand (gallery / legacy). Prefer `bars`. */
  bar?: ComboSeries;
  /** Single-line shorthand. Prefer `lines`. */
  line?: ComboSeries;
  /** Grouped bars on the left axis (e.g. reach % per audience). */
  bars?: ComboSeries[];
  /** Overlay lines on the right axis (e.g. affinity index per audience). */
  lines?: ComboSeries[];
  /** Default format for all bars when a series omits `format`. */
  barFormat?: keyof typeof vfMap;
  /** Default format for all lines when a series omits `format`. */
  lineFormat?: keyof typeof vfMap;
  referenceLines?: ComboReferenceLine[];
  /** Dim non-matching categories; accent the match (click-highlight). */
  highlightedCategory?: string | null;
  onCategoryClick?: (category: string) => void;
  showLegend?: boolean;
  className?: string;
}

type ComboBarClick = { payload?: Datum };

/** Volume bars + rate line(s) on a second axis. Supports multi-series dual-axis. */
export function ComboChart({
  data, xKey, bar, line, bars: barsProp, lines: linesProp,
  barFormat = 'compact', lineFormat = 'compact',
  referenceLines, highlightedCategory, onCategoryClick, showLegend = true, className,
}: ComboProps) {
  const bars = barsProp?.length ? barsProp : bar ? [bar] : [];
  const lines = linesProp?.length ? linesProp : line ? [line] : [];
  const cfg = withConfig([...bars, ...lines]);
  const bvf = vfMap[bars[0]?.format ?? barFormat];
  const lvf = vfMap[lines[0]?.format ?? lineFormat];
  const xAxisHeight = data.length > 8 ? 52 : 28;
  return (
    <ChartContainer config={cfg} className={className}>
      <ComposedChart
        data={data}
        margin={{ top: 8, right: 12, left: 4, bottom: data.length > 8 ? 12 : 4 }}
        barCategoryGap="22%"
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey={xKey}
          {...axisProps}
          {...(data.length > 8
            ? { angle: -25, textAnchor: 'end' as const, height: xAxisHeight, interval: 0 }
            : {})}
        />
        <YAxis yAxisId="l" width={44} tickFormatter={bvf} {...axisProps} />
        <YAxis yAxisId="r" orientation="right" width={40} tickFormatter={lvf} {...axisProps} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {showLegend && (bars.length + lines.length > 1) ? (
          <ChartLegend content={<ChartLegendContent />} />
        ) : null}
        {(referenceLines ?? []).map((rl) => (
          <ReferenceLine
            key={`${rl.yAxisId}-${rl.value}-${rl.label ?? ''}`}
            yAxisId={rl.yAxisId}
            y={rl.value}
            stroke={rl.color ?? NEUTRAL.axis}
            strokeDasharray={rl.strokeDasharray ?? '4 4'}
            label={rl.label ? { value: rl.label, position: 'insideTopRight', fontSize: 10, fill: NEUTRAL.axis } : undefined}
          />
        ))}
        {bars.map((s, i) => (
          <Bar
            key={s.key}
            yAxisId="l"
            dataKey={s.key}
            name={s.label}
            fill={(cfg[s.key]?.color as string) ?? `var(--av-chart-${(i % 8) + 1})`}
            radius={[3, 3, 0, 0]}
            cursor={onCategoryClick ? 'pointer' : 'default'}
            isAnimationActive={false}
            onClick={
              onCategoryClick
                ? (barProps: ComboBarClick) => {
                    const cat = barProps.payload?.[xKey];
                    if (typeof cat === 'string') onCategoryClick(cat);
                  }
                : undefined
            }
          >
            {highlightedCategory
              ? data.map((row, idx) => {
                  const cat = row[xKey];
                  const active = cat === highlightedCategory;
                  const base = (cfg[s.key]?.color as string) ?? `var(--av-chart-${(i % 8) + 1})`;
                  return (
                    <Cell
                      key={`${s.key}-${idx}`}
                      fill={base}
                      fillOpacity={active ? 1 : 0.28}
                      stroke={active ? base : undefined}
                      strokeWidth={active ? 2 : 0}
                    />
                  );
                })
              : null}
          </Bar>
        ))}
        {lines.map((s, i) => (
          <Line
            key={s.key}
            yAxisId="r"
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={(cfg[s.key]?.color as string) ?? `var(--av-chart-${((bars.length + i) % 8) + 1})`}
            strokeWidth={2.4}
            dot={{ r: 2.6, fill: 'var(--av-surface)', strokeWidth: 1.6 }}
            isAnimationActive={false}
          />
        ))}
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
