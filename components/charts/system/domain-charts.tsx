'use client';
/**
 * AssembledView charts — DOMAIN / FLIGHTING (zero extra dependencies)
 * MediaGanttChart · BurstGrid · MatrixHeatmap · PacingBandChart · BoxPlotChart
 *
 * These are AssembledView-specific visualisations the generic 27-chart core
 * doesn't cover. All pure SVG on the shared tokens — no Recharts, no ECharts.
 *
 * MediaGanttChart is the important one: ONE flexible flight/Gantt component
 * intended to back all three in-app usages — the burst editor, the
 * MediaContainerTimeline, and the campaign calendar. Feed it rows of bursts.
 */
import * as React from 'react';
import { round } from '@/lib/chart-utils';
import { CHART_PALETTE, CHANNEL_COLORS, SEQUENTIAL, NEUTRAL, fmt } from '@/lib/chart-theme';

const INK = NEUTRAL.ink, MUTED = NEUTRAL.axis, MID = NEUTRAL.label, GRID = NEUTRAL.grid;
const TAB: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' };

// ── Media flighting Gantt ───────────────────────────────────
export interface GanttBurst {
  startWeek: number;        // 0-indexed week the burst starts
  endWeek: number;          // exclusive end week
  label?: string;           // e.g. "$46k" / "320 TARP"
  intensity?: number;       // 0..1 — weight/share, drives fill opacity
}
export interface GanttRow {
  label: string;            // line item (publisher / placement)
  sub?: string;             // channel
  color?: string;           // defaults to a CHANNEL_COLORS hue or palette
  bursts: GanttBurst[];
}
export interface MediaGanttProps {
  rows: GanttRow[];
  weeks?: number;           // total weeks on the timeline (default 24)
  months?: string[];        // month header labels
  weeksPerMonth?: number;   // default 4
  todayWeek?: number | null;
  rowHeight?: number;
  className?: string;
}

export function MediaGanttChart({
  rows, weeks = 24, months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
  weeksPerMonth = 4, todayWeek = null, rowHeight = 38, className,
}: MediaGanttProps) {
  const W = 1180, headH = 44, padL = 160, x1 = W - 16;
  const H = headH + rows.length * rowHeight + 8;
  const weekW = (x1 - padL) / weeks;
  const wx = (w: number) => padL + weekW * w;
  const els: React.ReactNode[] = [];

  rows.forEach((_, ri) => {
    if (ri % 2 === 0) els.push(<rect key={`rb${ri}`} x={0} y={round(headH + ri * rowHeight)} width={W} height={rowHeight} fill="var(--av-subsurface)" />);
  });
  months.forEach((m, i) => {
    const mx = wx(i * weeksPerMonth);
    els.push(<rect key={`mb${i}`} x={round(mx)} y={8} width={round(weekW * weeksPerMonth - 3)} height={20} rx={5} fill={i % 2 ? 'var(--av-grid)' : 'var(--av-subsurface)'} />);
    els.push(<text key={`mt${i}`} x={round(mx + weekW * weeksPerMonth / 2)} y={22} textAnchor="middle" fontSize={10} fontWeight={700} fill={MID} letterSpacing=".06em">{m.toUpperCase()}</text>);
  });
  for (let w = 0; w <= weeks; w++) {
    els.push(<line key={`wk${w}`} x1={round(wx(w))} x2={round(wx(w))} y1={headH - 4} y2={H - 6} stroke="var(--av-grid)" strokeWidth={1} />);
  }
  rows.forEach((row, ri) => {
    const y = headH + ri * rowHeight;
    const color = row.color ?? CHANNEL_COLORS[(row.sub ?? '').toLowerCase()] ?? CHART_PALETTE[ri % CHART_PALETTE.length];
    els.push(<rect key={`sw${ri}`} x={14} y={round(y + rowHeight / 2 - 7)} width={4} height={14} rx={2} fill={color} />);
    els.push(<text key={`rl${ri}`} x={26} y={round(y + rowHeight / 2 - 1)} fontSize={12} fontWeight={700} fill={INK}>{row.label}</text>);
    if (row.sub) els.push(<text key={`rs${ri}`} x={26} y={round(y + rowHeight / 2 + 12)} fontSize={9.5} fill={MUTED}>{row.sub}</text>);
    row.bursts.forEach((b, bi) => {
      const bx = wx(b.startWeek), bw = weekW * (b.endWeek - b.startWeek) - 3, by = y + rowHeight / 2 - 9, bh = 18;
      els.push(<rect key={`bg${ri}-${bi}`} x={round(bx + 1)} y={round(by)} width={round(bw)} height={bh} rx={5} fill={color} fillOpacity={0.16} />);
      els.push(<rect key={`bf${ri}-${bi}`} x={round(bx + 1)} y={round(by)} width={round(bw)} height={bh} rx={5} fill={color} fillOpacity={(b.intensity ?? 0.85) * 0.92} />);
      if (bw > 48 && b.label) els.push(<text key={`bl${ri}-${bi}`} x={round(bx + 9)} y={round(by + 12.5)} fontSize={10} fontWeight={700} fill="#fff" style={TAB}>{b.label}</text>);
    });
  });
  if (todayWeek != null) {
    els.push(<line key="tl" x1={round(wx(todayWeek))} x2={round(wx(todayWeek))} y1={headH - 12} y2={H - 6} stroke={INK} strokeWidth={1.5} strokeDasharray="3 3" />);
    els.push(<rect key="tb" x={round(wx(todayWeek) - 19)} y={headH - 24} width={38} height={14} rx={7} fill={INK} />);
    els.push(<text key="tt" x={round(wx(todayWeek))} y={headH - 14} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="#fff">TODAY</text>);
  }
  return <div className={className}><svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>{els}</svg></div>;
}

