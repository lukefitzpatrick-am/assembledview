'use client';
/**
 * AssembledView charts — CUSTOM SVG (zero extra dependencies)
 * SunburstChart · MarimekkoChart · CalendarHeatmap
 *
 * These three aren't in Recharts. Rather than pull in ECharts/nivo, they're
 * hand-drawn SVG using the shared tokens + chart-utils geometry. If you'd
 * rather use a library, the data shapes below map directly onto
 * echarts `series.sunburst`, a marimekko plugin, and `cal-heatmap`.
 */
import * as React from 'react';
import { annularSector, seededRandom, round } from '@/lib/chart-utils';
import { SEQUENTIAL, CHART_PALETTE, NEUTRAL } from '@/lib/chart-theme';

// ── Sunburst ────────────────────────────────────────────────
export interface SunburstNode { name: string; value: number; color?: string; children?: { name: string; value: number }[] }

/** Two-ring hierarchy: channel → format. */
export function SunburstChart({ data, size = 200, className }: { data: SunburstNode[]; size?: number; className?: string }) {
  const cx = size / 2, cy = size / 2;
  const r0 = size * 0.13, r1 = size * 0.26, r2 = size * 0.39;
  const total = data.reduce((s, d) => s + d.value, 0);
  const inner: React.ReactNode[] = [];
  const outer: React.ReactNode[] = [];
  let a = -Math.PI / 2;
  data.forEach((seg, i) => {
    const ang = (2 * Math.PI * seg.value) / total;
    const col = seg.color ?? CHART_PALETTE[i % CHART_PALETTE.length];
    inner.push(<path key={`i${i}`} d={annularSector(cx, cy, r0, r1, a, a + ang)} fill={col} />);
    const kids = seg.children ?? [];
    const ktot = kids.reduce((s, k) => s + k.value, 0) || 1;
    let ka = a;
    kids.forEach((k, ki) => {
      const kang = ang * (k.value / ktot);
      outer.push(<path key={`o${i}-${ki}`} d={annularSector(cx, cy, r1 + 2, r2, ka, ka + kang)} fill={col} />);
      outer.push(<path key={`s${i}-${ki}`} d={annularSector(cx, cy, r1 + 2, r2, ka, ka + kang)} fill={`rgba(255,255,255,${ki * 0.16})`} />);
      ka += kang;
    });
    a += ang;
  });
  return (
    <div className={className}>
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ display: 'block' }}>
        {inner}{outer}
        <circle cx={cx} cy={cy} r={r0 - 2} fill="var(--av-subsurface)" />
      </svg>
    </div>
  );
}

// ── Marimekko ───────────────────────────────────────────────
export interface MekkoColumn { name: string; weight: number; segments: { value: number; color: string }[] }

/** Variable-width columns (size = weight) each stacked 100%. */
export function MarimekkoChart({ columns, width = 600, height = 150, className }: { columns: MekkoColumn[]; width?: number; height?: number; className?: string }) {
  const gap = 3, totalW = columns.reduce((s, c) => s + c.weight, 0);
  const drawable = width - gap * (columns.length - 1);
  let x = 0;
  const rects: React.ReactNode[] = [];
  const labels: React.ReactNode[] = [];
  columns.forEach((col, ci) => {
    const cw = (drawable * col.weight) / totalW;
    const segTotal = col.segments.reduce((s, sg) => s + sg.value, 0) || 1;
    let y = 0;
    col.segments.forEach((sg, si) => {
      const sh = (height * sg.value) / segTotal;
      rects.push(<rect key={`m${ci}-${si}`} x={round(x)} y={round(y)} width={round(cw)} height={round(sh - 1)} fill={sg.color} />);
      y += sh;
    });
    labels.push(
      <text key={`l${ci}`} x={round(x + cw / 2)} y={height + 13} textAnchor="middle" fontSize={9.5} fontWeight={600} fill={NEUTRAL.axis}>
        {col.name} {Math.round((col.weight / totalW) * 100)}%
      </text>,
    );
    x += cw + gap;
  });
  return (
    <div className={className}>
      <svg viewBox={`0 0 ${width} ${height + 18}`} width="100%" style={{ display: 'block' }}>{rects}{labels}</svg>
    </div>
  );
}

// ── Calendar heatmap ────────────────────────────────────────
export interface HeatCell { week: number; day: number; value: number } // value 0..1 (normalised)

/**
 * Density grid (7 days × N weeks). Pass real `cells` (value 0..1) or omit to
 * render seeded demo data for layout preview.
 */
export function CalendarHeatmap({
  weeks = 12, cells, caption, width = 600, height = 150, className,
}: { weeks?: number; cells?: HeatCell[]; caption?: string; width?: number; height?: number; className?: string }) {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const x0 = 24, y0 = 10, cell = (width - x0 - 8) / weeks, ch = (height - y0 - 16) / 7;
  const lookup = new Map<string, number>();
  if (cells) cells.forEach((c) => lookup.set(`${c.day}-${c.week}`, c.value));
  const rnd = seededRandom(7);
  const seqIdx = (t: number) => SEQUENTIAL[Math.min(SEQUENTIAL.length - 1, Math.floor(t * SEQUENTIAL.length))];
  const els: React.ReactNode[] = [];
  for (let d = 0; d < 7; d++) {
    els.push(<text key={`d${d}`} x={x0 - 6} y={y0 + ch * d + ch / 2 + 3} textAnchor="end" fontSize={8} fill={NEUTRAL.axis}>{days[d]}</text>);
    for (let w = 0; w < weeks; w++) {
      const v = lookup.has(`${d}-${w}`) ? lookup.get(`${d}-${w}`)! : Math.pow(rnd(), 1.4);
      els.push(<rect key={`c${d}-${w}`} x={round(x0 + cell * w)} y={round(y0 + ch * d)} width={round(cell - 3)} height={round(ch - 3)} rx={2} fill={seqIdx(v)} />);
    }
  }
  if (caption) els.push(<text key="cap" x={x0} y={height - 2} fontSize={9} fill={NEUTRAL.axis}>{caption}</text>);
  return (
    <div className={className}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: 'block' }}>{els}</svg>
    </div>
  );
}
