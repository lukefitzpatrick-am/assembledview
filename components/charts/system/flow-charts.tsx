'use client';
/**
 * AssembledView charts — FLOW & VARIANCE
 * WaterfallChart · BulletChart · SankeyChart
 * "Recharts +custom" tier — composed from primitives.
 */
import * as React from 'react';
import {
  BarChart as RBarChart, Bar, Cell, CartesianGrid, XAxis, YAxis, Sankey, Tooltip, Layer, Rectangle,
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { fmt, NEUTRAL, STATUS, CHART_PALETTE } from '@/lib/chart-theme';
import { waterfallBars, type WaterfallStep } from '@/lib/chart-utils';

const axisProps = { tickLine: false, axisLine: false, tick: { fontSize: 11, fill: NEUTRAL.axis } } as const;

/** Waterfall — budget → spend by channel → remaining. */
export function WaterfallChart({
  steps, valueFormat = 'dollars', className,
}: { steps: WaterfallStep[]; valueFormat?: 'dollars' | 'number' | 'compact'; className?: string }) {
  const vf = valueFormat === 'dollars' ? fmt.currencyCompact : valueFormat === 'number' ? fmt.number : fmt.compact;
  const bars = waterfallBars(steps);
  const rows = bars.map((b) => ({
    label: b.label,
    base: b.base,
    span: b.top - b.base,
    fill: b.kind === 'total' ? NEUTRAL.ink : b.kind === 'end' ? STATUS.ahead : b.rise ? STATUS.ahead : STATUS.critical,
  }));
  return (
    <ChartContainer config={{ span: { label: 'Value' } }} className={className}>
      <RBarChart data={rows} margin={{ top: 8, right: 14, left: 4, bottom: 4 }} barCategoryGap="32%">
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis tickFormatter={vf} width={44} {...axisProps} />
        <ChartTooltip content={<ChartTooltipContent hideLabel formatter={(v) => vf(Number(v))} />} />
        <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="span" stackId="w" radius={2.5} isAnimationActive={false}>
          {rows.map((r, i) => <Cell key={i} fill={r.fill} />)}
        </Bar>
      </RBarChart>
    </ChartContainer>
  );
}

export interface BulletRow {
  label: string;
  measure: number;   // actual (0–100)
  target: number;    // target tick (0–100)
  bands?: [number, number]; // qualitative band breaks, default [60, 80]
}

/** Bullet — actual vs target against qualitative bands. Pure SVG. */
export function BulletChart({ rows, className }: { rows: BulletRow[]; className?: string }) {
  const W = 600, rowH = 46, H = rows.length * rowH + 8, x0 = 96, x1 = W - 20;
  const sx = (v: number) => x0 + (x1 - x0) * v / 100;
  return (
    <div className={className}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        {rows.map((row, i) => {
          const y = 10 + rowH * i, bh = 16;
          const [b1, b2] = row.bands ?? [60, 80];
          const bands: [number, number, string][] = [[0, b1, '#eef1ea'], [b1, b2, '#e1e7dd'], [b2, 100, '#d4dccf']];
          return (
            <g key={i}>
              {bands.map((b, bi) => (
                <rect key={bi} x={sx(b[0])} y={y} width={sx(b[1]) - sx(b[0])} height={bh} fill={b[2]} />
              ))}
              <rect x={x0} y={y + 4} width={sx(row.measure) - x0} height={bh - 8} rx={1} fill={STATUS.ahead} />
              <line x1={sx(row.target)} x2={sx(row.target)} y1={y - 3} y2={y + bh + 3} stroke={NEUTRAL.ink} strokeWidth={2} />
              <text x={x0 - 10} y={y + bh / 2 + 3.5} textAnchor="end" fontSize={10} fontWeight={600} fill={NEUTRAL.label}>{row.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export interface SankeyData {
  nodes: { name: string }[];
  links: { source: number; target: number; value: number }[];
}

const SankeyNode = ({ x, y, width, height, index, payload }: any) => (
  <Layer key={`node-${index}`}>
    <Rectangle x={x} y={y} width={width} height={height} fill={CHART_PALETTE[index % CHART_PALETTE.length]} radius={2} />
    <text x={x < 100 ? x - 6 : x + width + 6} y={y + height / 2} textAnchor={x < 100 ? 'end' : 'start'}
      dominantBaseline="middle" fontSize={9.5} fontWeight={600} fill={NEUTRAL.label}>
      {payload.name}
    </text>
  </Layer>
);

/** Sankey — flow of budget → objective → outcome. */
export function SankeyChart({ data, className }: { data: SankeyData; className?: string }) {
  return (
    <ChartContainer config={{}} className={className}>
      <Sankey
        data={data}
        node={<SankeyNode />}
        nodePadding={26} nodeWidth={12}
        link={{ stroke: 'var(--av-chart-1)', strokeOpacity: 0.22 } as any}
        margin={{ top: 8, right: 90, bottom: 8, left: 60 }}
      >
        <Tooltip />
      </Sankey>
    </ChartContainer>
  );
}