// ── Burst week-grid (expert editor) ─────────────────────────
export interface BurstCell { startWeek: number; endWeek: number; label: string; color?: string }
export interface BurstRow { label: string; cells: BurstCell[] }

export function BurstGrid({ rows, weeks = 12, className }: { rows: BurstRow[]; weeks?: number; className?: string }) {
  const W = 560, padL = 84, x1 = W - 8, headH = 22, rowH = 30;
  const H = headH + rows.length * rowH + 4, cw = (x1 - padL) / weeks;
  const els: React.ReactNode[] = [];
  for (let w = 0; w < weeks; w++) els.push(<text key={`wn${w}`} x={round(padL + cw * w + cw / 2)} y={14} textAnchor="middle" fontSize={8.5} fill={MUTED} fontWeight={600} style={TAB}>{`W${w + 1}`}</text>);
  rows.forEach((row, ri) => {
    const y = headH + ri * rowH;
    els.push(<text key={`gl${ri}`} x={padL - 8} y={round(y + rowH / 2 + 3)} textAnchor="end" fontSize={10} fontWeight={700} fill={INK}>{row.label}</text>);
    for (let w = 0; w < weeks; w++) els.push(<rect key={`gc${ri}-${w}`} x={round(padL + cw * w) + 0.5} y={round(y) + 0.5} width={round(cw) - 1} height={rowH - 1} fill="var(--av-surface)" stroke="var(--av-grid)" strokeWidth={1} />);
  });
  rows.forEach((row, ri) => {
    const y = headH + ri * rowH;
    row.cells.forEach((c, ci) => {
      const bx = padL + cw * c.startWeek, bw = cw * (c.endWeek - c.startWeek + 1);
      els.push(<rect key={`mc${ri}-${ci}`} x={round(bx) + 2} y={round(y) + 3} width={round(bw) - 4} height={rowH - 6} rx={4} fill={c.color ?? CHART_PALETTE[ri % CHART_PALETTE.length]} />);
      els.push(<text key={`mt${ri}-${ci}`} x={round(bx + bw / 2)} y={round(y + rowH / 2 + 3.5)} textAnchor="middle" fontSize={9} fontWeight={700} fill="#fff">{c.label}</text>);
    });
  });
  return <div className={className}><svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>{els}</svg></div>;
}

