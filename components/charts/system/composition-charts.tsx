'use client';
/**
 * AssembledView charts — COMPOSITION (part-to-whole)
 * DonutChart · GaugeChart · RadialBarsChart · TreemapChart · FunnelChart
 * Recharts-native; Treemap/Funnel are "Recharts +custom" (styled content).
 */
import * as React from 'react';
import {
  PieChart, Pie, Cell, RadialBarChart, RadialBar, PolarAngleAxis,
  Treemap, FunnelChart as RFunnelChart, Funnel, LabelList,
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { fmt, CHART_PALETTE } from '@/lib/chart-theme';

type Slice = { label: string; value: number; color?: string };
const colorAt = (i: number, c?: string) => c ?? `var(--av-chart-${(i % 8) + 1})`;
const cfgFrom = (slices: Slice[]): ChartConfig =>
  slices.reduce((a, s, i) => { a[s.label] = { label: s.label, color: colorAt(i, s.color) }; return a; }, {} as ChartConfig);

export interface DonutProps {
  data: Slice[];
  /** center figure, e.g. "$521k" */
  centerValue?: string;
  centerLabel?: string;
  valueFormat?: 'percent' | 'dollars' | 'number';
  className?: string;
  /** Fixed plot height (px); overrides ChartContainer aspect-video sizing. */
  plotHeight?: number;
}

/** Donut / media-mix share. Total in the hole. */
export function DonutChart({ data, centerValue, centerLabel = 'Total', valueFormat = 'percent', className, plotHeight }: DonutProps) {
  const vf = valueFormat === 'dollars' ? fmt.currencyCompact : valueFormat === 'number' ? fmt.number : (n: number) => fmt.percent(n > 1 ? n / 100 : n);
  return (
    <ChartContainer config={cfgFrom(data)} className={className} plotHeight={plotHeight}>
      <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <ChartTooltip content={<ChartTooltipContent nameKey="label" formatter={(v) => vf(Number(v))} />} />
        <Pie data={data} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="92%"
          paddingAngle={1.5} strokeWidth={0} isAnimationActive={false}>
          {data.map((s, i) => <Cell key={i} fill={colorAt(i, s.color)} />)}
        </Pie>
        {centerValue && (
          <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
            <tspan x="50%" dy="-0.5em" fontSize="11" fill="var(--av-axis)">{centerLabel}</tspan>
            <tspan x="50%" dy="1.5em" fontSize="20" fontWeight="800" fill="var(--av-ink)" className="tabular-nums">{centerValue}</tspan>
          </text>
        )}
      </PieChart>
    </ChartContainer>
  );
}

/** Single 0–100% gauge (utilisation / pacing). */
export function GaugeChart({
  value, label = 'Budget utilised', color = 'var(--av-chart-1)', className,
}: { value: number; label?: string; color?: string; className?: string }) {
  const pct = value > 1 ? value : value * 100;
  const data = [{ name: label, value: pct, fill: color }];
  return (
    <ChartContainer config={{ [label]: { label, color } }} className={className}>
      <RadialBarChart data={data} startAngle={225} endAngle={-45} innerRadius="68%" outerRadius="100%">
        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
        <RadialBar background={{ fill: 'var(--av-grid)' }} dataKey="value" cornerRadius={10} isAnimationActive={false} />
        <text x="50%" y="46%" textAnchor="middle" fontSize="30" fontWeight="800" fill="var(--av-ink)" className="tabular-nums">
          {Math.round(pct)}%
        </text>
        <text x="50%" y="60%" textAnchor="middle" fontSize="11" fill="var(--av-axis)">{label}</text>
      </RadialBarChart>
    </ChartContainer>
  );
}

/** Concentric proportional rings. */
export function RadialBarsChart({ data, className }: { data: Slice[]; className?: string }) {
  const rows = data.map((s, i) => ({ name: s.label, value: s.value > 1 ? s.value : s.value * 100, fill: colorAt(i, s.color) }));
  return (
    <ChartContainer config={cfgFrom(data)} className={className}>
      <RadialBarChart data={rows} startAngle={90} endAngle={-270} innerRadius="30%" outerRadius="100%" barSize={12}>
        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
        <ChartTooltip content={<ChartTooltipContent nameKey="name" formatter={(v) => fmt.percent(Number(v) / 100)} />} />
        <RadialBar background={{ fill: 'var(--av-grid)' }} dataKey="value" cornerRadius={6} isAnimationActive={false} />
      </RadialBarChart>
    </ChartContainer>
  );
}

export interface TreemapProps {
  data: Slice[];
  className?: string;
  colorByName?: Record<string, string>;
  onNodeClick?: (name: string) => void;
  valueFormat?: 'dollars' | 'number' | 'compact';
}

/** Treemap — spend by category; area = value. */
export function TreemapChart({
  data,
  className,
  colorByName,
  onNodeClick,
  valueFormat = 'dollars',
}: TreemapProps) {
  const vf =
    valueFormat === 'dollars'
      ? fmt.currencyCompact
      : valueFormat === 'number'
        ? fmt.number
        : fmt.compact;
  const rows = data.map((s, i) => ({
    name: s.label,
    size: s.value,
    fill: colorByName?.[s.label] ?? colorAt(i, s.color),
  }));
  const TreemapNode = (p: {
    x: number;
    y: number;
    width: number;
    height: number;
    name?: string;
    size?: number;
    fill?: string;
  }) => {
    const { x, y, width, height, name, size, fill } = p;
    if (width <= 0 || height <= 0) return null;
    const rx = Math.round(x);
    const ry = Math.round(y);
    const rw = Math.max(0, Math.round(width));
    const rh = Math.max(0, Math.round(height));
    const minSide = Math.min(rw, rh);
    const showLabel = minSide >= 44;
    return (
      <g
        style={{ cursor: onNodeClick ? 'pointer' : undefined }}
        onClick={() => name && onNodeClick?.(name)}
      >
        <rect
          x={rx + 1}
          y={ry + 1}
          width={rw - 2}
          height={rh - 2}
          rx={4}
          fill={fill}
          stroke="var(--av-surface)"
          strokeWidth={2}
        />
        {minSide >= 28 && rw > 4 && rh > 4 ? (
          <>
            {showLabel ? (
              <>
                <text x={rx + 8} y={ry + 18} fontSize={11} fontWeight={700} fill="var(--av-surface)">
                  {name}
                </text>
                <text
                  x={rx + 8}
                  y={ry + 33}
                  fontSize={11}
                  fill="var(--av-surface)"
                  className="tabular-nums"
                  opacity={0.9}
                >
                  {vf(Number(size) || 0)}
                </text>
              </>
            ) : (
              <text x={rx + 8} y={ry + 18} fontSize={10} fontWeight={700} fill="var(--av-surface)">
                {name}
              </text>
            )}
          </>
        ) : null}
      </g>
    );
  };
  return (
    <ChartContainer config={cfgFrom(data)} className={className}>
      <Treemap
        data={rows}
        dataKey="size"
        stroke="transparent"
        content={TreemapNode as unknown as React.ReactElement}
        isAnimationActive={false}
      >
        <ChartTooltip
          content={
            <ChartTooltipContent
              nameKey="name"
              formatter={(v) => vf(Number(v))}
              className="text-[var(--av-ink)] [&_.text-muted-foreground]:text-[var(--av-axis)] [&_.text-foreground]:text-[var(--av-ink)]"
            />
          }
        />
      </Treemap>
    </ChartContainer>
  );
}

/** Funnel — conversion drop-off across stages. */
export function FunnelChart({ data, className }: { data: Slice[]; className?: string }) {
  const rows = data.map((s, i) => ({ name: s.label, value: s.value, fill: colorAt(i, s.color) }));
  return (
    <ChartContainer config={cfgFrom(data)} className={className}>
      <RFunnelChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
        <Funnel dataKey="value" data={rows} isAnimationActive={false}>
          <LabelList position="center" fill="#fff" stroke="none" fontSize={11} fontWeight={700}
            formatter={(v: number) => v + '%'} />
        </Funnel>
      </RFunnelChart>
    </ChartContainer>
  );
}
