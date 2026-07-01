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
}

/** Donut / media-mix share. Total in the hole. */
export function DonutChart({ data, centerValue, centerLabel = 'Total', valueFormat = 'percent', className }: DonutProps) {
  const vf = valueFormat === 'dollars' ? fmt.currencyCompact : valueFormat === 'number' ? fmt.number : (n: number) => fmt.percent(n > 1 ? n / 100 : n);
  return (
    <ChartContainer config={cfgFrom(data)} className={className}>
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

/** Treemap — nested spend by channel; area = budget. */
export function TreemapChart({ data, className }: { data: Slice[]; className?: string }) {
  const rows = data.map((s, i) => ({ name: s.label, size: s.value, fill: colorAt(i, s.color) }));
  const Node = (p: any) => {
    const { x, y, width, height, name, size, fill } = p;
    if (width <= 0 || height <= 0) return null;
    return (
      <g>
        <rect x={x + 1} y={y + 1} width={width - 2} height={height - 2} rx={4} fill={fill} />
        {width > 54 && height > 28 && (
          <>
            <text x={x + 8} y={y + 18} fontSize={11} fontWeight={700} fill="#fff">{name}</text>
            <text x={x + 8} y={y + 33} fontSize={11} fill="rgba(255,255,255,.85)" className="tabular-nums">{size}%</text>
          </>
        )}
      </g>
    );
  };
  return (
    <ChartContainer config={cfgFrom(data)} className={className}>
      <Treemap data={rows} dataKey="size" stroke="transparent" content={<Node />} isAnimationActive={false}>
        <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
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