// ── Matrix heatmap (2-D, e.g. daypart × day) ────────────────
export function MatrixHeatmap({
  rows, cols, values, showValues = true, className,
}: { rows: string[]; cols: string[]; values: number[][]; showValues?: boolean; className?: string }) {
  const W = 560, padL = 78, padT = 20, x1 = W - 10, gap = 3;
  const cw = (x1 - padL) / cols.length, ch = 26, H = padT + rows.length * ch + 22;
  const seq = (v: number) => SEQUENTIAL[Math.min(SEQUENTIAL.length - 1, Math.floor(v * SEQUENTIAL.length))];
  const els: React.ReactNode[] = [];
  cols.forEach((c, i) => els.push(<text key={`dh${i}`} x={round(padL + cw * i + cw / 2)} y={14} textAnchor="middle" fontSize={9} fill={MUTED} fontWeight={600}>{c}</text>));
  rows.forEach((p, ri) => {
    els.push(<text key={`ph${ri}`} x={padL - 8} y={round(padT + ch * ri + ch / 2 + 3)} textAnchor="end" fontSize={9.5} fill={MID} fontWeight={600}>{p}</text>);
    cols.forEach((_, ci) => {
      const v = values[ri][ci];
      els.push(<rect key={`mh${ri}-${ci}`} x={round(padL + cw * ci) + gap / 2} y={round(padT + ch * ri) + gap / 2} width={round(cw) - gap} height={ch - gap} rx={3} fill={seq(v)} />);
      if (showValues) els.push(<text key={`mv${ri}-${ci}`} x={round(padL + cw * ci + cw / 2)} y={round(padT + ch * ri + ch / 2 + 3)} textAnchor="middle" fontSize={8.5} fontWeight={700} fill={v > 0.6 ? '#fff' : MID} style={TAB}>{Math.round(v * 100)}</text>);
    });
  });
  els.push(<text key="lgl" x={padL} y={H - 3} fontSize={8.5} fill={MUTED}>Low</text>);
  SEQUENTIAL.forEach((c, i) => els.push(<rect key={`lr${i}`} x={padL + 22 + i * 12} y={H - 11} width={11} height={8} rx={1} fill={c} />));
  els.push(<text key="lgh" x={padL + 22 + SEQUENTIAL.length * 12 + 5} y={H - 3} fontSize={8.5} fill={MUTED}>High</text>);
  return <div className={className}><svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>{els}</svg></div>;
}

// ── Pacing vs target band ───────────────────────────────────
const smooth = (p: [number, number][]) => {
  if (p.length < 3) return p.map((q, i) => (i ? 'L' : 'M') + round(q[0]) + ' ' + round(q[1])).join(' ');
  let d = 'M' + round(p[0][0]) + ' ' + round(p[0][1]);
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    d += ' C' + round(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + round(p1[1] + (p2[1] - p0[1]) / 6) + ' ' + round(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + round(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + round(p2[0]) + ' ' + round(p2[1]);
  }
  return d;
};
const poly = (p: [number, number][]) => p.map((q, i) => (i ? 'L' : 'M') + round(q[0]) + ' ' + round(q[1])).join(' ');

export function PacingBandChart({
  actual, target, tolerance = 8, weekLabels, className,
}: { actual: number[]; target?: number[]; tolerance?: number; weekLabels?: string[]; className?: string }) {
  const w = 600, hh = 200, x0 = 34, x1 = w - 12, y0 = 14, y1 = hh - 22, ymax = 100, n = actual.length;
  const sx = (i: number) => x0 + (x1 - x0) * i / (n - 1), sy = (v: number) => y1 + (y0 - y1) * v / ymax;
  const mid = target ?? Array.from({ length: n }, (_, i) => (i / (n - 1)) * 100);
  const up = mid.map((v) => Math.min(100, v + tolerance)), lo = mid.map((v) => Math.max(0, v - tolerance));
  const els: React.ReactNode[] = [];
  for (let k = 0; k <= 4; k++) { const v = ymax * k / 4, yy = y1 + (y0 - y1) * v / ymax; els.push(<line key={`g${k}`} x1={x0} x2={x1} y1={round(yy)} y2={round(yy)} stroke={GRID} strokeWidth={1} />); els.push(<text key={`gl${k}`} x={x0 - 6} y={round(yy) + 3} textAnchor="end" fontSize={9} fill={MUTED} style={TAB}>{Math.round(v)}%</text>); }
  const upPts = up.map((v, i) => [sx(i), sy(v)] as [number, number]);
  const loPts = lo.map((v, i) => [sx(i), sy(v)] as [number, number]).reverse();
  els.push(<path key="band" d={poly(upPts) + ' L' + poly(loPts).slice(1) + ' Z'} fill="#008E5E" fillOpacity={0.1} />);
  els.push(<path key="mid" d={poly(mid.map((v, i) => [sx(i), sy(v)]))} fill="none" stroke="#008E5E" strokeWidth={1.5} strokeDasharray="4 3" strokeOpacity={0.55} />);
  els.push(<path key="act" d={smooth(actual.map((v, i) => [sx(i), sy(v)]))} fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />);
  els.push(<circle key="ld" cx={round(sx(n - 1))} cy={round(sy(actual[n - 1]))} r={3.5} fill={INK} />);
  (weekLabels ?? []).forEach((lb, i) => lb && els.push(<text key={`x${i}`} x={round(sx(i))} y={hh - 7} textAnchor="middle" fontSize={9} fill={MUTED}>{lb}</text>));
  const ly = 10;
  els.push(<rect key="k1" x={x0} y={ly - 7} width={14} height={8} rx={2} fill="#008E5E" fillOpacity={0.18} />);
  els.push(<text key="k1t" x={x0 + 18} y={ly} fontSize={9} fill={MID}>Expected range</text>);
  els.push(<line key="k2" x1={x0 + 114} x2={x0 + 130} y1={ly - 3} y2={ly - 3} stroke="#008E5E" strokeWidth={1.5} strokeDasharray="4 3" />);
  els.push(<text key="k2t" x={x0 + 134} y={ly} fontSize={9} fill={MID}>Target</text>);
  els.push(<line key="k3" x1={x0 + 172} x2={x0 + 188} y1={ly - 3} y2={ly - 3} stroke={INK} strokeWidth={2.4} />);
  els.push(<text key="k3t" x={x0 + 192} y={ly} fontSize={9} fill={MID}>Actual delivery</text>);
  return <div className={className}><svg viewBox={`0 0 ${w} ${hh}`} width="100%" style={{ display: 'block' }}>{els}</svg></div>;
}

// ── Boxplot ─────────────────────────────────────────────────
export interface BoxStat { label: string; min: number; q1: number; med: number; q3: number; max: number; outliers?: number[]; color?: string }

export function BoxPlotChart({ data, valueFormat = 'dollars', max, className }: { data: BoxStat[]; valueFormat?: 'dollars' | 'number'; max?: number; className?: string }) {
  const w = 600, hh = 200, x0 = 34, x1 = w - 12, y0 = 14, y1 = hh - 22;
  const ymax = max ?? Math.ceil(Math.max(...data.flatMap((g) => [g.max, ...(g.outliers ?? [])])) * 1.1);
  const n = data.length, step = (x1 - x0) / n, bw = step * 0.4;
  const sy = (v: number) => y1 + (y0 - y1) * v / ymax;
  const vf = valueFormat === 'dollars' ? (v: number) => '$' + Math.round(v) : (v: number) => fmt.number(v);
  const els: React.ReactNode[] = [];
  for (let k = 0; k <= 4; k++) { const v = ymax * k / 4, yy = y1 + (y0 - y1) * v / ymax; els.push(<line key={`g${k}`} x1={x0} x2={x1} y1={round(yy)} y2={round(yy)} stroke={GRID} strokeWidth={1} />); els.push(<text key={`gl${k}`} x={x0 - 6} y={round(yy) + 3} textAnchor="end" fontSize={9} fill={MUTED} style={TAB}>{vf(v)}</text>); }
  data.forEach((g, i) => {
    const cx = x0 + step * i + step / 2, col = g.color ?? CHART_PALETTE[i % CHART_PALETTE.length];
    els.push(<line key={`wk${i}`} x1={cx} x2={cx} y1={round(sy(g.max))} y2={round(sy(g.min))} stroke={col} strokeWidth={1.5} />);
    els.push(<line key={`wt${i}`} x1={cx - 6} x2={cx + 6} y1={round(sy(g.max))} y2={round(sy(g.max))} stroke={col} strokeWidth={1.5} />);
    els.push(<line key={`wb${i}`} x1={cx - 6} x2={cx + 6} y1={round(sy(g.min))} y2={round(sy(g.min))} stroke={col} strokeWidth={1.5} />);
    els.push(<rect key={`bx${i}`} x={round(cx - bw / 2)} y={round(sy(g.q3))} width={round(bw)} height={round(sy(g.q1) - sy(g.q3))} rx={3} fill={col} fillOpacity={0.18} stroke={col} strokeWidth={1.5} />);
    els.push(<line key={`md${i}`} x1={round(cx - bw / 2)} x2={round(cx + bw / 2)} y1={round(sy(g.med))} y2={round(sy(g.med))} stroke={col} strokeWidth={2.4} />);
    (g.outliers ?? []).forEach((o, oi) => els.push(<circle key={`ot${i}-${oi}`} cx={cx} cy={round(sy(o))} r={2.6} fill="none" stroke={col} strokeWidth={1.4} />));
    els.push(<text key={`bl${i}`} x={cx} y={hh - 7} textAnchor="middle" fontSize={9.5} fill={MUTED}>{g.label}</text>);
  });
  return <div className={className}><svg viewBox={`0 0 ${w} ${hh}`} width="100%" style={{ display: 'block' }}>{els}</svg></div>;
}
